import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for event actions.
 *
 * Note: Full database operation tests are covered in E2E tests because
 * Supabase's chainable query builder is complex to mock accurately.
 * These tests focus on:
 * 1. Input validation
 * 2. Business logic that can be tested with minimal mocking
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  // Track call history
  const calls: Array<{ table: string; method: string; args?: unknown[] }> = []

  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'insert', 'update', 'delete']

    methods.forEach(method => {
      builder[method] = vi.fn((...args) => {
        calls.push({ table: currentTable, method, args })
        return builder
      })
    })

    // Terminal methods that return promises
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

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
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    },
    __mockEventFound: (event: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: event, error: null })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', name: 'Test Admin' }),
  getAdmin: vi.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' }),
}))

// Import after mocking
import { deleteEvent, submitEventResults } from '@/lib/actions/events'

// Access mock internals for test configuration
const mockModule = await vi.importMock<{
  __calls: Array<{ table: string; method: string; args?: unknown[] }>
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockEventFound: (event: unknown) => void
}>('@/lib/supabase-server')

describe('deleteEvent', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when event is not found', async () => {
    // Default mock returns null/error for single()
    const result = await deleteEvent('non-existent-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('returns error when trying to delete past event', async () => {
    const pastDate = new Date()
    pastDate.setFullYear(pastDate.getFullYear() - 1)

    mockModule.__mockEventFound({
      id: 'test-event-id',
      event_date: pastDate.toISOString().split('T')[0],
      chapter_id: 'chapter-1',
      event_type: 'brevet',
    })

    const result = await deleteEvent('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Cannot delete past events')
  })
})

describe('submitEventResults', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when event is not found', async () => {
    // Default mock returns null/error for single()
    const result = await submitEventResults('non-existent-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('returns error when event status is already submitted', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'submitted',
      name: 'Test Event',
      event_date: '2025-01-15',
      chapters: { name: 'Toronto' },
    })

    const result = await submitEventResults('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Results have already been submitted')
  })

  it('returns error when event status is not completed', async () => {
    mockModule.__mockEventFound({
      id: 'test-event-id',
      status: 'scheduled', // Not completed
      name: 'Test Event',
      event_date: '2025-01-15',
      chapters: { name: 'Toronto' },
    })

    const result = await submitEventResults('test-event-id')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only completed events can have results submitted')
  })
})
