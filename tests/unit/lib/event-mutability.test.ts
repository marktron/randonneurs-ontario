import { describe, it, expect, vi, beforeEach } from 'vitest'

// assertEventMutable reads events.status through the admin client; a single
// `.single()` response is all it needs.
const mockSingle = vi.fn()
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        single: () => mockSingle(),
      }
      return builder
    },
  }),
}))

import {
  EVENT_STATUS_TRANSITIONS,
  assertEventMutable,
  canTransitionEvent,
} from '@/lib/actions/event-mutability'
import type { EventStatus } from '@/lib/actions/events'

const ALL_STATUSES: EventStatus[] = ['draft', 'scheduled', 'completed', 'cancelled', 'submitted']

describe('EVENT_STATUS_TRANSITIONS', () => {
  // Pinned verbatim so any change to the lifecycle is a deliberate edit here too.
  it('is exactly the agreed lifecycle table', () => {
    expect(EVENT_STATUS_TRANSITIONS).toEqual({
      draft: ['scheduled'],
      scheduled: ['completed', 'cancelled'],
      completed: ['submitted', 'cancelled', 'scheduled'],
      cancelled: ['scheduled'],
      submitted: [],
    })
  })
})

describe('canTransitionEvent', () => {
  it.each(ALL_STATUSES)('allows a same-state request for %s', (status) => {
    expect(canTransitionEvent(status, status)).toBe(true)
  })

  const pairs = ALL_STATUSES.flatMap((from) =>
    ALL_STATUSES.filter((to) => to !== from).map((to) => [from, to] as const)
  )

  it.each(pairs)('%s -> %s follows the table', (from, to) => {
    expect(canTransitionEvent(from, to)).toBe(EVENT_STATUS_TRANSITIONS[from].includes(to))
  })

  it('never lets anything leave submitted', () => {
    for (const to of ALL_STATUSES.filter((s) => s !== 'submitted')) {
      expect(canTransitionEvent('submitted', to)).toBe(false)
    }
  })

  it('refuses cancelled -> completed (it would skip pending-result creation)', () => {
    expect(canTransitionEvent('cancelled', 'completed')).toBe(false)
  })

  it('refuses an unknown current status', () => {
    expect(canTransitionEvent('bogus' as EventStatus, 'scheduled')).toBe(false)
  })
})

describe('assertEventMutable', () => {
  beforeEach(() => {
    mockSingle.mockReset()
  })

  it('refuses a submitted event with the generalised frozen message', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'e1', status: 'submitted' }, error: null })
    expect(await assertEventMutable('e1')).toEqual({
      ok: false,
      error: 'Results for this event have been submitted; it is frozen',
    })
  })

  it.each(['draft', 'scheduled', 'completed', 'cancelled'])('allows a %s event', async (status) => {
    mockSingle.mockResolvedValue({ data: { id: 'e1', status }, error: null })
    expect(await assertEventMutable('e1')).toEqual({ ok: true })
  })

  it('reports a missing event', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    expect(await assertEventMutable('e1')).toEqual({ ok: false, error: 'Event not found' })
  })
})
