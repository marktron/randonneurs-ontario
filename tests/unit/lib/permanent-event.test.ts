import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-server', () => ({ getSupabaseAdmin: vi.fn() }))

import { isRideReclaimable, RECLAIM_GRACE_MS } from '@/lib/actions/registration/permanent-event'

describe('isRideReclaimable', () => {
  const now = Date.parse('2027-05-01T12:00:00Z')
  const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString()
  const ride = (
    updatedMinutesAgo: number | null,
    registrations: { status: string; cancelledAt: string | null }[] = []
  ) => ({
    createdAt: minutesAgo(60),
    updatedAt: updatedMinutesAgo == null ? null : minutesAgo(updatedMinutesAgo),
    registrations,
  })
  const cancelled = (m: number | null) => ({
    status: 'cancelled',
    cancelledAt: m == null ? null : minutesAgo(m),
  })

  it('uses a 15 minute grace period', () => {
    expect(RECLAIM_GRACE_MS).toBe(15 * 60 * 1000)
  })

  it('never reclaims a ride with an active registration', () => {
    for (const status of ['registered', 'incomplete: membership']) {
      expect(isRideReclaimable(ride(60, [cancelled(1), { status, cancelledAt: null }]), now)).toBe(
        false
      )
    }
  })

  it('reclaims a ride whose riders cancelled after its last change, however recent', () => {
    expect(isRideReclaimable(ride(5, [cancelled(1)]), now)).toBe(true)
  })

  it('ignores a cancellation older than the last change, or with no time', () => {
    expect(isRideReclaimable(ride(2, [cancelled(5)]), now)).toBe(false)
    expect(isRideReclaimable(ride(2, [cancelled(null)]), now)).toBe(false)
    expect(isRideReclaimable(ride(20, [cancelled(null)]), now)).toBe(true)
  })

  it('reclaims a ride nobody is on only after the grace period since its last change', () => {
    expect(isRideReclaimable(ride(14), now)).toBe(false)
    expect(isRideReclaimable(ride(16), now)).toBe(true)
  })

  it('falls back to created_at when there is no updated_at', () => {
    expect(isRideReclaimable({ ...ride(null), createdAt: minutesAgo(16) }, now)).toBe(true)
    expect(isRideReclaimable({ ...ride(null), createdAt: minutesAgo(14) }, now)).toBe(false)
  })
})
