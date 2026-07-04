import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Supabase mock: a thenable query builder (like the real PostgREST builder)
// so it resolves correctly regardless of how deep the chain runs before
// being awaited (`.eq()` alone, `.delete().in()`, `.upsert()`, etc).
// Mirrors tests/unit/lib/control-checkins-actions.test.ts.
// ============================================================================

type FromCall = {
  table: string
  ops: string[]
  insertPayload?: unknown
  updatePayload?: unknown
  upsertPayload?: unknown
  upsertOptions?: unknown
  inArgs?: unknown[]
}
const fromCalls: FromCall[] = []

interface TableState {
  selectResponse?: { data: unknown; error: unknown }
  singleResponse?: { data: unknown; error: unknown }
  insertResponse?: { data: unknown; error: unknown }
  updateResponse?: { data: unknown; error: unknown }
  upsertResponse?: { data: unknown; error: unknown }
  deleteResponse?: { data: unknown; error: unknown }
}

let tables: Record<string, TableState> = {}

function resolveResponse(call: FromCall, state: TableState) {
  if (call.ops.includes('insert')) return state.insertResponse ?? { data: null, error: null }
  if (call.ops.includes('update')) return state.updateResponse ?? { data: null, error: null }
  if (call.ops.includes('upsert')) return state.upsertResponse ?? { data: null, error: null }
  if (call.ops.includes('delete')) return state.deleteResponse ?? { data: null, error: null }
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
    in: vi.fn((column: unknown, values: unknown) => {
      call.ops.push('in')
      call.inArgs = [column, values]
      return builder
    }),
    single: vi.fn(() => {
      call.ops.push('single')
      return builder
    }),
    update: vi.fn((payload: unknown) => {
      call.ops.push('update')
      call.updatePayload = payload
      return builder
    }),
    upsert: vi.fn((payload: unknown, options?: unknown) => {
      call.ops.push('upsert')
      call.upsertPayload = payload
      call.upsertOptions = options
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

const mockFetchRwgpsControls = vi.fn(
  async (
    _rwgpsId: string
  ): Promise<{ name: string; distance: string; lat: number | null; lng: number | null }[]> => []
)
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsControlsWithCoords: (rwgpsId: string) => mockFetchRwgpsControls(rwgpsId),
}))

import {
  getEventControlsForAdmin,
  saveEventControls,
  importEventControlsFromRwgps,
} from '@/lib/actions/event-controls'

function resetAll() {
  vi.clearAllMocks()
  fromCalls.length = 0
  tables = {}
  mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
  mockAssertEventMutable.mockResolvedValue({ ok: true })
}

function writeCalls() {
  return fromCalls.filter((c) =>
    c.ops.some((op) => op === 'insert' || op === 'update' || op === 'upsert' || op === 'delete')
  )
}

// ============================================================================
// getEventControlsForAdmin
// ============================================================================

describe('getEventControlsForAdmin', () => {
  beforeEach(resetAll)

  it('maps controls with per-control check-in counts', async () => {
    tables.event_controls = {
      selectResponse: {
        data: [
          {
            id: 'ctl-1',
            position: 1,
            name: 'Start',
            distance_km: 0,
            lat: 43.6,
            lng: -79.4,
            radius_m: 500,
            notes: null,
          },
          {
            id: 'ctl-2',
            position: 2,
            name: 'Finish',
            distance_km: 200,
            lat: null,
            lng: null,
            radius_m: 500,
            notes: 'Cafe',
          },
        ],
        error: null,
      },
    }
    tables.control_checkins = {
      selectResponse: {
        data: [{ control_id: 'ctl-1' }, { control_id: 'ctl-1' }],
        error: null,
      },
    }

    const result = await getEventControlsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      {
        id: 'ctl-1',
        position: 1,
        name: 'Start',
        distanceKm: 0,
        lat: 43.6,
        lng: -79.4,
        radiusM: 500,
        notes: null,
        checkinCount: 2,
      },
      {
        id: 'ctl-2',
        position: 2,
        name: 'Finish',
        distanceKm: 200,
        lat: null,
        lng: null,
        radiusM: 500,
        notes: 'Cafe',
        checkinCount: 0,
      },
    ])
  })

  it('skips the check-in count query when there are no controls', async () => {
    tables.event_controls = { selectResponse: { data: [], error: null } }

    const result = await getEventControlsForAdmin('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
    expect(fromCalls.find((c) => c.table === 'control_checkins')).toBeUndefined()
  })

  it('propagates a controls query error', async () => {
    tables.event_controls = {
      selectResponse: { data: null, error: { code: '500', message: 'boom' } },
    }

    const result = await getEventControlsForAdmin('event-1')

    expect(result.success).toBe(false)
  })
})

// ============================================================================
// saveEventControls
// ============================================================================

describe('saveEventControls', () => {
  beforeEach(resetAll)

  const validControl = {
    name: 'Control A',
    distanceKm: 50,
    lat: 43.6,
    lng: -79.4,
    radiusM: 500,
    notes: null,
  }

  function setupEvent() {
    tables.events = {
      singleResponse: { data: { id: 'event-1', name: 'Test 200' }, error: null },
    }
  }

  // --------------------------------------------------------------------------
  // Freeze gate (results submitted)
  // --------------------------------------------------------------------------

  it('rejects when the event is frozen (results submitted) and issues no writes', async () => {
    setupEvent()
    mockAssertEventMutable.mockResolvedValue({
      ok: false,
      error: 'Results for this event have been submitted; check-ins are frozen',
    })

    const result = await saveEventControls('event-1', [validControl])

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/frozen/i)
    expect(mockAssertEventMutable).toHaveBeenCalledWith('event-1')
    // No delete/update/insert/upsert may reach the DB — deleting a control
    // cascade-deletes its check-ins.
    expect(writeCalls()).toEqual([])
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  it('rejects a control without a name before touching the DB', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, name: '   ' }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/name/i)
    expect(fromCalls).toEqual([])
  })

  it('rejects a negative distance', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, distanceKm: -1 }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/distance/i)
  })

  it('rejects a non-positive radius', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, radiusM: 0 }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/radius/i)
  })

  it('rejects latitude without longitude', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, lng: null }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/both latitude and longitude/i)
  })

  it('rejects an out-of-range latitude', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, lat: 91 }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/latitude/i)
  })

  it('rejects an out-of-range longitude', async () => {
    const result = await saveEventControls('event-1', [{ ...validControl, lng: -181 }])
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/longitude/i)
  })

  it('returns an error when the event does not exist', async () => {
    tables.events = { singleResponse: { data: null, error: { code: 'PGRST116' } } }

    const result = await saveEventControls('event-1', [validControl])

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/event not found/i)
  })

  // --------------------------------------------------------------------------
  // Happy path: kept + new + removed rows in batched statements
  // --------------------------------------------------------------------------

  it('saves kept, new, and removed controls in batched statements with positions in route order', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: {
        data: [{ id: 'ctl-a' }, { id: 'ctl-b' }, { id: 'ctl-c' }],
        error: null,
      },
    }

    // Input intentionally out of route order: B (25 km), A (100 km) kept,
    // D (60 km) new, C removed. Route order: B(1), D(2), A(3).
    const result = await saveEventControls('event-1', [
      { id: 'ctl-a', name: 'A', distanceKm: 100, lat: 44, lng: -79, radiusM: 500.4, notes: ' hi ' },
      { id: 'ctl-b', name: ' B ', distanceKm: 25, lat: null, lng: null, radiusM: 250, notes: '' },
      { name: 'D', distanceKm: 60, lat: 43.5, lng: -78.9, radiusM: 500, notes: null },
    ])

    expect(result.success).toBe(true)

    const writes = writeCalls()
    // Exactly 4 write statements: delete removed, shift kept, finalize kept,
    // insert new.
    expect(writes).toHaveLength(4)

    // 1. One batched delete for removed ids (cascade warning handled by UI).
    const deleteCall = writes[0]
    expect(deleteCall.table).toBe('event_controls')
    expect(deleteCall.ops).toContain('delete')
    expect(deleteCall.inArgs).toEqual(['id', ['ctl-c']])

    // 2. One batched upsert shifting kept rows to unique negative positions
    //    so UNIQUE (event_id, position) can't collide mid-save.
    const shiftCall = writes[1]
    expect(shiftCall.ops).toContain('upsert')
    expect(shiftCall.upsertOptions).toEqual({ onConflict: 'id' })
    const shiftRows = shiftCall.upsertPayload as { id: string; position: number }[]
    expect(shiftRows.map((r) => ({ id: r.id, position: r.position }))).toEqual([
      { id: 'ctl-b', position: -1 },
      { id: 'ctl-a', position: -2 },
    ])

    // 3. One batched upsert writing kept rows with final positions and
    //    trimmed/normalized fields.
    const finalCall = writes[2]
    expect(finalCall.ops).toContain('upsert')
    expect(finalCall.upsertOptions).toEqual({ onConflict: 'id' })
    expect(finalCall.upsertPayload).toEqual([
      {
        id: 'ctl-b',
        event_id: 'event-1',
        position: 1,
        name: 'B',
        distance_km: 25,
        lat: null,
        lng: null,
        radius_m: 250,
        notes: null,
      },
      {
        id: 'ctl-a',
        event_id: 'event-1',
        position: 3,
        name: 'A',
        distance_km: 100,
        lat: 44,
        lng: -79,
        radius_m: 500,
        notes: 'hi',
      },
    ])

    // 4. One batched insert for new rows (no id — the DB generates it).
    const insertCall = writes[3]
    expect(insertCall.ops).toContain('insert')
    expect(insertCall.insertPayload).toEqual([
      {
        event_id: 'event-1',
        position: 2,
        name: 'D',
        distance_km: 60,
        lat: 43.5,
        lng: -78.9,
        radius_m: 500,
        notes: null,
      },
    ])

    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'update',
        entityType: 'event',
        entityId: 'event-1',
        description: expect.stringContaining('Saved 3 brevet card controls'),
      })
    )
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('(removed 1)') })
    )
  })

  it('treats an unknown id as a new row (cannot claim a control from another event)', async () => {
    setupEvent()
    tables.event_controls = { selectResponse: { data: [], error: null } }

    const result = await saveEventControls('event-1', [
      { id: 'ctl-foreign', name: 'X', distanceKm: 10, lat: null, lng: null, radiusM: 500 },
    ])

    expect(result.success).toBe(true)
    const writes = writeCalls()
    // No delete, no upserts — just one insert, and the foreign id is dropped.
    expect(writes).toHaveLength(1)
    expect(writes[0].ops).toContain('insert')
    const inserted = writes[0].insertPayload as Record<string, unknown>[]
    expect(inserted[0].id).toBeUndefined()
    expect(inserted[0].position).toBe(1)
  })

  it('deletes all controls with a single statement when saving an empty list', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [{ id: 'ctl-a' }, { id: 'ctl-b' }], error: null },
    }

    const result = await saveEventControls('event-1', [])

    expect(result.success).toBe(true)
    const writes = writeCalls()
    expect(writes).toHaveLength(1)
    expect(writes[0].ops).toContain('delete')
    expect(writes[0].inArgs).toEqual(['id', ['ctl-a', 'ctl-b']])
  })

  it('skips the delete statement when nothing was removed', async () => {
    setupEvent()
    tables.event_controls = { selectResponse: { data: [{ id: 'ctl-a' }], error: null } }

    const result = await saveEventControls('event-1', [
      { id: 'ctl-a', name: 'A', distanceKm: 10, lat: null, lng: null, radiusM: 500 },
    ])

    expect(result.success).toBe(true)
    const writes = writeCalls()
    expect(writes.some((c) => c.ops.includes('delete'))).toBe(false)
    // Shift + finalize for the kept row.
    expect(writes.filter((c) => c.ops.includes('upsert'))).toHaveLength(2)
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.not.stringContaining('removed'),
      })
    )
  })

  it('propagates a delete error and stops before rewriting positions', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [{ id: 'ctl-a' }], error: null },
      deleteResponse: { data: null, error: { code: '500', message: 'boom' } },
    }

    const result = await saveEventControls('event-1', [])

    expect(result.success).toBe(false)
    expect(writeCalls()).toHaveLength(1)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })

  it('propagates an upsert error', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [{ id: 'ctl-a' }], error: null },
      upsertResponse: { data: null, error: { code: '23505', message: 'duplicate' } },
    }

    const result = await saveEventControls('event-1', [
      { id: 'ctl-a', name: 'A', distanceKm: 10, lat: null, lng: null, radiusM: 500 },
    ])

    expect(result.success).toBe(false)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })

  it('propagates an insert error', async () => {
    setupEvent()
    tables.event_controls = {
      selectResponse: { data: [], error: null },
      insertResponse: { data: null, error: { code: '23505', message: 'duplicate' } },
    }

    const result = await saveEventControls('event-1', [validControl])

    expect(result.success).toBe(false)
    expect(mockLogAuditEvent).not.toHaveBeenCalled()
  })
})

// ============================================================================
// importEventControlsFromRwgps
// ============================================================================

describe('importEventControlsFromRwgps', () => {
  beforeEach(resetAll)

  function setupEvent(name: string, distanceKm = 200, rwgpsId: string | null = '12345') {
    tables.events = {
      singleResponse: {
        data: {
          id: 'event-1',
          name,
          distance_km: distanceKm,
          routes: rwgpsId === null ? null : { rwgps_id: rwgpsId },
        },
        error: null,
      },
    }
  }

  it('returns parsed controls in route order for a forward event', async () => {
    setupEvent('Test 200')
    mockFetchRwgpsControls.mockResolvedValue([
      { name: 'Start', distance: '0.0', lat: 43.6, lng: -79.4 },
      { name: 'Mid', distance: '98.7', lat: 44.0, lng: -79.0 },
      { name: 'Finish', distance: '200.0', lat: null, lng: null },
    ])

    const result = await importEventControlsFromRwgps('event-1')

    expect(result.success).toBe(true)
    expect(mockFetchRwgpsControls).toHaveBeenCalledWith('12345')
    expect(result.data).toEqual([
      { name: 'Start', distanceKm: 0, lat: 43.6, lng: -79.4 },
      { name: 'Mid', distanceKm: 98.7, lat: 44.0, lng: -79.0 },
      { name: 'Finish', distanceKm: 200, lat: null, lng: null },
    ])
  })

  it('reverses control order and flips distances for a reversed event, keeping coordinates', async () => {
    setupEvent('Test 200 (Reversed)', 200)
    mockFetchRwgpsControls.mockResolvedValue([
      { name: 'Start', distance: '0.0', lat: 43.6, lng: -79.4 },
      { name: 'Mid', distance: '49.9', lat: 44.0, lng: -79.0 },
      { name: 'Finish', distance: '200.0', lat: 45.0, lng: -78.0 },
    ])

    const result = await importEventControlsFromRwgps('event-1')

    expect(result.success).toBe(true)
    expect(result.data).toEqual([
      // Order reversed; distance flipped to (total - original), rounded to
      // 0.1 km; each control keeps its physical coordinates.
      { name: 'Finish', distanceKm: 0, lat: 45.0, lng: -78.0 },
      { name: 'Mid', distanceKm: 150.1, lat: 44.0, lng: -79.0 },
      { name: 'Start', distanceKm: 200, lat: 43.6, lng: -79.4 },
    ])
  })

  it('returns an error when the event does not exist', async () => {
    tables.events = { singleResponse: { data: null, error: { code: 'PGRST116' } } }

    const result = await importEventControlsFromRwgps('event-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/event not found/i)
    expect(mockFetchRwgpsControls).not.toHaveBeenCalled()
  })

  it('returns an error when the route has no RWGPS id', async () => {
    setupEvent('Test 200', 200, null)

    const result = await importEventControlsFromRwgps('event-1')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no ridewithgps id/i)
    expect(mockFetchRwgpsControls).not.toHaveBeenCalled()
  })

  it('surfaces user-facing fetch errors verbatim', async () => {
    setupEvent('Test 200')
    mockFetchRwgpsControls.mockRejectedValue(
      new Error('No control points found in the RWGPS route. Add controls as course points.')
    )

    const result = await importEventControlsFromRwgps('event-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe(
      'No control points found in the RWGPS route. Add controls as course points.'
    )
  })
})
