import { defineConfig, devices } from '@playwright/test'

/**
 * Separate Playwright config for the printed control-card layout specs.
 *
 * These tests drive /control-cards/print, which is entirely query-param
 * driven — no auth, no seeded database. Running them under the main
 * playwright.config.ts would pull in tests/e2e/global-setup.ts and boot a
 * Supabase client they have no use for.
 *
 * Run with: npm run test:e2e:print-layout
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /control-card-print-layout\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
