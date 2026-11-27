import { defineConfig } from '@playwright/test';

/**
 * The suite drives the built app in a real browser, because nothing else can:
 * no test on the build machine ever runs the editor, the preview or an export.
 * One worker, because every test shares the browser's localStorage.
 */
export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 402, height: 874 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 240_000
  }
});
