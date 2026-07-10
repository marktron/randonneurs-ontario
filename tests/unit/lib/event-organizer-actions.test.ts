import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Supabase mock: a thenable query builder (like the real PostgREST builder)
// so it resolves correctly regardless of how deep the chain runs before
// being awaited (`.eq()` alone, `.delete().in()`, `.upsert()`, etc).
// Mirrors tests/unit/lib/event-controls-actions.test.ts.
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
    limit: vi.fn(() => {
      call.ops.push('limit')
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

const mockLogAuditEvent = vi.fn(async () => undefined)
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: () => mockLogAuditEvent(),
}))

import { getChapterOrganizerDefaults } from '@/lib/actions/event-organizer'

function resetAll() {
  vi.clearAllMocks()
  fromCalls.length = 0
  tables = {}
  mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
}

describe('getChapterOrganizerDefaults', () => {
  beforeEach(resetAll)

  it('returns the chapter_admin name/phone/email for the chapter', async () => {
    tables.admins = {
      selectResponse: {
        data: [{ name: 'Mark Allen', phone: '416-555-0101', email: 'vp@example.ca' }],
        error: null,
      },
    }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: 'Mark Allen', phone: '416-555-0101', email: 'vp@example.ca' })
    const call = fromCalls.find((c) => c.table === 'admins')
    expect(call).toBeDefined()
  })

  it('coalesces null phone/email to empty strings', async () => {
    tables.admins = {
      selectResponse: { data: [{ name: 'VP', phone: null, email: 'a@b.ca' }], error: null },
    }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: 'VP', phone: '', email: 'a@b.ca' })
  })

  it('returns empty strings when the chapter has no chapter_admin', async () => {
    tables.admins = { selectResponse: { data: [], error: null } }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: '', phone: '', email: '' })
  })
})
