import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = fileURLToPath(new URL('./fixtures/full-backup.json', import.meta.url));

interface Snapshot {
  data?: {
    profile?: { name?: string };
    settings?: { region?: string };
    regions?: Record<string, { profile?: { summary?: string } }>;
  };
}

async function saveDownload(page: Page, trigger: () => Promise<void>, name: string): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const dir = await mkdtemp(join(tmpdir(), 'gmo-resume-'));
  const path = join(dir, name);
  await download.saveAs(path);
  return path;
}

async function importFixture(page: Page): Promise<void> {
  await page.goto('/');
  await page.setInputFiles('#file-input', FIXTURE);
  await expect(page.locator('#resume .r-name')).toHaveText('Ada Fixture');
}

async function openExportPanel(page: Page): Promise<void> {
  await page.locator('#tabs [data-tab="settings"]').click();
  await page.locator('[data-subtab="settings"][data-value="export"]').click();
  await expect(page.locator('[data-action="export-download"]')).toBeVisible();
}

/** Leaves only the named formats ticked, so one download comes out rather than a ZIP. */
async function onlyFormats(page: Page, keep: string[]): Promise<void> {
  for (const kind of ['pdf', 'docx', 'png', 'txt', 'md', 'json']) {
    const box = page.locator(`[data-format="${kind}"]`);
    if (keep.indexOf(kind) === -1) {
      if (await box.isChecked()) await box.uncheck();
    } else if (!(await box.isChecked())) {
      await box.check();
    }
  }
}

test('opens with the builder and the preview, and no console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');

  await expect(page.locator('#editor-panel')).toBeVisible();
  await expect(page.locator('#resume')).toBeVisible();
  await expect(page.locator('#tabs [data-tab]')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('imports a full backup and shows the resume it carries', async ({ page }) => {
  await importFixture(page);

  await expect(page.locator('[data-path="profile.name"]')).toHaveValue('Ada Fixture');
  await expect(page.locator('#resume .r-entry-title').first()).toHaveText('Test engineer');
});

test('says under the field what the other market holds', async ({ page }) => {
  await importFixture(page);

  /* The fixture is an American CV with a separate GCC text, so the summary carries the
     per-market note and its Open GCC button, right under the field. */
  const note = page.locator('.field-region').filter({ hasText: 'GCC has different text here' });
  await expect(note).toBeVisible();
  await expect(note.locator('[data-action="open-region-gcc"]')).toHaveText('Open GCC');
});

test('the export and import suite passes in the browser', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');

  await page.locator('#tabs [data-tab="settings"]').click();
  await page.locator('[data-action="verify"]').click();

  const report = page.locator('#verify-report');
  await expect(report).toBeVisible({ timeout: 150_000 });
  await expect(report).toContainText('ALL PASS');
  await expect(report).toContainText('per-region · field notes');
  await expect(report).toContainText('portrait · PDF, DOCX and PNG');
});

test('a PDF carries the resume back', async ({ page }) => {
  await importFixture(page);
  await openExportPanel(page);
  await onlyFormats(page, ['pdf']);

  const path = await saveDownload(page, () => page.locator('[data-action="export-download"]').click(), 'resume.pdf');
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 4).toString('latin1')).toBe('%PDF');
  expect(bytes.toString('latin1')).toContain('gmo-resume-data:');

  await page.setInputFiles('#file-input', path);
  await expect(page.locator('#resume .r-name')).toHaveText('Ada Fixture');
});

test('the JSON export keeps every market text', async ({ page }) => {
  await importFixture(page);
  await openExportPanel(page);
  await onlyFormats(page, ['json']);

  const path = await saveDownload(page, () => page.locator('[data-action="export-download"]').click(), 'resume.json');
  const exported = JSON.parse(await readFile(path, 'utf8')) as Snapshot;
  const fixture = JSON.parse(await readFile(FIXTURE, 'utf8')) as Snapshot;

  expect(exported.data?.profile?.name).toBe('Ada Fixture');
  expect(exported.data?.settings?.region).toBe('us');
  expect(exported.data?.regions?.gcc?.profile?.summary).toBe(fixture.data?.regions?.gcc?.profile?.summary);
});
