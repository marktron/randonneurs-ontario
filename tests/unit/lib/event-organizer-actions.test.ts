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
  if (call.ops.includes('single') || call.ops.includes('maybeSingle')) {
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
    ilike: vi.fn(() => {
      call.ops.push('ilike')
      return builder
    }),
    maybeSingle: vi.fn(() => {
      call.ops.push('maybeSingle')
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

import { getChapterOrganizerDefaults, saveEventOrganizer } from '@/lib/actions/event-organizer'

function resetAll() {
  vi.clearAllMocks()
  fromCalls.length = 0
  tables = {}
  mockRequireAdmin.mockResolvedValue({ id: 'admin-1', role: 'admin' })
}

describe('getChapterOrganizerDefaults', () => {
  beforeEach(resetAll)

  function chapterSlug(slug: string) {
    tables.chapters = { singleResponse: { data: { slug }, error: null } }
  }

  it('uses the chapter VP name/email from CHAPTER_VPS and phone from the admins row', async () => {
    chapterSlug('toronto')
    tables.admins = { selectResponse: { data: [{ phone: '416-555-0101' }], error: null } }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({
      name: 'Mark Allen',
      phone: '416-555-0101',
      email: 'vp-toronto@randonneursontario.ca',
    })
    const call = fromCalls.find((c) => c.table === 'admins')
    expect(call?.ops).toContain('ilike')
  })

  it('returns empty phone when the VP has no admins row', async () => {
    chapterSlug('toronto')
    tables.admins = { selectResponse: { data: [], error: null } }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({
      name: 'Mark Allen',
      phone: '',
      email: 'vp-toronto@randonneursontario.ca',
    })
  })

  it('returns empty phone when the VP admins row has a null phone', async () => {
    chapterSlug('toronto')
    tables.admins = { selectResponse: { data: [{ phone: null }], error: null } }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result.phone).toBe('')
    expect(result.name).toBe('Mark Allen')
  })

  it('falls back to the earliest chapter_admin when the chapter has no VP entry', async () => {
    chapterSlug('nowhere')
    tables.admins = {
      selectResponse: {
        data: [{ name: 'Old Admin', phone: '416-555-0199', email: 'old@example.ca' }],
        error: null,
      },
    }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: 'Old Admin', phone: '416-555-0199', email: 'old@example.ca' })
    const call = fromCalls.find((c) => c.table === 'admins')
    expect(call?.ops).not.toContain('ilike')
  })

  it('coalesces null phone/email to empty strings in the fallback', async () => {
    chapterSlug('nowhere')
    tables.admins = {
      selectResponse: { data: [{ name: 'VP', phone: null, email: null }], error: null },
    }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: 'VP', phone: '', email: '' })
  })

  it('returns empty strings when there is no VP entry and no chapter_admin', async () => {
    chapterSlug('nowhere')
    tables.admins = { selectResponse: { data: [], error: null } }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: '', phone: '', email: '' })
  })

  it('falls back (does not throw) when the chapters lookup errors', async () => {
    tables.chapters = { singleResponse: { data: null, error: { message: 'boom' } } }
    tables.admins = {
      selectResponse: {
        data: [{ name: 'Old Admin', phone: '416-555-0199', email: 'old@example.ca' }],
        error: null,
      },
    }
    const result = await getChapterOrganizerDefaults('chapter-1')
    expect(result).toEqual({ name: 'Old Admin', phone: '416-555-0199', email: 'old@example.ca' })
  })

  it('throws when not an admin', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Unauthorized'))
    await expect(getChapterOrganizerDefaults('chapter-1')).rejects.toThrow('Unauthorized')
  })
})

describe('saveEventOrganizer', () => {
  beforeEach(resetAll)

  it('persists trimmed organizer fields to the event', async () => {
    tables.events = { updateResponse: { data: null, error: null } }
    const result = await saveEventOrganizer('event-1', {
      name: '  Mark Allen ',
      phone: ' 416-555-0101 ',
      email: ' vp@example.ca ',
    })
    expect(result.success).toBe(true)
    const call = fromCalls.find((c) => c.table === 'events' && c.ops.includes('update'))
    expect(call?.updatePayload).toEqual({
      organizer_name: 'Mark Allen',
      organizer_phone: '416-555-0101',
      organizer_email: 'vp@example.ca',
    })
    expect(mockLogAuditEvent).toHaveBeenCalledTimes(1)
  })

  it('stores empty fields as null', async () => {
    tables.events = { updateResponse: { data: null, error: null } }
    const result = await saveEventOrganizer('event-1', { name: '', phone: '   ', email: '' })
    expect(result.success).toBe(true)
    const call = fromCalls.find((c) => c.table === 'events' && c.ops.includes('update'))
    expect(call?.updatePayload).toEqual({
      organizer_name: null,
      organizer_phone: null,
      organizer_email: null,
    })
  })

  describe('admin phone write-back', () => {
    const organizer = {
      name: 'Mark Allen',
      phone: '416-555-0101',
      email: 'vp-toronto@randonneursontario.ca',
    }
    const adminUpdates = () =>
      fromCalls.filter((c) => c.table === 'admins' && c.ops.includes('update'))

    it('updates the matching admin when the phone differs', async () => {
      tables.admins = {
        selectResponse: { data: [{ id: 'a-1', phone: '416-555-9999' }], error: null },
      }
      const result = await saveEventOrganizer('event-1', organizer)
      expect(result.success).toBe(true)
      expect(adminUpdates()).toHaveLength(1)
      expect(adminUpdates()[0].updatePayload).toEqual({ phone: '416-555-0101' })
    })

    it('updates the admin when the stored phone is null', async () => {
      tables.admins = { selectResponse: { data: [{ id: 'a-1', phone: null }], error: null } }
      await saveEventOrganizer('event-1', organizer)
      expect(adminUpdates()[0]?.updatePayload).toEqual({ phone: '416-555-0101' })
    })

    it('does not update when the phone is unchanged', async () => {
      tables.admins = {
        selectResponse: { data: [{ id: 'a-1', phone: '416-555-0101' }], error: null },
      }
      await saveEventOrganizer('event-1', organizer)
      expect(adminUpdates()).toHaveLength(0)
    })

    it('never clears the admin phone when the organizer phone is blank', async () => {
      tables.admins = {
        selectResponse: { data: [{ id: 'a-1', phone: '416-555-9999' }], error: null },
      }
      await saveEventOrganizer('event-1', { ...organizer, phone: '  ' })
      expect(adminUpdates()).toHaveLength(0)
    })

    it('does not update when no admin matches the email', async () => {
      tables.admins = { selectResponse: { data: [], error: null } }
      await saveEventOrganizer('event-1', organizer)
      expect(adminUpdates()).toHaveLength(0)
    })

    it('does not touch admins when the email is blank', async () => {
      await saveEventOrganizer('event-1', { ...organizer, email: '' })
      expect(fromCalls.filter((c) => c.table === 'admins')).toHaveLength(0)
    })

    it('still succeeds when the admins update errors', async () => {
      tables.admins = {
        selectResponse: { data: [{ id: 'a-1', phone: '416-555-9999' }], error: null },
        updateResponse: { data: null, error: { message: 'boom' } },
      }
      const result = await saveEventOrganizer('event-1', organizer)
      expect(result.success).toBe(true)
    })
  })

  it('rejects when not an admin', async () => {
    mockRequireAdmin.mockRejectedValueOnce(new Error('Unauthorized'))
    const result = await saveEventOrganizer('event-1', { name: 'X', phone: '', email: '' })
    expect(result.success).toBe(false)
    expect(fromCalls.find((c) => c.table === 'events' && c.ops.includes('update'))).toBeUndefined()
  })
})
