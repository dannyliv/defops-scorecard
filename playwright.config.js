// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:8765',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 8765',
    cwd: __dirname,
    url: 'http://127.0.0.1:8765',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
