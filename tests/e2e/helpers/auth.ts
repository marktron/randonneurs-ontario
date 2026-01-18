/**
 * E2E test helpers for authentication
 */

import { Page } from '@playwright/test'

/**
 * Log in as an admin user.
 *
 * Note: This requires a test admin user to exist in the database.
 * Set up test credentials via environment variables or seed data:
 * - E2E_ADMIN_EMAIL
 * - E2E_ADMIN_PASSWORD
 *
 * @param page - Playwright page instance
 * @param email - Admin email (defaults to env var)
 * @param password - Admin password (defaults to env var)
 */
export async function loginAsAdmin(page: Page, email?: string, password?: string): Promise<void> {
  const adminEmail = email || process.env.E2E_ADMIN_EMAIL || 'admin@test.com'
  const adminPassword = password || process.env.E2E_ADMIN_PASSWORD || 'testpassword123'

  await page.goto('/admin/login')

  await page.fill('input[type="email"]', adminEmail)
  await page.fill('input[type="password"]', adminPassword)
  await page.click('button[type="submit"]')

  // Wait for redirect to admin dashboard
  await page.waitForURL(/\/admin/, { timeout: 10000 })
}

/**
 * Check if user is logged in as admin
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.goto('/admin')
    // If redirected to login, not logged in
    await page.waitForURL(/\/admin\/login/, { timeout: 2000 })
    return false
  } catch {
    // If we're still on /admin, we're logged in
    return page.url().includes('/admin') && !page.url().includes('/admin/login')
  }
}
