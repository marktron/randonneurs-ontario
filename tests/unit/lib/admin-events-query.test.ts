import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/data/event-rider-counts', () => ({
  getEventRiderCounts: vi.fn(async () => ({})),
}))

import { getAdminEvents } from '@/lib/admin/admin-events-query'

// Track every call made on the chainable query builder so tests can assert
// which methods ran (or didn't) without a full Supabase mock.
const queryCalls: { method: string; args: unknown[] }[] = []

function createChainableMock(finalData: unknown, finalError: unknown = null, finalCount = 0) {
  const chainable: Record<string, unknown> = {}
  const addMethod = (name: string) => {
    chainable[name] = vi.fn((...args: unknown[]) => {
      queryCalls.push({ method: name, args })
      return chainable
    })
  }
  ;['eq', 'gte', 'lte', 'lt', 'order', 'range'].forEach(addMethod)
  chainable.select = vi.fn((...args: unknown[]) => {
    queryCalls.push({ method: 'select', args })
    return chainable
  })
  chainable.then = (resolve: (value: unknown) => void) => {
    return Promise.resolve({ data: finalData, error: finalError, count: finalCount }).then(resolve)
  }
  return chainable
}

function createSupabaseMock(finalData: unknown, finalCount = 0) {
  return {
    from: vi.fn((table: string) => {
      queryCalls.push({ method: 'from', args: [table] })
      return createChainableMock(finalData, null, finalCount)
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

describe('getAdminEvents', () => {
  beforeEach(() => {
    queryCalls.length = 0
    vi.clearAllMocks()
  })

  it('paginates with .range() and runs a count query when pageSize is set', async () => {
    const events = [
      {
        id: 'evt-1',
        name: 'Spring 200',
        event_date: '2026-05-01',
        start_time: '07:00:00',
        distance_km: 200,
        event_type: 'brevet',
        status: 'scheduled',
        chapter_id: 'chapter-1',
        chapters: { name: 'Toronto' },
      },
    ]
    const supabase = createSupabaseMock(events, 1)

    const result = await getAdminEvents(supabase, '2026', 'all', undefined, undefined, 1, 50)

    expect(result.totalCount).toBe(1)
    const rangeCalls = queryCalls.filter((c) => c.method === 'range')
    expect(rangeCalls).toHaveLength(1)
    expect(rangeCalls[0].args).toEqual([0, 49])

    const countSelectCalls = queryCalls.filter(
      (c) => c.method === 'select' && (c.args[1] as { count?: string } | undefined)?.count
    )
    expect(countSelectCalls).toHaveLength(1)
  })

  it('skips .range() and the count query when pageSize is null (grid mode)', async () => {
    const events = [
      {
        id: 'evt-1',
        name: 'Spring 200',
        event_date: '2026-05-01',
        start_time: '07:00:00',
        distance_km: 200,
        event_type: 'brevet',
        status: 'scheduled',
        chapter_id: 'chapter-1',
        chapters: { name: 'Toronto' },
      },
      {
        id: 'evt-2',
        name: 'Summer 300',
        event_date: '2026-06-01',
        start_time: '06:00:00',
        distance_km: 300,
        event_type: 'brevet',
        status: 'scheduled',
        chapter_id: 'chapter-1',
        chapters: { name: 'Toronto' },
      },
    ]
    const supabase = createSupabaseMock(events)

    const result = await getAdminEvents(supabase, '2026', 'all', undefined, undefined, 1, null)

    expect(result.totalCount).toBe(2)
    expect(result.events).toHaveLength(2)

    const rangeCalls = queryCalls.filter((c) => c.method === 'range')
    expect(rangeCalls).toHaveLength(0)

    const countSelectCalls = queryCalls.filter(
      (c) => c.method === 'select' && (c.args[1] as { count?: string } | undefined)?.count
    )
    expect(countSelectCalls).toHaveLength(0)

    // Only one `from('events')` call in grid mode (no separate count query).
    const fromCalls = queryCalls.filter((c) => c.method === 'from')
    expect(fromCalls).toHaveLength(1)
  })
})
