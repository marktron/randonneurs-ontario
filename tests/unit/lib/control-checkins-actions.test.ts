import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Supabase mock: a thenable query builder (like the real PostgREST builder)
// so it resolves correctly regardless of how deep the chain runs before
// being awaited (`.eq()` alone, `.eq().order()`, `.update().eq()`, etc).
// ============================================================================

type FromCall = {
  table: string
  ops: string[]
  selectColumns?: string
  insertPayload?: unknown
  updatePayload?: unknown
}
const fromCalls: FromCall[] = []

interface TableState {
  selectResponse?: { data: unknown; error: unknown }
  singleResponse?: { data: unknown; error: unknown }
  maybeSingleResponse?: { data: unknown; error: unknown }
  insertResponse?: { data: unknown; error: unknown }
  updateResponse?: { data: unknown; error: unknown }
  deleteResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

function resolveResponse(call: FromCall, state: TableState) {
  if (call.ops.includes('insert')) return state.insertResponse ?? { data: null, error: null }
  if (call.ops.includes('update')) return state.updateResponse ?? { data: null, error: null }
  if (call.ops.includes('delete')) return state.deleteResponse ?? { data: null, error: null }
  if (call.ops.includes('maybeSingle')) {
    return state.maybeSingleResponse ?? state.selectResponse ?? { data: null, error: null }
  }
  if (call.ops.includes('single')) {
    return state.singleResponse ?? state.selectResponse ?? { data: null, error: null }
  }
  return state.selectResponse ?? { data: [], error: null }
}

const mockFrom = vi.fn((table: string) => {
  const call: FromCall = { table, ops: [] }
  fromCalls.push(call)
  const state = tables[table] ?? {}

  const builder: Record<string, unknown> = {
    select: vi.fn((columns?: string) => {
      call.ops.push('select')
      call.selectColumns = columns
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
    in: vi.fn(() => {
      call.ops.push('in')
      return builder
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      return builder
    }),
    maybeSingle: vi.fn(() => {
      call.ops.push('maybeSingle')
      return builder
    }),
    update: vi.fn((payload: unknown) => {
      call.ops.push('update')
      call.updatePayload = payload
      return builder
    }),
    delete: vi.fn(() => {
      call.ops.push('delete')
      return builder
    }),
    insert: vi.fn((payload: unknown) => {
      call.ops.push('insert')
      call.insertPayload = payload
      return builder
    }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resolveResponse(call, state)).then(resolve, reject),
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

const mockAssertEventMutable = vi.fn(
  async (_eventId: string): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true })
)
vi.mock('@/lib/actions/event-mutability', () => ({
  assertEventMutable: (eventId: string) => mockAssertEventMutable(eventId),
}))

import {
  getEventCheckinsForAdmin,
  adminSetCheckin,
  adminDeleteCheckin,
} from '@/lib/actions/control-checkins'

function resetAll() {
  vi.clearAllMocks()
  fromCalls.length = 0
  tables = {}
  mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  mockAssertEventMutable.mockResolvedValue({ ok: true })
}

// ============================================================================
// getEventCheckinsForAdmin
// ============================================================================

describe('getEventCheckinsForAdmin', () => {
  beforeEach(resetAll)

  function setupEvent() {
    tables.events = {
      singleResponse: {
        data: { id: 'event-1', event_date: '2026-07-11', start_time: '08:00', distance_km: 200 },
        error: null,
      },
    }
  }

  it('maps riders, keys check-ins by registration, and passes through the management token', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: {
        data: [{ id: 'control-1', distance_km: 50, radius_m: 500 }],
        error: null,
      },
    }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'tok-abc',
            riders: { first_name: 'Jane', last_name: 'Doe' },
            pre_ride_date: null,
            pre_ride_start_time: null,
          },
          {
            id: 'reg-2',
            rider_id: 'rider-2',
            management_token: null,
            riders: { first_name: 'John', last_name: 'Smith' },
            pre_ride_date: null,
            pre_ride_start_time: null,
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: {
        data: [
          {
            id: 'chk-1',
            control_id: 'control-1',
            registration_id: 'reg-1',
            checked_in_at: '2026-07-11T09:00:00.000Z',
            received_at: '2026-07-11T09:00:00.000Z',
            method: 'gps',
            lat: 43.6532,
            lng: -79.3832,
            accuracy_m: 10,
            distance_to_control_m: 20,
            location_failure_reason: null,
            location_failure_stage: null,
            location_failure_elapsed_ms: null,
            location_failure_context: null,
            note: null,
          },
        ],
        error: null,
      },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toHaveLength(2)
    const rider1 = result.data?.find((r) => r.registrationId === 'reg-1')
    expect(rider1?.riderName).toBe('Jane Doe')
    expect(rider1?.managementToken).toBe('tok-abc')
    expect(rider1?.checkins).toHaveLength(1)
    expect(rider1?.checkins[0].id).toBe('chk-1')
    expect(rider1?.checkins[0].lat).toBe(43.6532)
    expect(rider1?.checkins[0].lng).toBe(-79.3832)
    expect(rider1?.checkins[0].locationFailureReason).toBeNull()
    const rider2 = result.data?.find((r) => r.registrationId === 'reg-2')
    expect(rider2?.managementToken).toBeNull()
    expect(rider2?.checkins).toHaveLength(0)

    // Check-ins are filtered by control_id, not by an unbounded registration_id list.
    const checkinCall = fromCalls.find((c) => c.table === 'control_checkins')
    expect(checkinCall?.ops).toContain('in')
  })

  it('maps bounded no-GPS diagnostics for organizer review', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: {
        data: [{ id: 'control-1', distance_km: 50, radius_m: 500, leg_name: null }],
        error: null,
      },
    }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: { first_name: 'Jane', last_name: 'Doe' },
            pre_ride_date: null,
            pre_ride_start_time: null,
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: {
        data: [
          {
            id: 'chk-1',
            control_id: 'control-1',
            registration_id: 'reg-1',
            checked_in_at: '2026-07-11T09:00:00.000Z',
            received_at: '2026-07-11T09:00:01.000Z',
            method: 'manual',
            lat: null,
            lng: null,
            accuracy_m: null,
            distance_to_control_m: null,
            location_failure_reason: 'timeout',
            location_failure_stage: 'high_accuracy',
            location_failure_elapsed_ms: 42150,
            location_failure_context: 'embedded',
            note: null,
          },
        ],
        error: null,
      },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data![0].checkins[0]).toMatchObject({
      locationFailureReason: 'timeout',
      locationFailureStage: 'high_accuracy',
      locationElapsedMs: 42150,
      locationContext: 'embedded',
    })
    const checkinCall = fromCalls.find((call) => call.table === 'control_checkins')
    expect(checkinCall?.selectColumns).toContain('location_failure_elapsed_ms')
    expect(checkinCall?.selectColumns).toContain('location_failure_context')
    expect(checkinCall?.selectColumns).not.toContain(', location_elapsed_ms')
    expect(checkinCall?.selectColumns).not.toContain(', location_context')
  })

  it('derives no early/late flags for check-ins at leg-tagged controls', async () => {
    // Per-leg distances restart at 0, so the window computed from the event
    // start is wrong for legs 2+. Leg controls carry no window — no false
    // "late" badges in the organizer grid.
    setupEvent()
    tables.event_controls = {
      selectResponse: {
        data: [
          {
            id: 'control-1',
            distance_km: 50,
            radius_m: 500,
            leg_name: 'Leg 2: Haliburton',
          },
        ],
        error: null,
      },
    }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: { first_name: 'Jane', last_name: 'Doe' },
            pre_ride_date: null,
            pre_ride_start_time: null,
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: {
        data: [
          {
            id: 'chk-1',
            control_id: 'control-1',
            registration_id: 'reg-1',
            // Two days after the event start — far beyond any control window.
            checked_in_at: '2026-07-13T13:00:00.000Z',
            received_at: '2026-07-13T13:00:00.000Z',
            method: 'gps',
            lat: 43.6532,
            lng: -79.3832,
            accuracy_m: 10,
            distance_to_control_m: 20,
            note: null,
          },
        ],
        error: null,
      },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    const checkin = result.data![0].checkins[0]
    expect(checkin.flags.late).toBe(false)
    expect(checkin.flags.early).toBe(false)
  })

  it('still derives the late flag for the same check-in at an untagged control (non-vacuous)', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: {
        data: [{ id: 'control-1', distance_km: 50, radius_m: 500, leg_name: null }],
        error: null,
      },
    }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: { first_name: 'Jane', last_name: 'Doe' },
            pre_ride_date: null,
            pre_ride_start_time: null,
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: {
        data: [
          {
            id: 'chk-1',
            control_id: 'control-1',
            registration_id: 'reg-1',
            checked_in_at: '2026-07-13T13:00:00.000Z',
            received_at: '2026-07-13T13:00:00.000Z',
            method: 'gps',
            lat: 43.6532,
            lng: -79.3832,
            accuracy_m: 10,
            distance_to_control_m: 20,
            note: null,
          },
        ],
        error: null,
      },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data![0].checkins[0].flags.late).toBe(true)
  })

  it('returns riders with empty check-ins and skips the check-ins query when there are no controls', async () => {
    setupEvent()
    tables.event_controls = { selectResponse: { data: [], error: null } }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: { first_name: 'Jane', last_name: 'Doe' },
          },
        ],
        error: null,
      },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      {
        registrationId: 'reg-1',
        riderId: 'rider-1',
        riderName: 'Jane Doe',
        managementToken: null,
        checkins: [],
      },
    ])
    expect(fromCalls.find((c) => c.table === 'control_checkins')).toBeUndefined()
  })

  it('returns an empty rider list and skips the check-ins query when there are no registrations', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [{ id: 'control-1', distance_km: 50, radius_m: 500 }], error: null },
    }
    tables.registrations = { selectResponse: { data: [], error: null } }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
    expect(fromCalls.find((c) => c.table === 'control_checkins')).toBeUndefined()
  })

  it('propagates a controls query error instead of silently rendering an empty grid', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: null, error: { code: '500', message: 'boom' } },
    }
    tables.registrations = { selectResponse: { data: [], error: null } }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(false)
  })

  it('propagates a registrations query error instead of silently rendering an empty grid', async () => {
    setupEvent()
    tables.event_controls = { selectResponse: { data: [], error: null } }
    tables.registrations = {
      selectResponse: { data: null, error: { code: '500', message: 'boom' } },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(false)
  })

  it('propagates a check-ins query error', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [{ id: 'control-1', distance_km: 50, radius_m: 500 }], error: null },
    }
    tables.registrations = {
      selectResponse: {
        data: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: { first_name: 'Jane', last_name: 'Doe' },
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: { data: null, error: { code: '500', message: 'boom' } },
    }

    const result = await getEventCheckinsForAdmin('event-1')

    expect(result.success).toBe(false)
  })
})

// ============================================================================
// adminSetCheckin
// ============================================================================

describe('adminSetCheckin', () => {
  beforeEach(resetAll)

  const baseInput = {
    eventId: 'event-1',
    registrationId: 'reg-1',
    controlId: 'control-1',
    checkedInAt: '2026-07-11T09:00:00.000Z',
    note: 'Corrected per rider report',
  }

  function setupOwnership() {
    tables.event_controls = {
      singleResponse: {
        data: { id: 'control-1', event_id: 'event-1', name: 'Control A' },
        error: null,
      },
    }
    tables.registrations = {
      singleResponse: { data: { id: 'reg-1', event_id: 'event-1' }, error: null },
    }
  }

  it('rejects when the note is missing', async () => {
    const result = await adminSetCheckin({ ...baseInput, note: '   ' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/note/i)
    expect(mockAssertEventMutable).not.toHaveBeenCalled()
  })

  it('rejects an invalid check-in time', async () => {
    const result = await adminSetCheckin({ ...baseInput, checkedInAt: 'not-a-date' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid check-in time/i)
  })

  it('rejects when the event is frozen (results submitted)', async () => {
    mockAssertEventMutable.mockResolvedValue({
      ok: false,
      error: 'Results for this event have been submitted; check-ins are frozen',
    })

    const result = await adminSetCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/frozen/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects when the control belongs to a different event', async () => {
    tables.event_controls = {
      singleResponse: {
        data: { id: 'control-1', event_id: 'other-event', name: 'Control A' },
        error: null,
      },
    }
    tables.registrations = {
      singleResponse: { data: { id: 'reg-1', event_id: 'event-1' }, error: null },
    }

    const result = await adminSetCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/control not found/i)
  })

  it('rejects when the registration belongs to a different event', async () => {
    tables.event_controls = {
      singleResponse: {
        data: { id: 'control-1', event_id: 'event-1', name: 'Control A' },
        error: null,
      },
    }
    tables.registrations = {
      singleResponse: { data: { id: 'reg-1', event_id: 'other-event' }, error: null },
    }

    const result = await adminSetCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/registration not found/i)
  })

  it('inserts a new check-in with method=admin when none exists, and logs the audit event', async () => {
    setupOwnership()
    tables.control_checkins = {
      maybeSingleResponse: { data: null, error: null },
      insertResponse: { data: null, error: null },
    }

    const result = await adminSetCheckin(baseInput)

    expect(result.success).toBe(true)
    const insertCall = fromCalls.find(
      (c) => c.table === 'control_checkins' && c.ops.includes('insert')
    )
    expect(insertCall?.insertPayload).toMatchObject({
      control_id: 'control-1',
      registration_id: 'reg-1',
      method: 'admin',
      note: 'Corrected per rider report',
    })
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'update',
        entityType: 'event',
        entityId: 'event-1',
      })
    )
  })

  it('updates the existing check-in when one already exists for this rider/control', async () => {
    setupOwnership()
    tables.control_checkins = {
      maybeSingleResponse: { data: { id: 'chk-existing' }, error: null },
      updateResponse: { data: null, error: null },
    }

    const result = await adminSetCheckin(baseInput)

    expect(result.success).toBe(true)
    const updateCall = fromCalls.find(
      (c) => c.table === 'control_checkins' && c.ops.includes('update')
    )
    expect(updateCall?.updatePayload).toMatchObject({
      method: 'admin',
      note: 'Corrected per rider report',
    })
    // The original phone diagnostic remains evidence even after an organizer
    // corrects the check-in time.
    expect(updateCall?.updatePayload).not.toHaveProperty('location_failure_reason')
    expect(updateCall?.updatePayload).not.toHaveProperty('location_failure_stage')
    expect(updateCall?.updatePayload).not.toHaveProperty('location_failure_elapsed_ms')
    expect(updateCall?.updatePayload).not.toHaveProperty('location_failure_context')
    expect(
      fromCalls.find((c) => c.table === 'control_checkins' && c.ops.includes('insert'))
    ).toBeUndefined()
    expect(mockLogAuditEvent).toHaveBeenCalled()
  })
})

// ============================================================================
// adminDeleteCheckin
// ============================================================================

describe('adminDeleteCheckin', () => {
  beforeEach(resetAll)

  const baseInput = { eventId: 'event-1', checkinId: 'chk-1', note: 'Duplicate tap' }

  it('rejects when the note is missing', async () => {
    const result = await adminDeleteCheckin({ ...baseInput, note: '' })
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/note/i)
    expect(mockAssertEventMutable).not.toHaveBeenCalled()
  })

  it('rejects when the event is frozen (results submitted)', async () => {
    mockAssertEventMutable.mockResolvedValue({ ok: false, error: 'frozen' })

    const result = await adminDeleteCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(fromCalls).toEqual([])
  })

  it('returns a not-found error when the check-in does not exist', async () => {
    tables.control_checkins = { singleResponse: { data: null, error: null } }

    const result = await adminDeleteCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('returns a not-found error when the check-in belongs to a different event', async () => {
    tables.control_checkins = {
      singleResponse: {
        data: {
          id: 'chk-1',
          control_id: 'control-1',
          event_controls: { event_id: 'other-event', name: 'Control A' },
        },
        error: null,
      },
    }

    const result = await adminDeleteCheckin(baseInput)

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not found/i)
  })

  it('deletes the check-in and logs the audit event on success', async () => {
    tables.control_checkins = {
      singleResponse: {
        data: {
          id: 'chk-1',
          control_id: 'control-1',
          event_controls: { event_id: 'event-1', name: 'Control A' },
        },
        error: null,
      },
      deleteResponse: { data: null, error: null },
    }

    const result = await adminDeleteCheckin(baseInput)

    expect(result.success).toBe(true)
    const deleteCall = fromCalls.find(
      (c) => c.table === 'control_checkins' && c.ops.includes('delete')
    )
    expect(deleteCall).toBeTruthy()
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'delete',
        entityType: 'event',
        entityId: 'event-1',
        description: expect.stringContaining('Control A'),
      })
    )
  })
})
