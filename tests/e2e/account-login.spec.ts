import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnvConfig } from '@next/env'
import { getTestData, type E2ETestData } from './helpers/test-data'

const MAILPIT = process.env.MAILPIT_URL || 'http://127.0.0.1:54324'
// Unique per run: a fixed address would trip the dev server's in-process
// `isRateLimited('rider-otp', email, 5, 10 min)` (and Supabase's own
// per-email limit) on repeat local runs. Two sends per run stays well under
// either limit.
const EMAIL_PREFIX = 'e2e-account-login-'
const EMAIL = `${EMAIL_PREFIX}${Date.now()}@example.com`
const RIDER_ID = '00000000-e2e1-4000-a000-000000000001'

function admin() {
  loadEnvConfig(process.cwd(), true /* development */)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env for e2e')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function latestCodeFor(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`
    )
    const { messages } = (await search.json()) as { messages: { ID: string }[] }
    if (messages?.length) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)
      const { Text } = (await message.json()) as { Text: string }
      const match = Text.match(/\b(\d{6})\b/)
      if (match) return match[1]
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`No code email for ${email}`)
}

/** Remove every auth user left behind by this spec, not just this run's. */
async function deleteStaleAuthUsers(prefix: string) {
  const supabase = admin()
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data.users) {
    if (user.email?.toLowerCase().startsWith(prefix)) {
      await supabase.auth.admin.deleteUser(user.id)
    }
  }
}

/** Remove every rider this spec left behind (by email prefix) plus the fixed id, and their registrations. */
async function deleteStaleRiders(prefix: string, alsoId: string) {
  const supabase = admin()
  const { data: staleRiders } = await supabase
    .from('riders')
    .select('id')
    .ilike('email', `${prefix}%`)
  const ids = Array.from(new Set([...(staleRiders ?? []).map((r) => r.id), alsoId]))
  await supabase.from('registrations').delete().in('rider_id', ids)
  await supabase.from('riders').delete().in('id', ids)
}

test.describe('rider account sign-in', () => {
  // Both tests share one rider/email fixture (beforeAll/afterAll below), and
  // send real OTPs to the same address — fullyParallel would otherwise run
  // beforeAll twice (once per worker) and race two concurrent sign-in
  // attempts against the same email.
  test.describe.configure({ mode: 'serial' })

  // Deferred to beforeAll: calling getTestData() at describe scope throws on
  // a fresh checkout (globalSetup hasn't run yet), which breaks
  // `playwright test --list`.
  let data: E2ETestData

  test.beforeAll(async () => {
    const seeded = getTestData()
    if (!seeded) throw new Error('[account-login] E2E test data missing — did globalSetup run?')
    data = seeded

    const supabase = admin()
    await deleteStaleAuthUsers(EMAIL_PREFIX)
    await deleteStaleRiders(EMAIL_PREFIX, RIDER_ID)
    await supabase.from('riders').insert({
      id: RIDER_ID,
      slug: 'e2e-account-login',
      first_name: 'Ada',
      last_name: 'Login',
      email: EMAIL,
    })
    await supabase.from('registrations').insert({
      rider_id: RIDER_ID,
      event_id: data.scheduledEvent.id,
      status: 'registered',
    })
    await fetch(`${MAILPIT}/api/v1/messages`, { method: 'DELETE' })
  })

  test.afterAll(async () => {
    await deleteStaleRiders(EMAIL_PREFIX, RIDER_ID)
    await deleteStaleAuthUsers(EMAIL_PREFIX)
  })

  test('emails a code, links by email, and shows the upcoming ride', async ({ page }) => {
    await page.goto('/account/login')
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByRole('button', { name: /send code/i }).click()
    await expect(page.getByText(/a code is on its way/i)).toBeVisible()

    const code = await latestCodeFor(EMAIL)
    await page.getByLabel(/6-digit code/i).fill(code)
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { name: /hi, ada/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /manage registration/i })).toBeVisible()
    await expect(
      page.locator('#main-content').getByRole('link', { name: /my account/i })
    ).toBeVisible()
    await page.screenshot({ path: 'test-results/account-overview.png', fullPage: true })
  })

  test('rejects a wrong code with the generic message', async ({ page }) => {
    await page.goto('/account/login')
    await page.getByLabel(/email/i).fill(EMAIL)
    await page.getByRole('button', { name: /send code/i }).click()
    await page.getByLabel(/6-digit code/i).fill('000000')
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page.getByText('That code is invalid or expired.')).toBeVisible()
  })
})
