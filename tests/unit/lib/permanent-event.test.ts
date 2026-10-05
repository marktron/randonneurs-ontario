import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ getSupabaseAdmin: vi.fn() }))

import { isRideReclaimable, RECLAIM_GRACE_MS } from '@/lib/actions/registration/permanent-event'

describe('isRideReclaimable', () => {
  const now = Date.parse('2027-05-01T12:00:00Z')
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()

  it('uses a 15 minute grace period', () => {
    expect(RECLAIM_GRACE_MS).toBe(15 * 60 * 1000)
  })

  it('never reclaims a ride with an active registration', () => {
    for (const active of ['registered', 'incomplete: membership']) {
      expect(
        isRideReclaimable({ createdAt: minutesAgo(60), statuses: ['cancelled', active] }, now)
      ).toBe(false)
    }
  })

  it('reclaims a ride whose riders all cancelled, however new', () => {
    expect(isRideReclaimable({ createdAt: minutesAgo(1), statuses: ['cancelled'] }, now)).toBe(true)
  })

  it('reclaims a ride nobody registered for only after the grace period', () => {
    expect(isRideReclaimable({ createdAt: minutesAgo(14), statuses: [] }, now)).toBe(false)
    expect(isRideReclaimable({ createdAt: minutesAgo(16), statuses: [] }, now)).toBe(true)
  })
})
