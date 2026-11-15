import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/online', timeout: 45000, workers: 1, forbidOnly: !!process.env.CI,
  outputDir: 'test-results/online', reporter: [['list'], ['json', { outputFile: '.local/online-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4213', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', channel: process.platform === 'win32' ? 'chrome' : undefined } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'node tests/online-server.js', url: 'http://127.0.0.1:4213', reuseExistingServer: false, timeout: 30000 },
});
