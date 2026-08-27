import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2, // Limit workers to avoid dev server overload
  timeout: 60000, // 60s per test
  expect: {
    timeout: 15000, // 15s for expect assertions
  },
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Full e2e suite for Chromium. Not yet run in CI — it needs the
      // broader app auth/seed setup that only the digital-card projects
      // below have so far. See docs/TESTING.md → "CI/CD Integration".
      name: 'chromium',
      grepInvert: /@card-mutation/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Exercise the card on the closest Playwright profile to the affected
      // iPhone 8 Plus. Keep this project focused so the rest of the seeded,
      // mutation-heavy E2E suite is not duplicated across browser engines.
      name: 'webkit-iphone-8-plus',
      testMatch: /brevet-card\.spec\.ts/,
      grepInvert: /@card-mutation/,
      use: { ...devices['iPhone 8 Plus'] },
    },
    {
      // Each mutating project seeds and resets its own registration
      // (tests/e2e/helpers/checkins.ts), so there is no ordering constraint
      // on the WebKit smoke project and no dependency is needed.
      name: 'chromium-card-mutation',
      testMatch: /brevet-card\.spec\.ts/,
      grep: /@card-mutation/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Run the real check-in/outbox/server-action path on the affected
      // browser profile too. It uses a separate seeded registration, reset
      // before each run, so it cannot race the Chromium mutation project or
      // the read-only smoke tests.
      name: 'webkit-card-mutation',
      testMatch: /brevet-card\.spec\.ts/,
      grep: /@card-mutation/,
      use: { ...devices['iPhone 8 Plus'] },
    },
    // Uncomment to test in additional browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
