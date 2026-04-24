import { describe, it, expect, vi, beforeEach } from 'vitest'

// Track Supabase calls
type FromCall = { table: string; ops: string[] }
const fromCalls: FromCall[] = []

// Per-test response state
let resultsResponse: { data: unknown; error: unknown } = { data: [], error: null }

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)

  const builder = {
    select: vi.fn(() => {
      call.ops.push('select')
      return builder
    }),
    eq: vi.fn(() => {
      call.ops.push('eq')
      return builder
    }),
    order: vi.fn(() => {
      call.ops.push('order')
      return Promise.resolve(resultsResponse)
    }),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(async () => ({ id: 'admin-1', role: 'admin' })),
}))

vi.mock('@/lib/auth/roles', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/roles')>('@/lib/auth/roles')
  return actual
})

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

import { searchRiderResults } from '@/lib/actions/awards'

describe('searchRiderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    resultsResponse = { data: [], error: null }
  })

  it("returns the rider's results sorted by event_date desc", async () => {
    resultsResponse = {
      data: [
        {
          id: 'r-2',
          status: 'finished',
          finish_time: '13:30:00',
          distance_km: 600,
          events: {
            name: 'Lake Ontario 600',
            event_date: '2024-08-15',
            chapters: { name: 'Toronto' },
          },
        },
        {
          id: 'r-1',
          status: 'dnf',
          finish_time: null,
          distance_km: 400,
          events: {
            name: 'Niagara 400',
            event_date: '2024-06-01',
            chapters: { name: 'Niagara' },
          },
        },
      ],
      error: null,
    }

    const result = await searchRiderResults('rider-123')

    expect(result).toEqual([
      {
        resultId: 'r-2',
        eventName: 'Lake Ontario 600',
        eventDate: '2024-08-15',
        distanceKm: 600,
        chapterName: 'Toronto',
        status: 'finished',
        finishTime: '13:30:00',
      },
      {
        resultId: 'r-1',
        eventName: 'Niagara 400',
        eventDate: '2024-06-01',
        distanceKm: 400,
        chapterName: 'Niagara',
        status: 'dnf',
        finishTime: null,
      },
    ])

    const resultsCall = fromCalls.find((c) => c.table === 'results')
    expect(resultsCall).toBeDefined()
    expect(resultsCall!.ops).toEqual(['select', 'eq', 'order'])
  })

  it('returns [] when supabase returns an error', async () => {
    resultsResponse = { data: null, error: { message: 'boom' } }
    const result = await searchRiderResults('rider-123')
    expect(result).toEqual([])
  })
})
