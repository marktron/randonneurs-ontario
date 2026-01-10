import { test, expect } from '@playwright/test'

test.describe('Event Registration Page', () => {
  test('displays event details when navigating to registration', async ({ page }) => {
    // Navigate to the calendar to find an event
    await page.goto('/calendar/toronto')

    // Wait for the page to load
    await expect(page.locator('h1')).toContainText('Toronto')

    // Find an event link and click it
    const eventLink = page.locator('a[href^="/register/"]').first()

    // Skip if no events are scheduled
    if (await eventLink.count() === 0) {
      test.skip()
      return
    }

    await eventLink.click()

    // Verify the registration page loaded - wait for heading and content
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('main')).toBeVisible()
  })

  test('registration page displays event information', async ({ page }) => {
    // Navigate to the calendar to find an event
    await page.goto('/calendar/toronto')

    const eventLink = page.locator('a[href^="/register/"]').first()

    if (await eventLink.count() === 0) {
      test.skip()
      return
    }

    await eventLink.click()

    // Wait for page to load
    await expect(page.locator('main')).toBeVisible()

    // Check that the page has some content
    await expect(page.locator('h1')).toBeVisible()
  })
})

test.describe('Home Page', () => {
  test('loads successfully with navigation', async ({ page }) => {
    await page.goto('/')

    // Check that the page loaded
    await expect(page).toHaveTitle(/Randonneurs Ontario/)

    // Check navigation is present
    await expect(page.locator('nav')).toBeVisible()
  })

  test('can navigate to calendar pages', async ({ page }) => {
    await page.goto('/')

    // Find and click a calendar link
    const calendarLink = page.locator('a[href="/calendar/toronto"]').first()

    if (await calendarLink.count() > 0) {
      await calendarLink.click()
      // Wait for navigation to complete
      await page.waitForURL('**/calendar/toronto')
      await expect(page.locator('h1')).toContainText('Toronto')
    }
  })

  test('displays main content section', async ({ page }) => {
    await page.goto('/')

    // Check for main content area
    await expect(page.locator('main')).toBeVisible()
  })
})

test.describe('Admin Login', () => {
  test('shows login form when accessing admin area', async ({ page }) => {
    await page.goto('/admin')

    // Should redirect to login page
    await expect(page).toHaveURL(/\/admin\/login/)

    // Check login form is present
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/admin/login')

    // Enter invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show error message
    await expect(page.locator('text=Invalid login credentials')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Results Pages', () => {
  test('displays results page with chapter list', async ({ page }) => {
    await page.goto('/results')

    // Check that results page loaded
    await expect(page.locator('h1')).toContainText('Results')

    // Check for chapter links
    const chapterLinks = page.locator('a[href^="/results/"]')
    await expect(chapterLinks.first()).toBeVisible()
  })

  test('can navigate to chapter results', async ({ page }) => {
    await page.goto('/results')

    // Click on first chapter link
    const chapterLink = page.locator('a[href^="/results/"]').first()

    if (await chapterLink.count() > 0) {
      await chapterLink.click()

      // Should show chapter results page
      await expect(page.locator('h1')).toBeVisible()
    }
  })

  test('displays chapter results page', async ({ page }) => {
    await page.goto('/results/toronto')

    // Check for results page heading
    await expect(page.locator('h1')).toBeVisible()
  })
})

test.describe('Routes Pages', () => {
  test('displays routes index page', async ({ page }) => {
    await page.goto('/routes')

    // Check that routes page loaded - may show chapter list or routes
    await expect(page.locator('h1')).toBeVisible()
  })

  test('can navigate to chapter routes', async ({ page }) => {
    await page.goto('/routes/toronto')

    // Check for route listings
    await expect(page.locator('h1')).toContainText('Toronto')
  })
})

test.describe('Calendar Pages', () => {
  test('displays Toronto calendar', async ({ page }) => {
    await page.goto('/calendar/toronto')

    await expect(page.locator('h1')).toContainText('Toronto')
    // Check for calendar structure
    await expect(page.locator('main')).toBeVisible()
  })

  test('displays Ottawa calendar', async ({ page }) => {
    await page.goto('/calendar/ottawa')

    await expect(page.locator('h1')).toContainText('Ottawa')
  })

  test('displays Simcoe-Muskoka calendar', async ({ page }) => {
    await page.goto('/calendar/simcoe-muskoka')

    await expect(page.locator('h1')).toContainText('Simcoe')
  })

  test('displays Huron calendar', async ({ page }) => {
    await page.goto('/calendar/huron')

    await expect(page.locator('h1')).toContainText('Huron')
  })

  test('displays permanents calendar', async ({ page }) => {
    await page.goto('/calendar/permanents')

    await expect(page.locator('h1')).toContainText('Permanent')
  })
})

test.describe('About and Static Pages', () => {
  test('displays about page', async ({ page }) => {
    await page.goto('/about')

    // Check for main content area
    await expect(page.locator('main')).toBeVisible()
  })

  test('displays contact page', async ({ page }) => {
    await page.goto('/contact')

    await expect(page.locator('h1')).toContainText('Contact')
  })

  test('displays intro page', async ({ page }) => {
    await page.goto('/intro')

    // Check for main content
    await expect(page.locator('main')).toBeVisible()
  })
})

test.describe('Responsive Design', () => {
  test('page loads on mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto('/')

    // Page should load successfully
    await expect(page.locator('main')).toBeVisible()
  })
})
