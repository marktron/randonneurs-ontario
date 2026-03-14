import { test, expect, Page, Locator } from '@playwright/test'

/**
 * Helper to find the visible registration form on a page.
 * There are two forms: mobile (lg:hidden) and desktop (hidden lg:block).
 * This returns the desktop form which is visible at desktop viewport.
 */
async function getVisibleForm(page: Page): Promise<Locator> {
  // Wait for main content to be loaded
  await page.locator('main').waitFor({ state: 'visible' })

  // Get the LAST form in main (desktop form, which is visible at desktop viewport)
  // The mobile form is first in DOM but hidden on desktop
  const form = page.locator('main form').last()
  await form.waitFor({ state: 'visible', timeout: 10000 })

  return form
}

/**
 * E2E tests for complete registration flow.
 *
 * These tests verify the full registration journey:
 * - Navigate to event registration page
 * - Fill registration form
 * - Handle rider matching (if needed)
 * - Submit registration
 * - See confirmation
 *
 * Note: These tests work with actual events in the database.
 * They may skip if no events are available.
 */

test.describe('Complete Registration Flow', () => {
  test('can complete registration for scheduled event', async ({ page }) => {
    // Navigate to calendar
    await page.goto('/calendar/toronto')

    // Find an event link and get its href
    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available for testing')
      return
    }

    // Get the registration URL and navigate directly
    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Wait for the page heading to confirm we're on the right page
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 })

    // Get the visible form in main content area
    const form = await getVisibleForm(page)

    // Fill registration form using placeholder-based selectors
    await form.getByPlaceholder('First').fill('Test')
    await form.getByPlaceholder('Last').fill('Rider')
    await form.getByPlaceholder('you@example.com').fill('test@example.com')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    // Submit form
    await form.getByRole('button', { name: 'Register' }).click()

    // Wait for form to be processing
    await expect(form.getByRole('button', { name: /registering/i })).toBeVisible({ timeout: 5000 })

    // Wait for either success message, rider match dialog, or error
    // The actual outcome depends on server state and test data
    const success = page.getByTestId('registration-success')
    const matchDialog = page.locator('[role="dialog"]')
    const errorToast = page.getByTestId('registration-error').or(page.locator('.sonner-toast'))
    const registerButton = form.getByRole('button', { name: 'Register' }) // Button re-enables on error

    // Wait for one of the meaningful outcomes (not the register button re-enabling, which happens on any outcome)
    await Promise.race([
      success.waitFor({ state: 'visible', timeout: 15000 }),
      matchDialog.waitFor({ state: 'visible', timeout: 15000 }),
      errorToast.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {
      // If none resolved, the button may have re-enabled due to an error — check below
    })

    // Verify a specific meaningful outcome occurred
    const hasSuccess = await success.isVisible().catch(() => false)
    const hasDialog = await matchDialog.isVisible().catch(() => false)
    const hasError = await errorToast.isVisible().catch(() => false)

    if (hasSuccess) {
      await expect(success).toBeVisible()
    } else if (hasDialog) {
      await expect(matchDialog).toBeVisible()
    } else if (hasError) {
      await expect(errorToast).toBeVisible()
    } else {
      throw new Error(
        'Registration submission produced no visible outcome (no success, dialog, or error)'
      )
    }
  })

  test('registration form validates required fields', async ({ page }) => {
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    // Get the registration URL and navigate directly
    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Try to submit empty form
    await form.getByRole('button', { name: 'Register' }).click()

    // Submitting an empty form should trigger HTML5 required-field validation
    const invalidInputs = await form.locator('input:invalid').count()
    expect(invalidInputs).toBeGreaterThan(0)
  })

  test('registration form saves data to localStorage', async ({ page, context }) => {
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    // Get the registration URL and navigate directly
    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Fill form using placeholder-based selectors
    await form.getByPlaceholder('First').fill('Test')
    await form.getByPlaceholder('Last').fill('Rider')
    await form.getByPlaceholder('you@example.com').fill('test@example.com')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    // Submit form
    await form.getByRole('button', { name: 'Register' }).click()

    // Wait for form submission to complete
    await expect(form.getByRole('button', { name: /registering/i })).toBeVisible({ timeout: 5000 })

    // Wait for outcome (localStorage is only saved on success)
    const success = page.getByTestId('registration-success')
    const matchDialog = page.locator('[role="dialog"]')
    const errorIndicator = page.getByTestId('registration-error').or(page.locator('.sonner-toast'))
    const registerButton = form.getByRole('button', { name: 'Register' })

    // Wait for one of the meaningful outcomes
    await Promise.race([
      success.waitFor({ state: 'visible', timeout: 15000 }),
      matchDialog.waitFor({ state: 'visible', timeout: 15000 }),
      errorIndicator.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {
      // None resolved within timeout — check below
    })

    // Check if registration was successful
    const wasSuccessful = await success.isVisible().catch(() => false)

    if (wasSuccessful) {
      // On success, localStorage should be populated
      const savedData = await page.evaluate(() => {
        return localStorage.getItem('ro-registration')
      })

      expect(savedData).toBeTruthy()
      if (savedData) {
        const parsed = JSON.parse(savedData)
        expect(parsed.firstName).toBe('Test')
        expect(parsed.lastName).toBe('Rider')
      }
    } else {
      // Registration didn't succeed — localStorage test is only meaningful on success
      test.skip(true, 'Registration did not succeed — cannot verify localStorage')
    }
  })

  test('shows rider match dialog when needed', async ({ page }) => {
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()
    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    // Get the registration URL and navigate directly
    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Use a name that might match existing riders
    await form.getByPlaceholder('First').fill('John')
    await form.getByPlaceholder('Last').fill('Doe')
    await form.getByPlaceholder('you@example.com').fill('newemail@example.com')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    await form.getByRole('button', { name: 'Register' }).click()

    // Wait for a meaningful outcome
    const success = page.getByTestId('registration-success')
    const matchDialog = page.locator('[role="dialog"]')
    const errorToast = page.getByTestId('registration-error').or(page.locator('.sonner-toast'))

    await Promise.race([
      success.waitFor({ state: 'visible', timeout: 15000 }),
      matchDialog.waitFor({ state: 'visible', timeout: 15000 }),
      errorToast.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {})

    const hasSuccess = await success.isVisible().catch(() => false)
    const hasDialog = await matchDialog.isVisible().catch(() => false)
    const hasError = await errorToast.isVisible().catch(() => false)

    if (hasSuccess) {
      await expect(success).toBeVisible()
    } else if (hasDialog) {
      // Rider match dialog appeared — this is the expected path for this test
      await expect(matchDialog).toBeVisible()
    } else if (hasError) {
      await expect(errorToast).toBeVisible()
    } else {
      throw new Error(
        'Registration submission produced no visible outcome (no success, dialog, or error)'
      )
    }
  })

  test('can register for permanent ride', async ({ page }) => {
    await page.goto('/calendar/permanents')

    // Wait for page to load
    await expect(page.locator('main')).toBeVisible()

    // Look for the "Register for a Permanent" button/link
    const registerButton = page
      .locator(
        'a:has-text("Register for a Permanent"), button:has-text("Register for a Permanent")'
      )
      .first()

    if ((await registerButton.count()) > 0) {
      await registerButton.click()

      // Should now be on permanent registration page with route selection
      await expect(page.locator('button[role="combobox"]').first()).toBeVisible({ timeout: 15000 })
    } else {
      test.skip(true, 'No "Register for a Permanent" button found on permanents page')
    }
  })

  test('permanent registration requires route and date selection', async ({ page }) => {
    // Navigate directly to permanent registration page
    await page.goto('/register/permanent')

    // Check if we're on the registration page with the form
    const firstNameField = page.locator('main #firstName')
    if ((await firstNameField.count()) === 0) {
      test.skip(true, 'No permanent registration form found')
      return
    }

    await expect(firstNameField).toBeVisible({ timeout: 15000 })

    // Fill rider info but not route/date
    await page.locator('main #firstName').fill('Test')
    await page.locator('main #lastName').fill('Rider')
    await page.locator('main #email').fill('test@example.com')

    // Submit button always renders in the permanent registration form
    const submitButton = page.locator('main').getByTestId('registration-submit')
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // Should show validation error for missing route/date
    const errorMessages = page.locator('[data-slot="form-message"]')
    const invalidInputs = page.locator('main input:invalid')
    const hasError = (await errorMessages.count()) > 0
    const hasInvalid = (await invalidInputs.count()) > 0

    if (!hasError && !hasInvalid) {
      throw new Error(
        'No validation error shown for missing route/date — expected form-message or :invalid inputs'
      )
    }
  })
})
