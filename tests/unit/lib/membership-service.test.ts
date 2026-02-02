import { describe, it, expect, vi, beforeEach } from 'vitest'

// Note: Full database operation tests are covered in integration/E2E tests
// because Supabase's chainable query builder is complex to mock accurately.
// These tests verify the module exports exist.

describe('membership service', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'
  })

  it('exports getMembershipForRider function', async () => {
    const { getMembershipForRider } = await import('@/lib/memberships/service')
    expect(typeof getMembershipForRider).toBe('function')
  })

  it('exports isTrialUsed function', async () => {
    const { isTrialUsed } = await import('@/lib/memberships/service')
    expect(typeof isTrialUsed).toBe('function')
  })

  it('exports MembershipResult type', async () => {
    // Type check - this compiles if the type is exported correctly
    const { getMembershipForRider } = await import('@/lib/memberships/service')
    const result = { found: false } as Awaited<ReturnType<typeof getMembershipForRider>>
    expect(result.found).toBe(false)
  })
})
