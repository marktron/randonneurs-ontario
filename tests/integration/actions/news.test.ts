import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for news actions.
 *
 * These tests focus on:
 * 1. Successful create/update/delete operations
 * 2. Audit logging
 * 3. Error handling
 * 4. Input sanitization (trimming)
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []

  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = [
      'select',
      'eq',
      'neq',
      'gte',
      'lte',
      'gt',
      'lt',
      'not',
      'or',
      'in',
      'order',
      'limit',
      'range',
      'insert',
      'update',
      'delete',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn((...args) => {
        calls.push({ table: currentTable, method, args })
        return builder
      })
    })

    // Terminal methods that return promises
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    builder.then = vi.fn((resolve) => {
      resolve({ data: null, error: null })
    })

    return builder
  }

  let currentTable = ''
  const queryBuilder = createQueryBuilder()

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn((table: string) => {
        currentTable = table
        return queryBuilder
      }),
    })),
    __calls: calls,
    __queryBuilder: queryBuilder,
    __reset: () => {
      calls.length = 0
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockInsertSuccess: (data: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data, error: null })
    },
    __mockInsertError: (error: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi
    .fn()
    .mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', name: 'Test Admin' }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}))

// Import after mocking
import { createNewsItem, updateNewsItem, deleteNewsItem } from '@/lib/actions/news'

// Access mock internals for test configuration
const { __queryBuilder, __reset, __mockInsertSuccess, __mockInsertError } = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockInsertSuccess: (data: unknown) => void
  __mockInsertError: (error: unknown) => void
}>('@/lib/supabase-server')

const { logAuditEvent } = await vi.importMock<{
  logAuditEvent: ReturnType<typeof vi.fn>
}>('@/lib/audit-log')

const validInput = {
  title: 'Test News Item',
  body: 'This is the body of the news item.',
  teaser: '',
  is_published: true,
}

describe('createNewsItem', () => {
  beforeEach(() => {
    __reset()
    vi.clearAllMocks()
  })

  it('returns success with id when insert succeeds', async () => {
    __mockInsertSuccess({ id: 'news-1' })

    const result = await createNewsItem(validInput)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data?.id).toBe('news-1')
    }
  })

  it('logs audit event on success', async () => {
    __mockInsertSuccess({ id: 'news-1' })

    await createNewsItem(validInput)

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'create',
        entityType: 'news',
        entityId: 'news-1',
        description: expect.stringContaining('Test News Item'),
      })
    )
  })

  it('returns error when insert fails', async () => {
    __mockInsertError({ code: '23505', message: 'duplicate' })

    const result = await createNewsItem(validInput)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('trims title and body', async () => {
    __mockInsertSuccess({ id: 'news-2' })

    await createNewsItem({
      title: '  Padded Title  ',
      body: '  Padded Body  ',
      teaser: '  Padded Teaser  ',
      is_published: false,
    })

    // Verify the insert was called - the builder chain passes trimmed values
    expect(__queryBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Padded Title',
        body: 'Padded Body',
      })
    )
  })
})

describe('updateNewsItem', () => {
  beforeEach(() => {
    __reset()
    vi.clearAllMocks()
  })

  it('returns success when update succeeds', async () => {
    const result = await updateNewsItem('news-1', validInput)

    expect(result.success).toBe(true)
  })

  it('logs audit event on success', async () => {
    await updateNewsItem('news-1', validInput)

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'update',
        entityType: 'news',
        entityId: 'news-1',
        description: expect.stringContaining('Test News Item'),
      })
    )
  })

  it('returns error when update fails', async () => {
    // Mock .then to simulate an update error (update uses thenable, not .single)
    __queryBuilder.then.mockImplementationOnce((resolve: (value: unknown) => void) => {
      resolve({ data: null, error: { code: '23503', message: 'foreign key violation' } })
    })

    const result = await updateNewsItem('news-1', validInput)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('deleteNewsItem', () => {
  beforeEach(() => {
    __reset()
    vi.clearAllMocks()
  })

  it('returns success when delete succeeds', async () => {
    // First .single() call fetches the title before deletion
    __queryBuilder.single.mockResolvedValueOnce({ data: { title: 'Test' }, error: null })

    const result = await deleteNewsItem('news-1')

    expect(result.success).toBe(true)
  })

  it('logs audit event with item title', async () => {
    // First .single() call fetches the title before deletion
    __queryBuilder.single.mockResolvedValueOnce({
      data: { title: 'Important Announcement' },
      error: null,
    })

    await deleteNewsItem('news-1')

    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        action: 'delete',
        entityType: 'news',
        entityId: 'news-1',
        description: expect.stringContaining('Important Announcement'),
      })
    )
  })
})
