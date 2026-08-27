import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEventStart } from '@/lib/brevet-card'

type FromCall = {
  table: string
  ops: string[]
  insertPayload?: unknown
  updatePayload?: unknown
  eqArgs: Array<[string, unknown]>
  gteArgs: Array<[string, unknown]>
}
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
  /** Response for `.maybeSingle()` after `.update()`. */
  updateResponse?: { data: unknown; error: unknown }
  /** Response when a `.delete()` chain is awaited. */
  deleteResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [], eqArgs: [], gteArgs: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}
  let inserted = false
  let updated = false
  let deleted = false

  const builder = {
    select: vi.fn(() => {
      call.ops.push('select')
      return builder
    }),
    eq: vi.fn((column: string, value: unknown) => {
      call.ops.push('eq')
      call.eqArgs.push([column, value])
      return builder
    }),
    gte: vi.fn((column: string, value: unknown) => {
      call.ops.push('gte')
      call.gteArgs.push([column, value])
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
    update: vi.fn((payload: unknown) => {
      call.ops.push('update')
      call.updatePayload = payload
      updated = true
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
      const response = updated ? state.updateResponse : state.maybeSingleResponse
      return Promise.resolve(response ?? { data: null, error: null })
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
    pre_ride_date: null as string | null,
    pre_ride_start_time: null as string | null,
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
    leg_name: null,
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
    } as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid gps coordinates/i)
    expect(fromCalls).toEqual([])
  })

  it.each([
    ['latitude only', { lat: 43.65 }],
    ['longitude only', { lng: -79.38 }],
  ])('rejects %s before touching the database', async (_label, coords) => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      ...coords,
    } as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/provided together/i)
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

  it('rejects GPS accuracy without coordinates', async () => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      accuracyM: 12,
    } as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/accuracy requires latitude and longitude/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects a manual-row identity without GPS coordinates', async () => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      expectedManualReceivedAt: new Date().toISOString(),
    } as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/requires gps coordinates/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects an invalid manual-row identity', async () => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: 'not-a-date',
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid manual check-in identity/i)
    expect(fromCalls).toEqual([])
  })

  it.each([
    ['unknown reason', { reason: 'other', stage: 'quick', elapsedMs: 100, context: 'browser' }],
    ['unknown stage', { reason: 'timeout', stage: 'other', elapsedMs: 100, context: 'browser' }],
    ['unknown context', { reason: 'timeout', stage: 'quick', elapsedMs: 100, context: 'other' }],
    [
      'negative elapsed time',
      { reason: 'timeout', stage: 'quick', elapsedMs: -1, context: 'browser' },
    ],
    [
      'elapsed time above the bound',
      { reason: 'timeout', stage: 'quick', elapsedMs: 120_001, context: 'browser' },
    ],
    [
      'fractional elapsed time',
      { reason: 'timeout', stage: 'quick', elapsedMs: 100.5, context: 'browser' },
    ],
    ['partial diagnostic', { reason: 'timeout', stage: 'quick', elapsedMs: 100 }],
  ])('rejects an invalid location diagnostic: %s', async (_label, locationFailure) => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      locationFailure: locationFailure as never,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid location failure details/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects location failure diagnostics on a GPS check-in', async () => {
    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 45_000,
        context: 'browser',
      },
    } as never)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/require a manual check-in/i)
    expect(fromCalls).toEqual([])
  })

  it('persists a bounded diagnostic with a manual check-in', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const nowIso = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: nowIso,
          received_at: nowIso,
          method: 'manual',
          distance_to_control_m: null,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: nowIso,
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 45_000,
        context: 'embedded',
      },
    })

    expect(result.success).toBe(true)
    const insert = fromCalls.find(
      (call) => call.table === 'control_checkins' && call.ops.includes('insert')
    )
    expect(insert?.insertPayload).toMatchObject({
      method: 'manual',
      lat: null,
      lng: null,
      accuracy_m: null,
      location_failure_reason: 'timeout',
      location_failure_stage: 'high_accuracy',
      location_failure_elapsed_ms: 45_000,
      location_failure_context: 'embedded',
    })
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
    expect(result.data!.upgradedFromManual).toBe(false)
    expect(mockHandleFinish).toHaveBeenCalledTimes(1)
  })

  it('atomically upgrades a recent manual check-in without replacing its timestamps', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const originalCheckedInAt = new Date(Date.now() - 30_000).toISOString()
    const originalReceivedAt = new Date(Date.now() - 20_000).toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      updateResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: originalCheckedInAt,
          received_at: originalReceivedAt,
          method: 'gps',
          distance_to_control_m: 0,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      accuracyM: 8,
      expectedManualReceivedAt: originalReceivedAt,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: true,
      checkin: {
        checkedInAt: originalCheckedInAt,
        receivedAt: originalReceivedAt,
        method: 'gps',
      },
    })

    const update = fromCalls.find(
      (call) => call.table === 'control_checkins' && call.ops.includes('update')
    )
    expect(update?.eqArgs).toEqual(
      expect.arrayContaining([
        ['registration_id', 'reg-1'],
        ['control_id', 'ctrl-1'],
        ['method', 'manual'],
        ['received_at', originalReceivedAt],
      ])
    )
    expect(update?.gteArgs[0]?.[0]).toBe('received_at')
    expect(update?.updatePayload).toMatchObject({
      method: 'gps',
      lat: 43.65,
      lng: -79.38,
      accuracy_m: 8,
      location_failure_reason: null,
      location_failure_stage: null,
      location_failure_elapsed_ms: null,
      location_failure_context: null,
    })
    expect(update?.updatePayload).not.toHaveProperty('checked_in_at')
    expect(update?.updatePayload).not.toHaveProperty('received_at')
    // No INSERT or refetch is needed after the conditional UPDATE returns a row.
    expect(
      fromCalls.filter((call) => call.table === 'control_checkins' && call.ops.includes('single'))
    ).toHaveLength(0)
  })

  it('does not let a stale GPS retry upgrade a replacement manual row', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const staleReceivedAt = new Date(Date.now() - 60_000).toISOString()
    const replacementReceivedAt = new Date(Date.now() - 10_000).toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      updateResponse: { data: null, error: null },
      maybeSingleResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: replacementReceivedAt,
          received_at: replacementReceivedAt,
          method: 'manual',
          distance_to_control_m: null,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: staleReceivedAt,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'manual', receivedAt: replacementReceivedAt },
    })
    const update = fromCalls.find(
      (call) => call.table === 'control_checkins' && call.ops.includes('update')
    )
    expect(update?.eqArgs).toContainEqual(['received_at', staleReceivedAt])
  })

  it('does not recreate a manual row removed before a delayed GPS retry arrives', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const removedReceivedAt = new Date(Date.now() - 10_000).toISOString()
    tables.control_checkins = {
      updateResponse: { data: null, error: null },
      maybeSingleResponse: { data: null, error: null },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: removedReceivedAt,
    })

    expect(result.success).toBe(false)
    expect(result.retryable).toBeUndefined()
    expect(result.error).toMatch(/removed before gps could be added/i)
    expect(
      fromCalls.find((call) => call.table === 'control_checkins' && call.ops.includes('insert'))
    ).toBeUndefined()
  })

  it('does not upgrade a manual check-in after the rider window', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const oldReceivedAt = new Date(Date.now() - RIDER_UNDO_WINDOW_MS - 60_000).toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      updateResponse: { data: null, error: null },
      maybeSingleResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: oldReceivedAt,
          received_at: oldReceivedAt,
          method: 'manual',
          distance_to_control_m: null,
        },
        error: null,
      },
    }
    const before = Date.now()

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: oldReceivedAt,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'manual', receivedAt: oldReceivedAt },
    })
    const update = fromCalls.find(
      (call) => call.table === 'control_checkins' && call.ops.includes('update')
    )
    const cutoff = new Date(update!.gteArgs[0][1] as string).getTime()
    expect(cutoff).toBeGreaterThanOrEqual(before - RIDER_UNDO_WINDOW_MS)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - RIDER_UNDO_WINDOW_MS)
  })

  it('never downgrades an existing GPS check-in with a manual retry', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const original = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      singleResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: original,
          received_at: original,
          method: 'gps',
          distance_to_control_m: 0,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      locationFailure: {
        reason: 'timeout',
        stage: 'high_accuracy',
        elapsedMs: 60_000,
        context: 'browser',
      },
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'gps' },
    })
    expect(
      fromCalls.find((call) => call.table === 'control_checkins' && call.ops.includes('update'))
    ).toBeUndefined()
  })

  it('never replaces an organizer check-in with a GPS retry', async () => {
    tables.registrations = { singleResponse: { data: makeRegistration(), error: null } }
    tables.event_controls = { singleResponse: { data: makeControlRow(), error: null } }
    const original = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: { data: null, error: { code: '23505' } },
      updateResponse: { data: null, error: null },
      maybeSingleResponse: {
        data: {
          control_id: 'ctrl-1',
          checked_in_at: original,
          received_at: original,
          method: 'admin',
          distance_to_control_m: null,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-1',
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      expectedManualReceivedAt: original,
    })

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      alreadyExisted: true,
      upgradedFromManual: false,
      checkin: { method: 'admin' },
    })
    const update = fromCalls.find(
      (call) => call.table === 'control_checkins' && call.ops.includes('update')
    )
    expect(update?.eqArgs).toContainEqual(['method', 'manual'])
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

describe('checkInAtControl leg-control flags', () => {
  it('returns no late flag for a check-in at a leg-tagged control', async () => {
    // Same restarted-distance trap as the card read: a 0 km leg-2 control on
    // an event that started 3 hours ago would read "late" if the window were
    // computed; leg controls have no window.
    const past = torontoNowParts(-3 * 60 * 60 * 1000)
    const reg = makeRegistration()
    reg.events.event_date = past.date
    reg.events.start_time = past.time
    tables.registrations = { singleResponse: { data: reg, error: null } }
    tables.event_controls = {
      singleResponse: {
        data: {
          ...makeControlRow(),
          id: 'ctrl-l2',
          position: 3,
          distance_km: 0,
          leg_name: 'Leg 2: Haliburton',
        },
        error: null,
      },
      maybeSingleResponse: { data: { position: 5 }, error: null },
    }
    const nowIso = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: {
        data: {
          control_id: 'ctrl-l2',
          checked_in_at: nowIso,
          received_at: nowIso,
          method: 'gps',
          distance_to_control_m: 0,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-l2',
      checkedInAt: nowIso,
      lat: 43.65,
      lng: -79.38,
      accuracyM: 10,
    })

    expect(result.success).toBe(true)
    expect(result.data!.checkin.flags.late).toBe(false)
    expect(result.data!.checkin.flags.early).toBe(false)
  })
})

describe('checkInAtControl first-control start-time clamp', () => {
  it('records a pre-start first-control check-in at the event start time', async () => {
    // Event starts 30 minutes from now — inside the 2h acceptance window.
    const soon = torontoNowParts(30 * 60 * 1000)
    const reg = makeRegistration()
    reg.events.event_date = soon.date
    reg.events.start_time = soon.time
    tables.registrations = { singleResponse: { data: reg, error: null } }
    tables.event_controls = {
      singleResponse: { data: makeControlRow(), error: null }, // position 1, 0 km
      maybeSingleResponse: { data: { position: 3 }, error: null },
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
      checkedInAt: new Date().toISOString(), // tap: now, before the start
      lat: 43.65,
      lng: -79.38,
      accuracyM: 10,
    })

    expect(result.success).toBe(true)
    const insert = fromCalls.find((c) => c.table === 'control_checkins' && c.ops.includes('insert'))
    const expectedStart = computeEventStart(soon.date, soon.time)
    expect((insert!.insertPayload as { checked_in_at: string }).checked_in_at).toBe(
      expectedStart.toISOString()
    )
  })

  it('does not clamp a pre-start check-in at a later control', async () => {
    const soon = torontoNowParts(30 * 60 * 1000)
    const reg = makeRegistration()
    reg.events.event_date = soon.date
    reg.events.start_time = soon.time
    tables.registrations = { singleResponse: { data: reg, error: null } }
    tables.event_controls = {
      singleResponse: {
        data: { ...makeControlRow(), id: 'ctrl-2', position: 2, distance_km: 100 },
        error: null,
      },
      maybeSingleResponse: { data: { position: 3 }, error: null },
    }
    const tap = new Date().toISOString()
    tables.control_checkins = {
      insertResponse: {
        data: {
          control_id: 'ctrl-2',
          checked_in_at: tap,
          received_at: tap,
          method: 'gps',
          distance_to_control_m: 0,
        },
        error: null,
      },
    }

    const result = await checkInAtControl(TOKEN, {
      controlId: 'ctrl-2',
      checkedInAt: tap,
      lat: 43.65,
      lng: -79.38,
      accuracyM: 10,
    })

    expect(result.success).toBe(true)
    const insert = fromCalls.find((c) => c.table === 'control_checkins' && c.ops.includes('insert'))
    expect((insert!.insertPayload as { checked_in_at: string }).checked_in_at).toBe(tap)
  })

  it('clamps a pre-ride first-control check-in to the pre-ride start', async () => {
    const soon = torontoNowParts(45 * 60 * 1000)
    const reg = makeRegistration() // event itself started an hour ago
    reg.pre_ride_date = soon.date
    reg.pre_ride_start_time = `${soon.time}:00`
    tables.registrations = { singleResponse: { data: reg, error: null } }
    tables.event_controls = {
      singleResponse: { data: makeControlRow(), error: null },
      maybeSingleResponse: { data: { position: 3 }, error: null },
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
      checkedInAt: new Date().toISOString(),
      lat: 43.65,
      lng: -79.38,
      accuracyM: 10,
    })

    expect(result.success).toBe(true)
    const insert = fromCalls.find((c) => c.table === 'control_checkins' && c.ops.includes('insert'))
    const expectedStart = computeEventStart(soon.date, soon.time)
    expect((insert!.insertPayload as { checked_in_at: string }).checked_in_at).toBe(
      expectedStart.toISOString()
    )
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

  it('carries leg_name into the payload as legName', async () => {
    seedHappyTables()
    tables.event_controls = {
      listResponse: {
        data: [{ ...makeControlRow(), position: 1, notes: null, leg_name: 'Leg 1: Gravenhurst' }],
        error: null,
      },
    }

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.controls[0].legName).toBe('Leg 1: Gravenhurst')
  })

  it('returns legName null for single-route controls', async () => {
    seedHappyTables()

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.controls[0].legName).toBeNull()
  })

  it('suppresses the control window for leg-tagged controls (opensAt/closesAt null)', async () => {
    seedHappyTables()
    tables.event_controls = {
      listResponse: {
        data: [{ ...makeControlRow(), position: 1, notes: null, leg_name: 'Leg 1: Gravenhurst' }],
        error: null,
      },
    }

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.controls[0].opensAt).toBeNull()
    expect(card!.controls[0].closesAt).toBeNull()
  })

  it('keeps the computed window for single-route controls', async () => {
    seedHappyTables()

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.controls[0].opensAt).toEqual(expect.any(String))
    expect(card!.controls[0].closesAt).toEqual(expect.any(String))
  })

  it('derives no late flag for a leg-tagged control tap that the restarted distance would call late', async () => {
    // Event started 3 hours ago. A leg-2 control's per-leg distance restarts
    // at 0 km, so the (wrong) window computed from the event start would
    // close 1 hour in — a tap now would read "late". Leg controls have no
    // window: the overall event limit governs.
    const past = torontoNowParts(-3 * 60 * 60 * 1000)
    const reg = makeRegistration()
    reg.events.event_date = past.date
    reg.events.start_time = past.time
    tables.registrations = { singleResponse: { data: reg, error: null } }
    const nowIso = new Date().toISOString()
    tables.event_controls = {
      listResponse: {
        data: [
          {
            ...makeControlRow(),
            id: 'ctrl-l2',
            position: 3,
            distance_km: 0,
            notes: null,
            leg_name: 'Leg 2: Haliburton',
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      listResponse: {
        data: [
          {
            control_id: 'ctrl-l2',
            checked_in_at: nowIso,
            received_at: nowIso,
            method: 'gps',
            distance_to_control_m: 0,
          },
        ],
        error: null,
      },
    }

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.checkins).toHaveLength(1)
    expect(card!.checkins[0].flags.late).toBe(false)
    expect(card!.checkins[0].flags.early).toBe(false)
  })

  it('still derives the late flag for the same tap on a single-route control (non-vacuous)', async () => {
    // Identical setup to the leg test above but with leg_name null: the
    // window applies and the tap 3 hours after a 0 km control's start is late.
    const past = torontoNowParts(-3 * 60 * 60 * 1000)
    const reg = makeRegistration()
    reg.events.event_date = past.date
    reg.events.start_time = past.time
    tables.registrations = { singleResponse: { data: reg, error: null } }
    const nowIso = new Date().toISOString()
    tables.event_controls = {
      listResponse: {
        data: [{ ...makeControlRow(), position: 1, distance_km: 0, notes: null, leg_name: null }],
        error: null,
      },
    }
    tables.control_checkins = {
      listResponse: {
        data: [
          {
            control_id: 'ctrl-1',
            checked_in_at: nowIso,
            received_at: nowIso,
            method: 'gps',
            distance_to_control_m: 0,
          },
        ],
        error: null,
      },
    }

    const card = await getBrevetCardByToken(TOKEN)

    expect(card!.checkins[0].flags.late).toBe(true)
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
