import { vi, beforeEach } from 'vitest'
import { config } from 'dotenv'
import path from 'path'
import { resetRateLimitStores } from '@/lib/rate-limit'

// Load real env vars from .env.development.local and .env.local
// Uses dotenv directly because @next/env's loadEnvConfig is CJS-only
// and doesn't work in Vitest's ESM worker context
config({ path: path.resolve(process.cwd(), '.env.development.local'), override: true })
config({ path: path.resolve(process.cwd(), '.env.local') })

// Never send real email during the real-DB suite. `.env.local` may carry AWS
// SES credentials plus SES_OVERRIDE_RECIPIENT, which would otherwise route a
// real message to that inbox for every finish/registration flow these tests
// exercise. `sendEmail` is the single outbound choke point for all email
// modules, so stubbing it here silences every flow. The DB-side single-send
// claim (finish_email_sent_at) is stamped before the send, so those
// assertions still hold; keep isEmailConfigured/fromEmail real so the code
// path up to the send runs unchanged.
vi.mock('@/lib/email/ses', async () => {
  const actual = await vi.importActual<typeof import('@/lib/email/ses')>('@/lib/email/ses')
  return {
    ...actual,
    sendEmail: vi.fn(async () => {}),
  }
})

// Mock Next.js cache module (pass-through, no caching in tests)
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn((fn) => fn),
}))

// Mock React cache (pass-through, no deduplication in tests)
vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    cache: (fn: unknown) => fn,
  }
})

// The rate limiter (lib/rate-limit.ts) keeps module-level in-memory state that
// persists across tests in a worker. Registration tests reuse the same email,
// so without a reset the per-email attempt count accumulates and trips the
// limiter ("Too many registration attempts"), cascading into later tests.
beforeEach(() => {
  resetRateLimitStores()
})
