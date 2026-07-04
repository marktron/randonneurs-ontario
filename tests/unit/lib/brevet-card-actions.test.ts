import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEventStart } from '@/lib/brevet-card'

type FromCall = { table: string; ops: string[]; insertPayload?: unknown }
const fromCalls: FromCall[] = []

interface TableState {
  /** Response for `.single()` on a select chain. */
  singleResponse?: { data: unknown; error: unknown }
  /** Response when the builder itself is awaited (list queries). */
  listResponse?: { data: unknown; error: unknown }
  /** Response for `.single()` after `.insert()`. */
  insertResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}
  let inserted = false

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
      return builder
    }),
    insert: vi.fn((payload: unknown) => {
      call.ops.push('insert')
      call.insertPayload = payload
      inserted = true
      return builder
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      const response = inserted ? state.insertResponse : state.singleResponse
      return Promise.resolve(response ?? { data: null, error: null })
    }),
    // Supabase query builders are thenables: awaiting the builder directly
    // runs the list query (used by the controls/check-ins reads).
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(state.listResponse ?? { data: [], error: null }).then(resolve, reject),
  }
  return builder
})

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

const mockIsRateLimited = vi.fn(() => false)
vi.mock('@/lib/rate-limit', () => ({
  isRateLimited: (...args: unknown[]) => mockIsRateLimited(...(args as [])),
}))

import { checkInAtControl, getBrevetCardByToken } from '@/lib/actions/brevet-card'

const TOKEN = 'test-token'

/**
 * Toronto-local calendar date and wall time for `now + offsetMs`, so the
 * seeded event is "happening now" regardless of the machine's timezone.
 * Never hardcode dates in fixtures.
 */
function torontoNowParts(offsetMs: number): { date: string; time: string } {
  const d = new Date(Date.now() + offsetMs)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

// Event started one hour ago — the check-in acceptance window is open.
const started = torontoNowParts(-60 * 60 * 1000)
const eventStart = computeEventStart(started.date, started.time)

function makeRegistration() {
  return {
    id: 'reg-1',
    status: 'registered',
    events: {
      id: 'evt-1',
      slug: 'test-200',
      name: 'Test 200',
      status: 'scheduled',
      event_type: 'brevet',
      event_date: started.date,
      start_time: started.time,
      distance_km: 200,
      chapters: { name: 'Toronto' },
    },
    riders: { first_name: 'Ada', last_name: 'Lovelace' },
  }
}

function makeControlRow() {
  return {
    id: 'ctrl-1',
    event_id: 'evt-1',
    name: 'Start',
    distance_km: 0,
    lat: 43.65,
    lng: -79.38,
    radius_m: 500,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  fromCalls.length = 0
  tables = {}
  mockIsRateLimited.mockReturnValue(false)
})

describe('checkInAtControl input validation', () => {
  it('marks a rate-limited rejection as retryable', async () => {
    mockIsRateLimited.mockReturnValue(true)

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/too many/i)
    expect(result.retryable).toBe(true)
  })

  it('does not mark validation rejections as retryable', async () => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: 'not-a-date',
    })

    expect(result.success).toBe(false)
    expect(result.retryable).toBeUndefined()
  })

  it.each([
    ['NaN latitude', { lat: NaN, lng: -79.38 }],
    ['NaN longitude', { lat: 43.65, lng: NaN }],
    ['Infinity latitude', { lat: Infinity, lng: -79.38 }],
    ['Infinity longitude', { lat: 43.65, lng: -Infinity }],
  ])('rejects %s before touching the database', async (_label, coords) => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      ...coords,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid gps coordinates/i)
    expect(fromCalls).toEqual([])
  })

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['negative', -5],
    ['absurdly large (over 100 km)', 100_001],
  ])('rejects %s GPS accuracy before touching the database', async (_label, accuracyM) => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      accuracyM,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid gps accuracy/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects a checkedInAt backdated before the acceptance window opened', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }

    // Three hours before the start — an hour before the window opens.
    const backdated = new Date(eventStart.getTime() - 3 * 60 * 60 * 1000)
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: backdated.toISOString(),
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/before check-in opened/i)
    // Rejected before the control is even looked up.
    expect(fromCalls.find((c) => c.table === 'event_controls')).toBeUndefined()
  })

  it('accepts a checkedInAt inside the acceptance window (happy path)', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const nowIso = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: nowIso,
          received_at: nowIso,
          method: 'gps',
          distance_to_control_m: 0,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: nowIso,
      lat: 43.65,
      lng: -79.38,
      accuracyM: 12,
    })

    expect(result.success).toBe(true)
    expect(result.data!.checkin.controlId).toBe('ctrl-1')
    const insertCall = fromCalls.find((c) => c.table === 'control_checkins')
    expect(insertCall?.insertPayload).toMatchObject({ control_id: 'ctrl-1', method: 'gps' })
  })
})

describe('getBrevetCardByToken', () => {
  function seedHappyTables() {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = {
      listResponse: {
        data: [{ ...makeControlRow(), position: 1, notes: null }],
        error: null,
      },
    }
    tables.control_checkins = { listResponse: { data: [], error: null } }
  }

  it('returns the card when both queries succeed', async () => {
    seedHappyTables()

    const card = await getBrevetCardByToken(TOKEN)

    expect(card).not.toBeNull()
    expect(card!.controls.map((c) => c.id)).toEqual(['ctrl-1'])
    expect(card!.checkins).toEqual([])
  })

  it('throws (fails loud) when the controls query errors', async () => {
    seedHappyTables()
    tables.event_controls = { listResponse: { data: null, error: { message: 'boom' } } }

    await expect(getBrevetCardByToken(TOKEN)).rejects.toThrow()
  })

  it('throws (fails loud) when the check-ins query errors', async () => {
    seedHappyTables()
    tables.control_checkins = { listResponse: { data: null, error: { message: 'boom' } } }

    await expect(getBrevetCardByToken(TOKEN)).rejects.toThrow()
  })

  it('still returns null for an unknown token', async () => {
    tables.registrations = {
      singleResponse: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    }

    expect(await getBrevetCardByToken(TOKEN)).toBeNull()
  })
})
