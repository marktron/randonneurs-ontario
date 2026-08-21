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
    mockModule.__mockRowFound(eventRow())

    const result = await syncEventToErw('event-1')

    expect(result.success).toBe(true)
    expect(createErwEvent).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'next-season-200-200km' })
    )
  })

  it('selects the status column so the draft check can run', async () => {
    mockModule.__mockRowFound(eventRow())

    await syncEventToErw('event-1')

    const select = mockModule.__calls.find((c) => c.table === 'events' && c.method === 'select')
    expect(String(select?.args?.[0])).toContain('status')
  })
})
