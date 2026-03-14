import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/auth'
import { getTestData } from './helpers/test-data'

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
 * - globalSetup seeds admin@test.com / testpassword123 into local Supabase
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
      if (!getTestData()) {
        test.skip(true, 'globalSetup did not seed admin user')
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
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
      await loginAsAdmin(page)
    })

    test('displays dashboard with stats', async ({ page }) => {
      await page.goto('/admin')

      // Check for dashboard heading
      await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()

      // Dashboard should show stats line with counts in <span> elements
      await expect(page.locator('span', { hasText: /[\d,]+ events/ })).toBeVisible()
      await expect(page.locator('span', { hasText: /[\d,]+ riders/ })).toBeVisible()
    })

    test('displays navigation sidebar', async ({ page }) => {
      await page.goto('/admin')

      // Sidebar uses shadcn Sidebar component (div-based), verify key nav links exist
      await expect(page.getByTestId('nav-events')).toBeVisible()
      await expect(page.getByTestId('nav-riders')).toBeVisible()
      await expect(page.getByTestId('nav-results')).toBeVisible()
    })
  })

  test.describe('Admin Navigation', () => {
    test.beforeEach(async ({ page }) => {
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
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
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
      await loginAsAdmin(page)
    })

    test('can navigate to create event page', async ({ page }) => {
      await page.goto('/admin/events')

      // "New Event" link always renders on the events page
      const createButton = page.locator('a[href*="/admin/events/new"]').first()
      await expect(createButton).toBeVisible()
      await createButton.click()
      await expect(page).toHaveURL(/\/admin\/events\/new/)
      await expect(page.locator('form').first()).toBeVisible()
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
        await expect(page.locator('h1')).toBeVisible()
      } else {
        test.skip(true, 'No events in database to view')
      }
    })
  })

  test.describe('Results Management', () => {
    test.beforeEach(async ({ page }) => {
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
      await loginAsAdmin(page)
    })

    test('can navigate to results page', async ({ page }) => {
      await page.goto('/admin')

      await page.getByTestId('nav-results').click()
      // Dev mode may compile the page on first visit
      await expect(page).toHaveURL(/\/admin\/results/, { timeout: 30000 })
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
        } else {
          test.skip(true, 'No results section found on event detail page')
        }
      } else {
        test.skip(true, 'No events in database to view')
      }
    })
  })

  test.describe('User Management (Super Admin Only)', () => {
    test.beforeEach(async ({ page }) => {
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
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
      } else {
        test.skip(true, 'Users link not visible — test user may not be super_admin')
      }
    })
  })

  test.describe('News Management', () => {
    test.beforeEach(async ({ page }) => {
      if (!getTestData()) test.skip(true, 'globalSetup did not seed admin user')
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

      // Verify the item was created by checking the edit page has the title
      await expect(page.locator('input#title')).toHaveValue('Test Announcement')

      // Navigate back to the admin news list to verify it appears
      await page.goto('/admin/news')
      await page.waitForLoadState('networkidle')
      await expect(page.locator('text=Test Announcement')).toBeVisible({ timeout: 10000 })

      // Click on the test item in the table (ClickableTableRow uses client-side router.push)
      const row = page.locator('tr[role="link"]', { hasText: 'Test Announcement' })
      await row.click()
      // Dev mode may compile the page on first visit
      await page.waitForURL(/\/admin\/news\/[a-zA-Z0-9-]+$/, { timeout: 30000 })
      await page.waitForLoadState('networkidle')

      // Toggle published switch off (it should currently be checked)
      await page.click('button#published')

      // Save changes
      await page.click('button:has-text("Save Changes")')

      // Wait for the save to complete (toast notification appears)
      await expect(page.locator('text=News item saved')).toBeVisible({ timeout: 10000 })

      // Verify the published toggle is now off (aria-checked="false" for the switch)
      await expect(page.locator('button#published')).toHaveAttribute('aria-checked', 'false')
    })
  })
})
