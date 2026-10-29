import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

// The action refuses to run outside Vercel production, so pretend we're there.
vi.stubEnv('VERCEL_ENV', 'production')

afterAll(() => {
  vi.unstubAllEnvs()
})

vi.mock('@/lib/supabase-server', () => {
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []
  let currentTable = ''

  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ['select', 'eq', 'update']) {
    builder[method] = vi.fn((...args) => {
      calls.push({ table: currentTable, method, args })
      return builder
    })
  }
  builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
  builder.then = vi.fn((resolve) => {
    resolve({ data: null, error: null })
  })

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn((table: string) => {
        currentTable = table
        return builder
      }),
    })),
    __calls: calls,
    __reset: () => {
      calls.length = 0
      builder.single.mockReset()
      builder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    },
    __mockRowFound: (row: unknown) => {
      builder.single.mockResolvedValueOnce({ data: row, error: null })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi
    .fn()
    .mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', name: 'Test Admin' }),
}))

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/erw/client', () => ({
  createErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
  updateErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
}))

import { syncEventToErw } from '@/lib/actions/erw-sync'
import { syncNewEventToErw } from '@/lib/events/erw-sync'
import { createErwEvent, updateErwEvent } from '@/lib/erw/client'

const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
  __reset: () => void
  __mockRowFound: (row: unknown) => void
}>('@/lib/supabase-server')

// Fixture years are derived at run time so they never silently expire.
const NEXT_SEASON = new Date().getFullYear() + 1

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    slug: 'next-season-200-200km',
    name: 'Next Season 200',
    description: null,
    distance_km: 200,
    event_date: `${NEXT_SEASON}-06-15`,
    start_time: '07:00',
    event_type: 'brevet',
    erw_event_id: null,
    route_id: null,
    status: 'scheduled',
    ...overrides,
  }
}

describe('syncEventToErw', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('refuses to push a draft to Epic Ride Weather', async () => {
    mockModule.__mockRowFound(eventRow({ status: 'draft' }))

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Publish the event before syncing to Epic Ride Weather')
    }
    expect(createErwEvent).not.toHaveBeenCalled()
    expect(updateErwEvent).not.toHaveBeenCalled()
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('syncs a published event', async () => {
    mockModule.__mockRowFound(eventRow({ route_id: 'route-1' }))
    mockModule.__mockRowFound({ rwgps_id: '12345678' }) // route lookup

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(true)
    expect(createErwEvent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'next-season-200-200km', rwgpsId: '12345678' })
    )
  })

  // A routeless ERW event can never be published, so it sits as a draft and
  // permanently burns one of the account's 10 draft slots.
  it('refuses to create an ERW event for an unlinked event with no route', async () => {
    mockModule.__mockRowFound(eventRow({ route_id: null }))

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Add a Ride with GPS route before syncing to Epic Ride Weather')
    }
    expect(createErwEvent).not.toHaveBeenCalled()
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('refuses to create an ERW event when the route has no rwgps_id', async () => {
    mockModule.__mockRowFound(eventRow({ route_id: 'route-1' }))
    mockModule.__mockRowFound({ rwgps_id: null }) // route lookup

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBe('Add a Ride with GPS route before syncing to Epic Ride Weather')
    }
    expect(createErwEvent).not.toHaveBeenCalled()
  })

  it('still updates an already-linked event that has no route', async () => {
    mockModule.__mockRowFound(eventRow({ route_id: null, erw_event_id: 'erw-existing' }))

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(true)
    expect(updateErwEvent).toHaveBeenCalledWith(
      'erw-existing',
      expect.objectContaining({ rwgpsId: null })
    )
    expect(createErwEvent).not.toHaveBeenCalled()
  })

  it('selects the status column so the draft check can run', async () => {
    mockModule.__mockRowFound(eventRow())

    await syncEventToErw('event-1')

    const select = mockModule.__calls.find((c) => c.table === 'events' && c.method === 'select')
    expect(String(select?.args?.[0])).toContain('status')
  })
})

describe('syncNewEventToErw', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  function syncable(overrides: Record<string, unknown> = {}) {
    return {
      id: 'event-1',
      name: 'Next Season 200',
      description: null,
      distance_km: 200,
      event_date: `${NEXT_SEASON}-06-15`,
      start_time: '07:00',
      slug: 'next-season-200-200km',
      route_id: 'route-1',
      event_type: 'brevet',
      ...overrides,
    }
  }

  it('skips an event with no route without calling ERW', async () => {
    const outcome = await syncNewEventToErw(syncable({ route_id: null }))

    expect(outcome).toBe('skipped')
    expect(createErwEvent).not.toHaveBeenCalled()
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('skips an event whose route has no rwgps_id (e.g. a collection route)', async () => {
    mockModule.__mockRowFound({ rwgps_id: null }) // route lookup

    const outcome = await syncNewEventToErw(syncable())

    expect(outcome).toBe('skipped')
    expect(createErwEvent).not.toHaveBeenCalled()
    expect(mockModule.__calls.filter((c) => c.method === 'update')).toHaveLength(0)
  })

  it('creates the ERW event and stores the ids for a routed event', async () => {
    mockModule.__mockRowFound({ rwgps_id: '12345678' }) // route lookup

    const outcome = await syncNewEventToErw(syncable())

    expect(outcome).toBe('synced')
    expect(createErwEvent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'next-season-200-200km', rwgpsId: '12345678' })
    )
    const update = mockModule.__calls.find((c) => c.table === 'events' && c.method === 'update')
    expect(update?.args?.[0]).toEqual({
      erw_event_id: 'erw-test-123',
      erw_canonical_url: 'https://events.epicrideweather.com/events/erw-test-123',
    })
  })

  it('skips a permanent without looking up the route', async () => {
    const outcome = await syncNewEventToErw(syncable({ event_type: 'permanent' }))

    expect(outcome).toBe('skipped')
    expect(createErwEvent).not.toHaveBeenCalled()
    expect(mockModule.__calls).toHaveLength(0)
  })
})
