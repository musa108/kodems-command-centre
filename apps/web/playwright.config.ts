import { defineConfig, devices } from '@playwright/test';
// Requires: API on :4000 (seeded with `npm run db:seed:demo`), web on :3000, and `npx playwright install chromium`.
export default defineConfig({ testDir: './e2e', timeout: 60_000, retries: 1, workers: 1, reporter: [['list']], use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'tablet', use: { ...devices['iPad (gen 7)'] } }, { name: 'mobile', use: { ...devices['Pixel 7'] } }] });
