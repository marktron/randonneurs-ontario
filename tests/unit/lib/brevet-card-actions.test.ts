import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEventStart } from '@/lib/brevet-card'

type FromCall = { table: string; ops: string[]; insertPayload?: unknown }
const fromCalls: FromCall[] = []

interface TableState {
  /** Response for `.single()` on a select chain. */
  singleResponse?: { data: unknown; error: unknown }
  /** Response for `.maybeSingle()` on a select chain. */
  maybeSingleResponse?: { data: unknown; error: unknown }
  /** Response when the builder itself is awaited (list queries). */
  listResponse?: { data: unknown; error: unknown }
  /** Response for `.single()` after `.insert()`. */
  insertResponse?: { data: unknown; error: unknown }
  /** Response when a `.delete()` chain is awaited. */
  deleteResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}
  let inserted = false
  let deleted = false

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
    limit: vi.fn(() => {
      call.ops.push('limit')
      return builder
    }),
    insert: vi.fn((payload: unknown) => {
      call.ops.push('insert')
      call.insertPayload = payload
      inserted = true
      return builder
    }),
    delete: vi.fn(() => {
      call.ops.push('delete')
      deleted = true
      return builder
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      const response = inserted ? state.insertResponse : state.singleResponse
      return Promise.resolve(response ?? { data: null, error: null })
    }),
    maybeSingle: vi.fn(() => {
      call.ops.push('maybeSingle')
      return Promise.resolve(state.maybeSingleResponse ?? { data: null, error: null })
    }),
    // Supabase query builders are thenables: awaiting the builder directly
    // runs the list query (controls/check-ins reads) or a delete chain.
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => {
      const response = deleted
        ? (state.deleteResponse ?? { data: null, error: null })
        : (state.listResponse ?? { data: [], error: null })
      return Promise.resolve(response).then(resolve, reject)
    },
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

const { mockHandleFinish, mockRevertFinish } = vi.hoisted(() => ({
  mockHandleFinish: vi.fn(),
  mockRevertFinish: vi.fn(),
}))

vi.mock('@/lib/events/finish-result', () => ({
  handleFinishIfFinalControl: mockHandleFinish,
  revertFinishIfFinalControl: mockRevertFinish,
}))

import { checkInAtControl, getBrevetCardByToken, undoCheckin } from '@/lib/actions/brevet-card'
import { RIDER_UNDO_WINDOW_MS } from '@/lib/brevet-card'

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
    rider_id: 'rider-1',
    events: {
      id: 'evt-1',
      slug: 'test-200',
      name: 'Test 200',
      status: 'scheduled',
      event_type: 'brevet',
      event_date: started.date,
      start_time: started.time,
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    },
    riders: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.com' },
  }
}

function makeControlRow() {
  return {
    id: 'ctrl-1',
    event_id: 'evt-1',
    name: 'Start',
    position: 1,
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

  it('hands a successful check-in to the finish flow with elapsed time', async () => {
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
    expect(mockHandleFinish).toHaveBeenCalledTimes(1)
    const call = mockHandleFinish.mock.calls[0][0]
    expect(call.managementToken).toBe(TOKEN)
    expect(call.finishTime).toMatch(/^\d{1,3}:\d{2}$/)
    expect(call.rider.id).toBe('rider-1')
  })

  it('still calls the finish flow when the check-in already existed (idempotent retry)', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const nowIso = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      singleResponse: {
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
    })

    expect(result.success).toBe(true)
    expect(result.data!.alreadyExisted).toBe(true)
    expect(mockHandleFinish).toHaveBeenCalledTimes(1)
  })

  it('does not call the finish flow when the check-in fails', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    // Control belongs to a different event than the registration's.
    tables.event_controls = {
      singleResponse: { data: { ...makeControlRow(), event_id: 'other-evt' }, error: null },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
    })

    expect(result.success).toBe(false)
    expect(mockHandleFinish).not.toHaveBeenCalled()
  })

  it('treats an unreadable max control position as not-final but still records the check-in', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = {
      singleResponse: { data: makeControlRow(), error: null },
      // The max-position query (run in parallel with the control lookup)
      // fails — same fallback the old sequential query used: not final.
      maybeSingleResponse: { data: null, error: { message: 'boom' } },
    }
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
    })

    expect(result.success).toBe(true)
    expect(mockHandleFinish).toHaveBeenCalledTimes(1)
    expect(mockHandleFinish.mock.calls[0][0].isFinalControl).toBe(false)
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

describe('undoCheckin', () => {
  function seedFoundCheckin(over?: { method?: string; receivedAt?: string }) {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.control_checkins = {
      maybeSingleResponse: {
        data: {
          id: 'checkin-1',
          method: over?.method ?? 'gps',
          received_at: over?.receivedAt ?? new Date().toISOString(),
        },
        error: null,
      },
      deleteResponse: { data: null, error: null },
    }
  }

  it('deletes a recent, rider-recorded check-in', async () => {
    seedFoundCheckin()

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(true)
    const deleteCall = fromCalls.find(
      (c) => c.table === 'control_checkins' && c.ops.includes('delete')
    )
    expect(deleteCall).toBeDefined()
  })

  it('undo hands off to revertFinishIfFinalControl after a successful delete', async () => {
    seedFoundCheckin()
    // The undone control is the event's only (and thus final) control.
    tables.event_controls = {
      singleResponse: { data: { position: 1 }, error: null },
      maybeSingleResponse: { data: { position: 1 }, error: null },
    }

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(true)
    expect(mockRevertFinish).toHaveBeenCalledWith({
      eventId: 'evt-1',
      riderId: 'rider-1',
      isFinalControl: true,
    })
  })

  it('treats an unreadable max control position as not-final but still undoes', async () => {
    seedFoundCheckin()
    tables.event_controls = {
      singleResponse: { data: { position: 1 }, error: null },
      // The max-position query (run in parallel with the delete) fails —
      // same fallback the old sequential query used: not final.
      maybeSingleResponse: { data: null, error: { message: 'boom' } },
    }

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(true)
    expect(mockRevertFinish).toHaveBeenCalledWith(
      expect.objectContaining({ isFinalControl: false })
    )
  })

  it('undo does not call revert when the delete is rejected', async () => {
    seedFoundCheckin({
      receivedAt: new Date(Date.now() - RIDER_UNDO_WINDOW_MS - 60_000).toISOString(),
    })

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(mockRevertFinish).not.toHaveBeenCalled()
  })

  it('rejects when no check-in exists for the control', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.control_checkins = { maybeSingleResponse: { data: null, error: null } }

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/check-in not found/i)
  })

  it('refuses to remove an organizer (admin) check-in', async () => {
    seedFoundCheckin({ method: 'admin' })

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/organizer/i)
  })

  it('rejects once the undo window has passed (based on received_at)', async () => {
    seedFoundCheckin({
      receivedAt: new Date(Date.now() - RIDER_UNDO_WINDOW_MS - 60_000).toISOString(),
    })

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/undo window has passed/i)
  })

  it('rejects when the event is frozen (results submitted)', async () => {
    const reg = makeRegistration()
    reg.events.status = 'submitted'
    tables.registrations = { singleResponse: { data: reg, error: null } }
    tables.control_checkins = {
      maybeSingleResponse: {
        data: { id: 'checkin-1', method: 'gps', received_at: new Date().toISOString() },
        error: null,
      },
    }

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/submitted/i)
    // Frozen check is reached before the check-in is even looked up.
    expect(fromCalls.find((c) => c.table === 'control_checkins')).toBeUndefined()
  })

  it('rejects an unknown token', async () => {
    tables.registrations = {
      singleResponse: { data: null, error: { code: 'PGRST116', message: 'not found' } },
    }

    const result = await undoCheckin(TOKEN, { controlId: 'ctrl-1' })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })
})
