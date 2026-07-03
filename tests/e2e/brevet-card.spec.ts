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
    await expect(page.getByText(/0 of 2 controls/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Check in' }).first()).toBeVisible()
  })

  test('checks in at a control with mocked GPS', async ({ browser }) => {
    const card = data()
    if (!card) {
      test.skip(true, 'No brevet card test data — globalSetup may have failed')
      return
    }

    const context = await browser.newContext({
      permissions: ['geolocation'],
      geolocation: { latitude: card.controlLat, longitude: card.controlLng, accuracy: 10 },
    })
    const page = await context.newPage()

    await page.goto(`/card/${card.managementToken}`)
    await page.getByRole('button', { name: 'Check in' }).first().click()

    // The check-in syncs and renders the ✓ timestamp within the row.
    await expect(page.getByText(/1 of 2 controls/)).toBeVisible({ timeout: 15000 })

    // Reload: the check-in came back from the server, not just local state.
    await page.reload()
    await expect(page.getByText(/1 of 2 controls/)).toBeVisible({ timeout: 15000 })

    await context.close()
  })
})
