import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';

process.env.E2E_PASSWORD ??= randomBytes(24).toString('hex');
export default defineConfig({
  testDir: './e2e', workers: 1, timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) },
  webServer: [
    { command: 'node scripts/browser-server.mjs', url: 'http://127.0.0.1:3002/api/health', timeout: 60000, reuseExistingServer: false },
    { command: 'npm run preview -w frontend', env: { E2E_API_PORT: '3002' }, url: 'http://127.0.0.1:4173', timeout: 30000, reuseExistingServer: false },
  ],
});
