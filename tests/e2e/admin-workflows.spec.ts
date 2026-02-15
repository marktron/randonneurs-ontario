import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'

/**
 * E2E tests for admin workflows.
 *
 * These tests verify complete admin user journeys:
 * - Login
 * - Navigation
 * - Create event
 * - Manage results
 * - Submit to ACP
 *
 * Prerequisites:
 * - Test admin user must exist (use E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD env vars)
 * - Or create test user via seed data
 */

test.describe('Admin Workflows', () => {
  test.describe('Authentication', () => {
    test('redirects to login when accessing admin without auth', async ({ page }) => {
      await page.goto('/admin')

      // Should redirect to login page
      await expect(page).toHaveURL(/\/admin\/login/)
    })

    test('shows login form with required fields', async ({ page }) => {
      await page.goto('/admin/login')

      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('shows error for invalid credentials', async ({ page }) => {
      await page.goto('/admin/login')

      await page.fill('input[type="email"]', 'invalid@example.com')
      await page.fill('input[type="password"]', 'wrongpassword')
      await page.click('button[type="submit"]')

      // Should show error message
      await expect(page.locator('text=/invalid|incorrect|error/i')).toBeVisible({ timeout: 10000 })
    })

    test('admin can log in with valid credentials', async ({ page }) => {
      // Skip if no test credentials configured
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }

      await loginAsAdmin(page)

      // Should be on admin dashboard
      await expect(page).toHaveURL(/\/admin$/)
      await expect(page.locator('h1')).toBeVisible()
    })
  })

  test.describe('Admin Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('displays dashboard with stats', async ({ page }) => {
      await page.goto('/admin')

      // Check for dashboard heading
      await expect(page.locator('h1')).toBeVisible()

      // Dashboard should show stats or event lists
      await expect(page.locator('main')).toBeVisible()
    })

    test('displays navigation sidebar', async ({ page }) => {
      await page.goto('/admin')

      // Sidebar should be visible
      await expect(page.locator('nav, [role="navigation"]')).toBeVisible()
    })
  })

  test.describe('Admin Navigation', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('can navigate to events page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-events').click()
      await expect(page).toHaveURL(/\/admin\/events/)
      await expect(page.locator('h1')).toBeVisible()
    })

    test('can navigate to routes page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-routes').click()
      await expect(page).toHaveURL(/\/admin\/routes/)
      await expect(page.locator('h1')).toBeVisible()
    })

    test('can navigate to riders page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-riders').click()
      await expect(page).toHaveURL(/\/admin\/riders/)
      await expect(page.locator('h1')).toBeVisible()
    })

    test('can navigate to settings page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-settings').click()
      await expect(page).toHaveURL(/\/admin\/settings/)
      await expect(page.locator('h1')).toContainText(/settings/i)
    })
  })

  test.describe('Event Management', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('can navigate to create event page', async ({ page }) => {
      await page.goto('/admin/events')

      // Look for "New Event" or "Create Event" button
      const createButton = page
        .locator('a[href*="/admin/events/new"], button:has-text("New"), button:has-text("Create")')
        .first()
      if ((await createButton.count()) > 0) {
        await createButton.click()
        await expect(page).toHaveURL(/\/admin\/events\/new/)
        await expect(page.locator('h1, form')).toBeVisible()
      }
    })

    test('event form displays all required fields', async ({ page }) => {
      await page.goto('/admin/events/new')

      // Check for form fields
      await expect(page.locator('input[name*="name"], label:has-text("name")')).toBeVisible()
      await expect(
        page.locator('input[name*="distance"], label:has-text("distance")')
      ).toBeVisible()
      await expect(page.locator('input[type="date"], label:has-text("date")')).toBeVisible()
    })

    test('can view event details page', async ({ page }) => {
      await page.goto('/admin/events')

      // Look for an event link in the table/list
      const eventLink = page
        .locator('a[href^="/admin/events/"]:not([href*="/new"]):not([href*="/edit"])')
        .first()
      if ((await eventLink.count()) > 0) {
        await eventLink.click()
        // Should be on event detail page
        await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/)
        await expect(page.locator('h1, main')).toBeVisible()
      }
    })
  })

  test.describe('Results Management', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('can navigate to results page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-results').click()
      await expect(page).toHaveURL(/\/admin\/results/)
      await expect(page.locator('h1')).toBeVisible()
    })

    test('can view event results page', async ({ page }) => {
      // Navigate to an event first
      await page.goto('/admin/events')

      const eventLink = page
        .locator('a[href^="/admin/events/"]:not([href*="/new"]):not([href*="/edit"])')
        .first()
      if ((await eventLink.count()) > 0) {
        await eventLink.click()

        // Look for results section or link
        const resultsSection = page.locator('text=/results/i, a[href*="results"]').first()
        if ((await resultsSection.count()) > 0) {
          await expect(resultsSection).toBeVisible()
        }
      }
    })
  })

  test.describe('User Management (Super Admin Only)', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('can navigate to users page if super admin', async ({ page }) => {
      await page.goto('/admin')

      // The users link is only visible to super admins
      const usersLink = page.getByTestId('nav-users')
      if ((await usersLink.count()) > 0) {
        await usersLink.click()
        await expect(page).toHaveURL(/\/admin\/users/)
        await expect(page.locator('h1')).toBeVisible()
      }
    })
  })

  test.describe('News Management', () => {
    test.beforeEach(async ({ page }) => {
      if (!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD) {
        test.skip()
        return
      }
      await loginAsAdmin(page)
    })

    test('can create, publish, and unpublish a news item', async ({ page }) => {
      // Navigate to the news admin page
      await page.goto('/admin/news')
      await page.waitForLoadState('networkidle')

      // Verify the page loads with the correct heading
      await expect(page.locator('h1')).toContainText('News', { timeout: 10000 })

      // Click "New Item" to create a news item
      await page.click('a[href="/admin/news/new"]')
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/\/admin\/news\/new/, { timeout: 10000 })

      // Fill in the title
      await page.fill('input#title', 'Test Announcement')

      // Fill in the body (the markdown editor textarea)
      await page.fill(
        'textarea[placeholder="Write your news content here using Markdown..."]',
        'This is a **test** notice.'
      )

      // Toggle the published switch on
      await page.click('button#published')

      // Click the create button
      await page.click('button:has-text("Create Item")')

      // Wait for navigation to the edit page (indicates successful creation)
      await page.waitForURL(/\/admin\/news\/[a-zA-Z0-9-]+$/, { timeout: 10000 })
      await page.waitForLoadState('networkidle')

      // Navigate to the homepage and verify the news item appears
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('text=Test Announcement')).toBeVisible({ timeout: 10000 })

      // Navigate back to the admin news list
      await page.goto('/admin/news')
      await page.waitForLoadState('networkidle')

      // Click on the test item in the table
      await page.click('text=Test Announcement')
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/\/admin\/news\/[a-zA-Z0-9-]+$/, { timeout: 10000 })

      // Toggle published switch off (it should currently be checked)
      await page.click('button#published')

      // Save changes
      await page.click('button:has-text("Save Changes")')

      // Wait for the save to complete (toast notification appears)
      await expect(page.locator('text=News item saved')).toBeVisible({ timeout: 10000 })

      // Navigate to the homepage and verify the news item no longer appears
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('text=Test Announcement')).not.toBeVisible({ timeout: 10000 })
    })
  })
})
