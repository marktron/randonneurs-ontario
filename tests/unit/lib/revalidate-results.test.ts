import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRevalidateTag = vi.fn((..._args: unknown[]) => undefined)
const mockRevalidatePath = vi.fn((..._args: unknown[]) => undefined)

vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}))

let eventRow: unknown = null

const mockFrom = vi.fn(() => {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: eventRow, error: null })),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

import { revalidateResultsTags } from '@/lib/revalidate-results'

const revalidatedTags = () => mockRevalidateTag.mock.calls.map((c) => c[0])

beforeEach(() => {
  mockRevalidateTag.mockClear()
  mockRevalidatePath.mockClear()
  eventRow = {
    season: 2026,
    event_type: 'brevet',
    chapters: { slug: 'toronto' },
  }
})

describe('revalidateResultsTags', () => {
  it('busts the results tags a change to an event‘s results affects', async () => {
    await revalidateResultsTags('event-1')

    expect(revalidatedTags()).toEqual(expect.arrayContaining(['results', 'year-2026']))
  })

  // Season-scoped awards (Super Randonneur) are granted by a Postgres trigger on
  // `results`, so a result submission can change `rider_awards` without any
  // award action running. /awards, /records and rider pages cache for 24h, so
  // without these the award stays invisible until the TTL lapses.
  it('busts the award caches, since a results change can grant a season award', async () => {
    await revalidateResultsTags('event-1')

    expect(revalidatedTags()).toContain('awards')
    expect(revalidatedTags()).toContain('records')
    expect(revalidatedTags()).toContain('riders')
  })

  it('forces immediate expiry rather than a lazy background refresh', async () => {
    await revalidateResultsTags('event-1')

    for (const tag of ['awards', 'records', 'riders']) {
      const call = mockRevalidateTag.mock.calls.find((c) => c[0] === tag)
      expect(call?.[1]).toEqual({ expire: 0 })
    }
  })

  it('still busts the award caches when the event has no chapter or season', async () => {
    eventRow = { season: null, event_type: 'brevet', chapters: null }

    await revalidateResultsTags('event-1')

    expect(revalidatedTags()).toContain('awards')
    expect(revalidatedTags()).toContain('records')
  })

  it('does nothing when the event cannot be loaded', async () => {
    eventRow = null

    await revalidateResultsTags('missing-event')

    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })
})
