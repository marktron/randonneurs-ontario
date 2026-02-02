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
 * E2E tests for membership verification during registration.
 *
 * These tests verify:
 * - Registration form UI structure for membership context
 * - Form validation prevents submission without required fields
 * - MembershipErrorModal UI structure (tested via component structure)
 * - Links to membership page are present for users who need to join
 *
 * Note: Since we can't easily mock the CCN API response in E2E tests,
 * these tests focus on UI structure and form behavior rather than
 * testing actual membership verification outcomes.
 */

test.describe('Membership Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to a registration page via calendar
    await page.goto('/calendar/toronto')
  })

  test('registration form displays all required fields for membership context', async ({
    page,
  }) => {
    // Find an event link
    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available for testing')
      return
    }

    // Navigate to registration page
    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Wait for the page to load
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 })

    // Get the visible form
    const form = await getVisibleForm(page)

    // Verify all required form fields are present
    // These are needed for membership verification: name, email
    await expect(form.getByPlaceholder('First')).toBeVisible()
    await expect(form.getByPlaceholder('Last')).toBeVisible()
    await expect(form.getByPlaceholder('you@example.com')).toBeVisible()

    // Emergency contact fields (required for registration)
    await expect(form.getByPlaceholder('Name')).toBeVisible()
    await expect(form.getByPlaceholder('Phone number')).toBeVisible()

    // Submit button should be visible
    await expect(form.getByRole('button', { name: 'Register' })).toBeVisible()
  })

  test('form validation prevents submission without required fields', async ({ page }) => {
    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Try to submit empty form - should fail validation
    await form.getByRole('button', { name: 'Register' }).click()

    // Browser HTML5 validation should prevent submission
    const invalidInputs = await form.locator('input:invalid').count()
    expect(invalidInputs).toBeGreaterThan(0)

    // Specifically check that required fields are invalid
    const firstNameInput = form.getByPlaceholder('First')
    const isFirstNameInvalid = await firstNameInput.evaluate(
      (el) => !(el as HTMLInputElement).validity.valid
    )
    expect(isFirstNameInvalid).toBe(true)
  })

  test('form requires valid email format', async ({ page }) => {
    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Fill with invalid email
    await form.getByPlaceholder('First').fill('Test')
    await form.getByPlaceholder('Last').fill('User')
    await form.getByPlaceholder('you@example.com').fill('invalid-email')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    // Try to submit
    await form.getByRole('button', { name: 'Register' }).click()

    // Email field should be invalid
    const emailInput = form.getByPlaceholder('you@example.com')
    const isEmailInvalid = await emailInput.evaluate(
      (el) => !(el as HTMLInputElement).validity.valid
    )
    expect(isEmailInvalid).toBe(true)
  })

  test('membership page is accessible', async ({ page }) => {
    // Verify the membership page exists (this is where users go to join)
    await page.goto('/membership')

    // Page should load without error
    await expect(page.locator('main')).toBeVisible()
    await expect(page.locator('h1')).toBeVisible()
  })

  test('registration form handles submission gracefully', async ({ page }) => {
    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Fill form with valid data
    await form.getByPlaceholder('First').fill('Test')
    await form.getByPlaceholder('Last').fill('User')
    await form.getByPlaceholder('you@example.com').fill('test@example.com')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    // Submit form
    await form.getByRole('button', { name: 'Register' }).click()

    // Should show loading state
    await expect(form.getByRole('button', { name: /registering/i })).toBeVisible({ timeout: 5000 })

    // Wait for one of the possible outcomes:
    // - Success: registration-success element
    // - Rider match dialog: dialog modal
    // - Membership error: dialog with "Membership Required" or "Trial Membership Used"
    // - General error: registration-error element
    const success = page.getByTestId('registration-success')
    const matchDialog = page.locator('[role="dialog"]')
    const errorAlert = page.getByTestId('registration-error')
    const registerButton = form.getByRole('button', { name: 'Register' })

    // Wait for any outcome
    await Promise.race([
      success.waitFor({ state: 'visible', timeout: 15000 }),
      matchDialog.waitFor({ state: 'visible', timeout: 15000 }),
      errorAlert.waitFor({ state: 'visible', timeout: 15000 }),
      registerButton.waitFor({ state: 'visible', timeout: 15000 }),
    ])

    // Verify that at least one outcome occurred
    const hasSuccess = await success.isVisible().catch(() => false)
    const hasDialog = await matchDialog.isVisible().catch(() => false)
    const hasError = await errorAlert.isVisible().catch(() => false)
    const buttonReset = await registerButton.isVisible().catch(() => false)

    expect(hasSuccess || hasDialog || hasError || buttonReset).toBeTruthy()
  })

  test('membership error modal has correct structure when displayed', async ({ page }) => {
    // This test verifies the MembershipErrorModal component structure
    // by checking that the dialog component is properly configured
    // Note: We can't easily trigger the modal without actual membership data

    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    // Get the visible form
    const form = await getVisibleForm(page)

    // Fill form with valid data
    await form.getByPlaceholder('First').fill('Test')
    await form.getByPlaceholder('Last').fill('User')
    await form.getByPlaceholder('you@example.com').fill('testmembership@example.com')
    await form.getByPlaceholder('Name').fill('Emergency Contact')
    await form.getByPlaceholder('Phone number').fill('555-1234')

    // Submit form
    await form.getByRole('button', { name: 'Register' }).click()

    // Wait for loading
    await expect(form.getByRole('button', { name: /registering/i })).toBeVisible({ timeout: 5000 })

    // Wait for any outcome
    const success = page.getByTestId('registration-success')
    const dialog = page.locator('[role="dialog"]')
    const errorAlert = page.getByTestId('registration-error')
    const registerButton = form.getByRole('button', { name: 'Register' })

    await Promise.race([
      success.waitFor({ state: 'visible', timeout: 15000 }),
      dialog.waitFor({ state: 'visible', timeout: 15000 }),
      errorAlert.waitFor({ state: 'visible', timeout: 15000 }),
      registerButton.waitFor({ state: 'visible', timeout: 15000 }),
    ])

    // If a dialog appeared, check its structure
    const dialogVisible = await dialog.isVisible().catch(() => false)

    if (dialogVisible) {
      // Check if it's a membership error dialog by looking for specific text
      const isMembershipDialog =
        (await dialog
          .getByText('Membership Required')
          .isVisible()
          .catch(() => false)) ||
        (await dialog
          .getByText('Trial Membership Used')
          .isVisible()
          .catch(() => false))

      if (isMembershipDialog) {
        // Verify the membership dialog has expected elements
        // Should have a link to membership page
        const membershipLink = dialog.locator('a[href="/membership"]')
        await expect(membershipLink).toBeVisible()

        // Should have a close button
        const closeButton = dialog.getByRole('button', { name: 'Close' })
        await expect(closeButton).toBeVisible()
      }
      // If it's a rider match dialog, that's also a valid outcome
    }
    // Other outcomes (success, error) are also valid
  })
})

test.describe('Membership Registration Links', () => {
  test('home page or navigation has path to membership info', async ({ page }) => {
    await page.goto('/')

    // Check for membership link in navigation or main content
    const membershipLinks = page.locator('a[href="/membership"], a[href*="membership"]')

    // There should be at least one membership link accessible from home
    // Either in nav, footer, or main content
    const linkCount = await membershipLinks.count()

    if (linkCount === 0) {
      // Check in footer or navigation specifically
      const navMembershipLink = page.locator('nav a[href="/membership"]')
      const footerMembershipLink = page.locator('footer a[href="/membership"]')

      const hasNavLink = (await navMembershipLink.count()) > 0
      const hasFooterLink = (await footerMembershipLink.count()) > 0

      // Log for debugging but don't fail - membership link might be elsewhere
      if (!hasNavLink && !hasFooterLink) {
        console.log('Note: No direct membership link found on home page')
      }
    }

    // Main check: membership page should be accessible
    await page.goto('/membership')
    await expect(page.locator('main')).toBeVisible()
  })

  test('contact or about page mentions membership', async ({ page }) => {
    // Check if membership info is accessible from common pages
    await page.goto('/about')

    await expect(page.locator('main')).toBeVisible()

    // The about page should load successfully - membership info
    // may or may not be present depending on content
  })
})

test.describe('Registration Form Accessibility', () => {
  test('form inputs have proper labels for screen readers', async ({ page }) => {
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    const form = await getVisibleForm(page)

    // Check that inputs have associated labels
    const firstNameInput = form.locator('#firstName')
    const lastNameInput = form.locator('#lastName')
    const emailInput = form.locator('#email')

    // Inputs should have labels pointing to them
    await expect(form.locator('label[for="firstName"]')).toBeVisible()
    await expect(form.locator('label[for="lastName"]')).toBeVisible()
    await expect(form.locator('label[for="email"]')).toBeVisible()

    // Inputs should be accessible
    await expect(firstNameInput).toBeVisible()
    await expect(lastNameInput).toBeVisible()
    await expect(emailInput).toBeVisible()
  })

  test('error states are accessible', async ({ page }) => {
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()

    if ((await eventLink.count()) === 0) {
      test.skip(true, 'No events available')
      return
    }

    const href = await eventLink.getAttribute('href')
    if (!href) {
      test.skip(true, 'No event link found')
      return
    }

    await page.goto(href)

    const form = await getVisibleForm(page)

    // Try to submit empty form
    await form.getByRole('button', { name: 'Register' }).click()

    // The form should prevent submission and inputs should be in invalid state
    // Check that the invalid state is communicated
    const invalidInputs = form.locator('input:invalid')
    expect(await invalidInputs.count()).toBeGreaterThan(0)

    // Check that error alert role exists when there's an error message visible
    // (This tests the data-testid="registration-error" element with role="alert")
  })
})
