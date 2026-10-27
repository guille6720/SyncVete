import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3017';
const hostname = new URL(baseURL).hostname;
if (!['localhost', '127.0.0.1'].includes(hostname) && !/^sync-vete-staging-[a-z0-9-]+\\.vercel\\.app$/.test(hostname)) throw new Error('Only local or SyncVete-Staging previews are allowed');

export default defineConfig({
  testDir: './e2e',
  testMatch: 'compras.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120000,
  expect: { timeout: 15000 },
  reporter: [['list'], ['json', { outputFile: '../../test-results/compras-e2e.json' }]],
  use: { baseURL, trace: 'off', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
});
