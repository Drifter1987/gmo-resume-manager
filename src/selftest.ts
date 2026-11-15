/*
 * Round-trip verification: builds every export from a state, imports it back,
 * and compares the rebuilt state against the original. Exposed as
 * window.__gmoResumeTest() from the console, and as the "Verify" button in
 * Settings → Data, so the export/import chain can be checked on any device.
 */
import { buildDocx } from './docx';
import { toJson, toMarkdown, toPlainText } from './format';
import { parseImportBytes } from './parse';
import { buildPdf } from './pdf';
import { buildPngPages } from './png';
import { createZip } from './zip';
import { APP_VERSION } from './version';

const P = (name, ...rest) => ({
  name,
  headline: 'Test engineer · colour round trip',
  email: 'test@example.com',
  phone: '+49 177 000 000',
  location: 'München, Germany',
  website: 'example.dev',
  linkedin: 'linkedin.com/in/test-user',
  summary: 'First paragraph with | pipe and an umlaut: äöü — dash.\n\nSecond paragraph after a blank line.'
});

const PROFILES = [P('Ada Lovelace'), P('Åse Möller'), P('李小龙')];

function sampleState(profile) {
  return {
    profile,
    experience: [
      {
        id: 'e1',
        role: 'Senior test engineer',
        company: 'ACME GmbH',
        location: 'München, Bavaria',
        start: 'Oct 2020',
        end: '',
        current: true,
        highlights:
          'Led the | pipe | escape study\nBuilt the pipeline from nothing.\nOwned the review rota.',
        tags: 'TypeScript, WebGL, data round trips'
      },
      {
        id: 'e2',
        role: 'Engineer',
        company: 'Boring Co',
        location: 'Remote',
        start: 'Jan 2018',
        end: 'Sep 2020',
        current: false,
        highlights: 'Shipped the thing.\nFixed the other thing.',
        tags: ''
      }
    ],
    education: [
      {
        id: 'f1',
        school: 'TU München',
        degree: 'MSc',
        field: 'Electrical & Computer Engineering',
        location: 'München',
        start: '2013',
        end: '2015',
        details: 'Grade 1.3.\nThesis on export fidelity.'
      }
    ],
    certifications: [
      { id: 'c1', name: 'MATLAB Onramp', issuer: 'MathWorks', date: 'Jan 2021', expires: '', link: '' },
      { id: 'c2', name: 'ISO 26262 | Functional Safety', issuer: 'Akkodis', date: 'Feb 2021', expires: 'Jul 2027', link: 'https://example.com/cert/iso' },
      { id: 'c3', name: 'Deep Learning', issuer: 'Vector', date: 'Mar 2021', expires: '', link: '' }
    ],
    projects: [
      {
        id: 'p1',
        name: 'Roundtrip',
        link: 'example.dev/roundtrip',
        description: 'A | pipe | and an umlaut — äöü.',
        tech: 'TS, Canvas'
      }
    ],
    skills: [
      { id: 's1', label: 'Languages', items: 'TypeScript, German (äöü), 中文' },
      { id: 's2', label: 'A very long label indeed', items: 'A value that wraps onto its own line, twice even.' }
    ],
    settings: {
      theme: 'light',
      colorMode: 'bw',
      font: 'serif',
      density: 'compact',
      showSummary: true,
      showTags: true,
      sections: { experience: true, education: true, certifications: true, projects: true, skills: false }
    }
  };
}

/** Compare two states field by field; returns a list of differences. */
function diff(expected, actual, path = '', out = []) {
  if (typeof expected !== typeof actual) {
    out.push(path + ' (type)');
    return out;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || expected.length !== actual.length) {
      out.push(`${path} (length ${expected.length} vs ${actual ? actual.length : 'none'})`);
      return out;
    }
    expected.forEach((value, index) => diff(value, actual[index], `${path}[${index}]`, out));
    return out;
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') {
      out.push(path + ' (missing)');
      return out;
    }
    Object.keys(expected).forEach((key) => diff(expected[key], actual[key], path ? path + '.' + key : key, out));
    return out;
  }
  if (expected !== actual) out.push(path + ': "' + expected + '" → "' + actual + '"');
  return out;
}

async function* buildAll(state) {
  const stamp = '01.jan.2027-10.00';
  yield { name: 'JSON', blob: new Blob([toJson(state)], { type: 'application/json' }), file: stamp + '.json' };
  yield { name: 'Markdown', blob: new Blob([toMarkdown(state)], { type: 'text/markdown' }), file: stamp + '.md' };
  yield { name: 'TXT', blob: new Blob([toPlainText(state)], { type: 'text/plain' }), file: stamp + '.txt' };
  yield { name: 'PDF', blob: buildPdf(state), file: stamp + '.pdf' };
  yield { name: 'DOCX', blob: buildDocx(state), file: stamp + '.docx' };

  const pages = await buildPngPages(state);
  for (let i = 0; i < pages.length; i += 1) {
    yield {
      name: 'PNG page ' + (i + 1),
      blob: pages[i],
      file: stamp + (pages.length > 1 ? '-' + (i + 1) : '') + '.png'
    };
  }

  const jsonBytes = new Uint8Array(await new Blob([toJson(state)]).arrayBuffer());
  yield {
    name: 'ZIP bundle',
    blob: new Blob([createZip([
      { name: stamp + '.json', data: jsonBytes },
      { name: stamp + '.md', data: new Uint8Array(await new Blob([toMarkdown(state)]).arrayBuffer()) }
    ])], { type: 'application/zip' }),
    file: stamp + '.zip'
  };
}

function flatten(state) {
  // Compare everything the writers and parsers are expected to carry, ignoring ids
  // (parsers cannot know them) and skill items written as one line.
  const clean = JSON.parse(JSON.stringify(state));
  const drop = (list) =>
    (list || []).forEach((item) => {
      delete item.id;
    });
  drop(clean.experience);
  drop(clean.education);
  drop(clean.certifications);
  drop(clean.projects);
  drop(clean.skills);
  return clean;
}

export async function runRoundTrip() {
  const results = [];
  const failures = [];

  for (const profile of PROFILES) {
    const original = sampleState(profile);
    const expected = flatten(original);

    for await (const item of buildAll(original)) {
      const bytes = new Uint8Array(await item.blob.arrayBuffer());
      try {
        const imported = await parseImportBytes(item.file, bytes);
        const got = flatten(imported.state);
        const problems = diff(expected, got);
        results.push({
          label: profile.name + ' · ' + item.name,
          ok: problems.length === 0,
          problems: problems.slice(0, 6)
        });
        if (problems.length) failures.push(results[results.length - 1]);
      } catch (error) {
        const message = error && error.message ? error.message : String(error);
        results.push({ label: profile.name + ' · ' + item.name, ok: false, problems: [message] });
        failures.push(results[results.length - 1]);
      }
    }
  }

  const passed = results.filter((item) => item.ok).length;
  return { ok: failures.length === 0, passed, total: results.length, results, failures };
}

export function formatReport(report) {
  const lines = report.results.map((item) => (item.ok ? '✓ ' : '✗ ') + item.label + (item.ok ? '' : ' — ' + item.problems.join(' · ')));
  return [
    `${report.ok ? 'ALL PASS' : 'FAILURES'} — ${report.passed}/${report.total} formats × profiles rebuilt exactly`,
    '',
    ...lines
  ].join('\n');
}

export const TEST_VERSION = APP_VERSION;
