import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  outputDir: './artifacts/browser-tests',
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', headless: true },
  webServer: { command: 'node scripts/server.mjs', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
