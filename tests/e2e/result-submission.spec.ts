import { test, expect } from '@playwright/test'
import { getTestData } from './helpers/test-data'

/**
 * E2E tests for result submission flow.
 *
 * These tests verify the complete result submission journey:
 * - Navigate to submission page with token
 * - View event information
 * - Select finish status
 * - Enter finish time
 * - Upload files (GPX, control cards)
 * - Submit result
 *
 * Prerequisites:
 * - globalSetup must have seeded test results with submission tokens
 * - Event must be in 'completed' status
 */

test.describe('Result Submission Flow', () => {
  const getSubmissionToken = (): string | null => {
    return getTestData()?.pendingResult.submissionToken ?? null
  }

  test('shows 404 for invalid token', async ({ page }) => {
    await page.goto('/results/submit/invalid-token-12345')

    // Should show 404 page — the app renders "Off route" heading with "404" label
    await expect(page.getByRole('heading', { name: 'Off route' })).toBeVisible({ timeout: 10000 })
  })

  test('displays submission form for valid token', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Should show event information
    await expect(page.locator('h1')).toBeVisible()

    // Should show submission form
    await expect(page.locator('form')).toBeVisible()

    // Should show status select (Radix Select renders as combobox)
    await expect(page.locator('button[role="combobox"]')).toBeVisible()
  })

  test('displays event information on submission page', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Should show event name and distance
    await expect(page.locator('text=/km|event|brevet/i')).toBeVisible()
  })

  test('allows selecting finish status', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Find status select (Radix Select renders as combobox)
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()

    // Should show status options in the dropdown
    await expect(page.getByRole('option').first()).toBeVisible()
  })

  test('shows finish time input when status is finished', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select "finished" status
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Should show the clock-time input
    await expect(page.locator('#finishClockTime')).toBeVisible()
  })

  test('allows entering finish time', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select finished status first
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Seeded event is a 200 km starting at 07:00, so a 13:30 elapsed time
    // corresponds to a 20:30 finish on the same day (no day selector shown).
    const clockInput = page.locator('#finishClockTime')
    await expect(clockInput).toBeVisible({ timeout: 5000 })

    await clockInput.fill('20:30')
    expect(await clockInput.inputValue()).toBe('20:30')

    // Form should compute and surface the elapsed time inline
    await expect(page.getByText(/elapsed: 13h 30m/i)).toBeVisible()
  })

  test('allows selecting DNF status without time', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /dnf|did not finish/i }).click()

    // DNF should not require time input
    // Form should be submittable
    const submitButton = page.locator('button[type="submit"]').first()
    await expect(submitButton).toBeVisible()
    await expect(submitButton).toBeEnabled()
  })

  test('displays file upload inputs when status is finished', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // File inputs only render when status is "finished"
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Should show GPX and control card file inputs
    await expect(page.locator('input[type="file"][accept*=".gpx"]')).toBeAttached()
    await expect(page.locator('input[type="file"][accept*="image"]').first()).toBeAttached()
  })

  test('can upload GPX file', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // File inputs only render when status is "finished"
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Find GPX file input (hidden but in DOM)
    const gpxInput = page.locator('input[type="file"][accept*=".gpx"]')
    await expect(gpxInput).toBeAttached()

    // Create a test file
    const testFileContent = '<?xml version="1.0"?><gpx></gpx>'
    await gpxInput.setInputFiles({
      name: 'test-route.gpx',
      mimeType: 'application/gpx+xml',
      buffer: Buffer.from(testFileContent),
    })

    // After successful upload, the component shows the server-generated filename as a link
    await expect(page.locator('a[href*="gpx"]')).toBeVisible({ timeout: 10000 })
  })

  test('can upload control card photo', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // File inputs only render when status is "finished"
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Find control card file input (hidden but in DOM)
    const cardInput = page.locator('input[type="file"][accept*="image"]').first()
    await expect(cardInput).toBeAttached()

    // Create a test image file
    await cardInput.setInputFiles({
      name: 'control-card.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-image-data'),
    })

    // After successful upload, the component shows the server-generated filename as a link
    await expect(page.locator('a[href*="control_card"]')).toBeVisible({ timeout: 10000 })
  })

  test('validates finish time is required for finished status', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      console.warn('[e2e] No submission token — globalSetup may have failed')
      test.skip(true, 'No submission token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select finished status
    const statusSelect = page.locator('button[role="combobox"]').first()
    await expect(statusSelect).toBeVisible()
    await statusSelect.click()
    await page.getByRole('option', { name: /finished/i }).click()

    // Try to submit without time
    const submitButton = page.locator('button[type="submit"]').first()
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // HTML5 required validation should prevent submission — check for :invalid input
    await expect(page.locator('#finishClockTime:invalid')).toBeAttached()
  })

  test('disables form when results already submitted', async ({ page }) => {
    const token = getTestData()?.submittedResult.submissionToken ?? null
    if (!token) {
      console.warn('[e2e] No submitted result token — globalSetup may have failed')
      test.skip(true, 'No submitted result token available')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // When canSubmit is false, the component shows "Results Already Submitted" heading and no form
    await expect(page.locator('h2:has-text("Results Already Submitted")')).toBeVisible()
    await expect(page.locator('form')).not.toBeAttached()
  })
})
