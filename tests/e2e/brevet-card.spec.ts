import { test, expect } from '@playwright/test'
import { getTestData } from './helpers/test-data'

/**
 * E2E tests for the digital brevet card (/card/[token]).
 *
 * Prerequisites:
 * - globalSetup seeded an in-progress brevet (started ~1h ago) with two
 *   controls at Union Station and a registered rider.
 *
 * Geolocation is mocked via Playwright's context permissions so the GPS
 * check-in path runs for real against the server action.
 */

test.describe('Digital Brevet Card', () => {
  const data = () => getTestData()?.brevetCard ?? null

  test('shows 404 for an invalid token', async ({ page }) => {
    await page.goto('/card/00000000-dead-4000-a000-000000000000')
    await expect(page.getByRole('heading', { name: 'Off route' })).toBeVisible({ timeout: 10000 })
  })

  test('displays the card with controls and time windows', async ({ page }) => {
    const card = data()
    if (!card) {
      test.skip(true, 'No brevet card test data — globalSetup may have failed')
      return
    }

    await page.goto(`/card/${card.managementToken}`)

    await expect(page.getByRole('heading', { name: /E2E Test Active Brevet/ })).toBeVisible()
    await expect(page.getByText('Start — Union Station')).toBeVisible()
    await expect(page.getByText('Finish — Union Station')).toBeVisible()
    // This read-only assertion is deliberately agnostic to the persisted
    // progress: the Chromium-only mutation test can run concurrently.
    await expect(page.getByText(/\d of 2 controls/)).toBeVisible()
  })

  test('proactive location test succeeds with mocked GPS', async ({ context, page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'webkit-iphone-8-plus',
      'This smoke test specifically covers the iPhone/WebKit geolocation path'
    )

    const card = data()
    if (!card) {
      test.skip(true, 'No brevet card test data — globalSetup may have failed')
      return
    }

    // Keep the proactive affordance visible while granting the underlying
    // browser permission. The click still uses Playwright's real WebKit
    // Geolocation API and the production staged-acquisition helper.
    await page.addInitScript(() => {
      const promptPermission = {
        state: 'prompt',
        addEventListener: () => {},
        removeEventListener: () => {},
      }
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: async () => promptPermission },
      })
    })
    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({
      latitude: card.controlLat,
      longitude: card.controlLng,
      accuracy: 10,
    })

    await page.goto(`/card/${card.managementToken}`)
    const progress = page.getByText(/\d of 2 controls/)
    const before = await progress.textContent()
    await page.getByRole('button', { name: 'Test your location' }).click()

    await expect(page.getByText('Location works on this phone.')).toBeVisible({ timeout: 15000 })
    await expect(progress).toHaveText(before ?? '0 of 2 controls')
  })

  test('checks in at a control with mocked GPS @card-mutation', async ({
    context,
    page,
  }, testInfo) => {
    const card = data()
    if (!card) {
      test.skip(true, 'No brevet card test data — globalSetup may have failed')
      return
    }

    await context.grantPermissions(['geolocation'])
    await context.setGeolocation({
      latitude: card.controlLat,
      longitude: card.controlLng,
      accuracy: 10,
    })

    const managementToken =
      testInfo.project.name === 'webkit-card-mutation'
        ? card.webkitManagementToken
        : card.managementToken
    await page.goto(`/card/${managementToken}`)
    const progress = page.getByText(/\d of 2 controls/)
    await expect(progress).toBeVisible()
    const initialText = await progress.textContent()
    const initialCount = Number(initialText?.match(/\d+/)?.[0] ?? 0)

    // A Playwright retry reuses the global seed, so the first attempt may
    // already have committed. Avoid colliding with the unique row constraint.
    if (initialCount === 2) {
      await expect(progress).toContainText('2 of 2 controls')
      return
    }

    await page.getByRole('button', { name: 'Check in' }).first().click()

    // The check-in syncs and renders the ✓ timestamp within the row.
    await expect(progress).toContainText(`${initialCount + 1} of 2 controls`, { timeout: 15000 })

    // Reload: the check-in came back from the server, not just local state.
    await page.reload()
    await expect(page.getByText(`${initialCount + 1} of 2 controls`)).toBeVisible({
      timeout: 15000,
    })
  })
})
