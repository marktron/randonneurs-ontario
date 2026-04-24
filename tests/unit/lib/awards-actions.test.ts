import { describe, it, expect, vi, beforeEach } from 'vitest'

type FromCall = { table: string; ops: string[]; insertPayload?: unknown }
const fromCalls: FromCall[] = []

interface TableState {
  selectResponse?: { data: unknown; error: unknown }
  insertResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}

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
      return Promise.resolve(state.selectResponse ?? { data: [], error: null })
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      return Promise.resolve(state.selectResponse ?? { data: null, error: null })
    }),
    insert: vi.fn((payload: unknown) => {
      call.ops.push('insert')
      call.insertPayload = payload
      return Promise.resolve(state.insertResponse ?? { data: null, error: null })
    }),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

const mockRequireAdmin = vi.fn(async () => ({ id: 'admin-1', role: 'admin' }))
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}))

const mockLogAuditEvent = vi.fn(async (..._args: unknown[]) => undefined)
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}))

const mockRevalidateTag = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}))

import { searchRiderResults, assignResultAward, assignSeasonAward } from '@/lib/actions/awards'

describe('searchRiderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  it("returns the rider's results sorted by event_date desc", async () => {
    tables.results = {
      selectResponse: {
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
      },
    }

    const result = await searchRiderResults('rider-123')
    expect(result.map((r) => r.resultId)).toEqual(['r-2', 'r-1'])
    expect(result[0].chapterName).toBe('Toronto')
  })

  it('returns [] when supabase returns an error', async () => {
    tables.results = { selectResponse: { data: null, error: { message: 'boom' } } }
    expect(await searchRiderResults('rider-123')).toEqual([])
  })
})

describe('assignResultAward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  function setupHappyPath() {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-pbp', title: 'Paris-Brest-Paris', award_type: 'result' },
        error: null,
      },
    }
    tables.results = {
      selectResponse: {
        data: {
          id: 'res-1',
          rider_id: 'rider-1',
          riders: { first_name: 'Jane', last_name: 'Doe', slug: 'jane-doe' },
          events: { name: 'Paris-Brest-Paris', event_date: '2023-08-20' },
        },
        error: null,
      },
    }
    tables.result_awards = {
      insertResponse: { data: { result_id: 'res-1', award_id: 'award-pbp' }, error: null },
    }
  }

  it('inserts into result_awards on the happy path and revalidates caches', async () => {
    setupHappyPath()

    const res = await assignResultAward({ awardId: 'award-pbp', resultId: 'res-1' })

    expect(res).toEqual({ success: true })
    const insertCall = fromCalls.find((c) => c.table === 'result_awards')
    expect(insertCall?.insertPayload).toEqual({ result_id: 'res-1', award_id: 'award-pbp' })
    expect(mockRevalidateTag).toHaveBeenCalledWith('awards', { expire: 0 })
    expect(mockRevalidateTag).toHaveBeenCalledWith('rider-jane-doe', { expire: 0 })
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'create',
        entityType: 'award',
        description: expect.stringContaining('Paris-Brest-Paris'),
      })
    )
  })

  it('rejects when the award is season-scoped', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-sr', title: 'Super Randonneur', award_type: 'season' },
        error: null,
      },
    }

    const res = await assignResultAward({ awardId: 'award-sr', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season-scoped/i)
    expect(fromCalls.find((c) => c.table === 'result_awards')).toBeUndefined()
  })

  it('returns the friendly duplicate message on Postgres 23505', async () => {
    setupHappyPath()
    tables.result_awards = {
      insertResponse: { data: null, error: { code: '23505', message: 'dup' } },
    }

    const res = await assignResultAward({ awardId: 'award-pbp', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/already has the Paris-Brest-Paris/i)
  })

  it('returns "Award no longer exists" if award lookup is empty', async () => {
    tables.awards = { selectResponse: { data: null, error: null } }

    const res = await assignResultAward({ awardId: 'missing', resultId: 'res-1' })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/no longer exists/i)
  })
})

describe('assignSeasonAward', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromCalls.length = 0
    tables = {}
    mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  })

  function setupHappyPath() {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-sr', title: 'Super Randonneur', award_type: 'season' },
        error: null,
      },
    }
    tables.riders = {
      selectResponse: {
        data: { first_name: 'Jane', last_name: 'Doe', slug: 'jane-doe' },
        error: null,
      },
    }
    tables.rider_awards = {
      insertResponse: { data: { id: 'ra-1' }, error: null },
    }
  }

  it('inserts into rider_awards on the happy path', async () => {
    setupHappyPath()

    const res = await assignSeasonAward({
      awardId: 'award-sr',
      riderId: 'rider-1',
      season: 2024,
      note: 'Earned at RM 600',
    })

    expect(res).toEqual({ success: true })
    const insertCall = fromCalls.find((c) => c.table === 'rider_awards')
    expect(insertCall?.insertPayload).toEqual({
      rider_id: 'rider-1',
      award_id: 'award-sr',
      season: 2024,
      note: 'Earned at RM 600',
    })
    expect(mockRevalidateTag).toHaveBeenCalledWith('awards', { expire: 0 })
    expect(mockRevalidateTag).toHaveBeenCalledWith('rider-jane-doe', { expire: 0 })
  })

  it('does not pre-check for duplicates (allows same rider+award+season twice)', async () => {
    setupHappyPath()

    await assignSeasonAward({ awardId: 'award-sr', riderId: 'rider-1', season: 2024 })
    await assignSeasonAward({ awardId: 'award-sr', riderId: 'rider-1', season: 2024 })

    const inserts = fromCalls.filter((c) => c.table === 'rider_awards')
    expect(inserts.length).toBe(2)
    // No SELECT-then-INSERT pattern — no prior `select` call against rider_awards
    const selects = fromCalls.filter((c) => c.table === 'rider_awards' && c.ops.includes('select'))
    expect(selects.length).toBe(0)
  })

  it('rejects when the award is result-scoped', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'award-pbp', title: 'Paris-Brest-Paris', award_type: 'result' },
        error: null,
      },
    }

    const res = await assignSeasonAward({ awardId: 'award-pbp', riderId: 'rider-1', season: 2024 })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/result-scoped/i)
  })

  it('rejects season < 1980', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'a', title: 'X', award_type: 'season' },
        error: null,
      },
    }

    const res = await assignSeasonAward({ awardId: 'a', riderId: 'r', season: 1979 })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season must be between 1980/i)
  })

  it('rejects season > currentYear + 1', async () => {
    tables.awards = {
      selectResponse: {
        data: { id: 'a', title: 'X', award_type: 'season' },
        error: null,
      },
    }
    const tooFar = new Date().getFullYear() + 2

    const res = await assignSeasonAward({ awardId: 'a', riderId: 'r', season: tooFar })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/season must be between 1980/i)
  })
})
