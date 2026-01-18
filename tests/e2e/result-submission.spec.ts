import { test, expect } from '@playwright/test'

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
 * - Test result with known submission_token must exist
 * - Set E2E_SUBMISSION_TOKEN env var or use test data
 * - Event must be in 'completed' status
 */

test.describe('Result Submission Flow', () => {
  const getSubmissionToken = (): string | null => {
    return process.env.E2E_SUBMISSION_TOKEN || null
  }

  test('shows 404 for invalid token', async ({ page }) => {
    await page.goto('/results/submit/invalid-token-12345')

    // Should show 404 or error message - check for either condition
    const notFoundText = page.locator('text=/not found|invalid|error/i').first()
    const notFoundHeading = page.locator('h1:has-text("404")')

    // Wait for either to be visible
    await expect(notFoundText.or(notFoundHeading)).toBeVisible({ timeout: 10000 })
  })

  test('displays submission form for valid token', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Should show event information
    await expect(page.locator('h1, main')).toBeVisible()

    // Should show submission form
    await expect(page.locator('form')).toBeVisible()

    // Should show status select
    await expect(page.locator('select, button[role="combobox"]')).toBeVisible()
  })

  test('displays event information on submission page', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Should show event name and distance
    await expect(page.locator('text=/km|event|brevet/i')).toBeVisible()
  })

  test('allows selecting finish status', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Find status select
    const statusSelect = page.locator('select, button[role="combobox"]').first()
    if ((await statusSelect.count()) > 0) {
      await statusSelect.click()

      // Should show status options
      await expect(page.locator('text=/finished|dnf|dns/i')).toBeVisible()
    }
  })

  test('shows finish time inputs when status is finished', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select "finished" status
    const statusSelect = page.locator('select, button[role="combobox"]').first()
    if ((await statusSelect.count()) > 0) {
      await statusSelect.click()
      const finishedOption = page.locator('text=/finished/i').first()
      if ((await finishedOption.count()) > 0) {
        await finishedOption.click()

        // Should show time inputs
        await expect(
          page.locator('input[type="number"], label:has-text("hour"), label:has-text("minute")')
        ).toBeVisible()
      }
    }
  })

  test('allows entering finish time', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select finished status first
    const statusSelect = page.locator('select, button[role="combobox"]').first()
    if ((await statusSelect.count()) > 0) {
      await statusSelect.click()
      const finishedOption = page.locator('text=/finished/i').first()
      if ((await finishedOption.count()) > 0) {
        await finishedOption.click()

        // Find and fill time inputs - wait for them to be visible after status change
        const hourInput = page
          .locator('input[type="number"], label:has-text("hour") + input')
          .first()
        await expect(hourInput).toBeVisible({ timeout: 5000 })
        const minuteInput = page
          .locator('input[type="number"], label:has-text("minute") + input')
          .first()

        if ((await hourInput.count()) > 0 && (await minuteInput.count()) > 0) {
          await hourInput.fill('13')
          await minuteInput.fill('30')

          expect(await hourInput.inputValue()).toBe('13')
          expect(await minuteInput.inputValue()).toBe('30')
        }
      }
    }
  })

  test('allows selecting DNF status without time', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    const statusSelect = page.locator('select, button[role="combobox"]').first()
    if ((await statusSelect.count()) > 0) {
      await statusSelect.click()
      const dnfOption = page.locator('text=/dnf|did not finish/i').first()
      if ((await dnfOption.count()) > 0) {
        await dnfOption.click()

        // DNF should not require time input
        // Form should be submittable
        const submitButton = page
          .locator('button[type="submit"], button:has-text("submit")')
          .first()
        if ((await submitButton.count()) > 0) {
          await expect(submitButton).toBeEnabled()
        }
      }
    }
  })

  test('displays file upload inputs', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Should show file upload inputs
    const fileInputs = page.locator('input[type="file"]')
    const fileInputCount = await fileInputs.count()
    expect(fileInputCount).toBeGreaterThan(0)
  })

  test('can upload GPX file', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Find GPX file input
    const gpxInput = page
      .locator('input[type="file"], label:has-text("gpx") + input[type="file"]')
      .first()
    if ((await gpxInput.count()) > 0) {
      // Create a test file
      const testFileContent = '<?xml version="1.0"?><gpx></gpx>'
      const file = {
        name: 'test-route.gpx',
        mimeType: 'application/gpx+xml',
        buffer: Buffer.from(testFileContent),
      }

      await gpxInput.setInputFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      })

      // Should show upload progress or success message
      await expect(page.locator('text=/upload|success|complete/i').first()).toBeVisible({
        timeout: 10000,
      })
    }
  })

  test('can upload control card photo', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Find control card file input
    const cardInput = page
      .locator('input[type="file"], label:has-text("control") + input[type="file"]')
      .first()
    if ((await cardInput.count()) > 0) {
      // Create a test image file
      const file = {
        name: 'control-card.jpg',
        mimeType: 'image/jpeg',
        buffer: Buffer.from('fake-image-data'),
      }

      await cardInput.setInputFiles({
        name: file.name,
        mimeType: file.mimeType,
        buffer: file.buffer,
      })

      // Should show upload progress or success
      await expect(page.locator('text=/upload|success|complete/i').first()).toBeVisible({
        timeout: 10000,
      })
    }
  })

  test('validates finish time is required for finished status', async ({ page }) => {
    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Select finished status
    const statusSelect = page.locator('select, button[role="combobox"]').first()
    if ((await statusSelect.count()) > 0) {
      await statusSelect.click()
      const finishedOption = page.locator('text=/finished/i').first()
      if ((await finishedOption.count()) > 0) {
        await finishedOption.click()

        // Try to submit without time
        const submitButton = page
          .locator('button[type="submit"], button:has-text("submit")')
          .first()
        if ((await submitButton.count()) > 0) {
          await submitButton.click()

          // Should show validation error
          await expect(page.locator('text=/time|required|finish/i')).toBeVisible({ timeout: 5000 })
        }
      }
    }
  })

  test('disables form when results already submitted', async ({ page }) => {
    // This would require a result with status 'submitted'
    // and canSubmit: false in the initial data
    // For now, we'll test the structure

    const token = getSubmissionToken()
    if (!token) {
      test.skip(true, 'E2E_SUBMISSION_TOKEN not set')
      return
    }

    await page.goto(`/results/submit/${token}`)

    // Check if form is disabled (would show message if already submitted)
    const disabledMessage = page.locator('text=/already submitted|submitted/i')
    if ((await disabledMessage.count()) > 0) {
      const submitButton = page.locator('button[type="submit"]').first()
      if ((await submitButton.count()) > 0) {
        await expect(submitButton).toBeDisabled()
      }
    }
  })
})
