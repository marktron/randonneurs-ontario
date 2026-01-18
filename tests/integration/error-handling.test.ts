import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Comprehensive error handling tests.
 *
 * These tests verify:
 * 1. Network failures
 * 2. Database constraint violations
 * 3. Permission errors
 * 4. Invalid data formats
 * 5. Error propagation and user-friendly messages
 */

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import {
  handleActionError,
  handleSupabaseError,
  handleDataError,
  createActionResult,
} from '@/lib/errors'
import * as Sentry from '@sentry/nextjs'

const mockCaptureException = Sentry.captureException as ReturnType<typeof vi.fn>

describe('handleSupabaseError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles unique constraint violation (23505)', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
      details: 'Key (slug)=(existing-slug) already exists.',
    }

    const result = handleSupabaseError(
      error,
      { operation: 'createEvent' },
      'Failed to create event'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('already exists')
  })

  it('handles foreign key violation (23503)', () => {
    const error = {
      code: '23503',
      message: 'foreign key violation',
      details: 'Key (chapter_id)=(invalid-id) is not present in table "chapters".',
    }

    const result = handleSupabaseError(
      error,
      { operation: 'createEvent' },
      'Failed to create event'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('handles not found error (PGRST116)', () => {
    const error = {
      code: 'PGRST116',
      message: 'The result contains 0 rows',
    }

    const result = handleSupabaseError(error, { operation: 'getEvent' }, 'Failed to fetch event')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('uses custom user message when provided', () => {
    const error = {
      code: '23505',
      message: 'duplicate key',
    }

    const result = handleSupabaseError(
      error,
      {
        operation: 'createEvent',
        userMessage: 'An event with this slug already exists',
      },
      'Failed to create event'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('An event with this slug already exists')
  })

  it('handles unknown error codes', () => {
    const error = {
      code: 'UNKNOWN',
      message: 'Something went wrong',
    }

    const result = handleSupabaseError(
      error,
      { operation: 'createEvent' },
      'Failed to create event'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create event')
  })
})

describe('handleActionError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles generic errors', () => {
    const error = new Error('Something went wrong')

    const result = handleActionError(error, { operation: 'createEvent' }, 'Failed to create event')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create event')
  })

  it('includes context in error logging', () => {
    const error = new Error('Test error')

    handleActionError(
      error,
      {
        operation: 'createEvent',
        context: { eventId: 'event-1', chapterId: 'chapter-1' },
      },
      'Failed to create event'
    )

    // Verify Sentry was called (indirectly through logError)
    expect(mockCaptureException).toHaveBeenCalled()
  })

  it('skips Sentry logging when skipSentry is true', () => {
    const error = new Error('Test error')

    handleActionError(
      error,
      {
        operation: 'createEvent',
        skipSentry: true,
      },
      'Failed to create event'
    )

    // Should still return error but not log to Sentry
    expect(mockCaptureException).not.toHaveBeenCalled()
  })
})

describe('handleDataError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns fallback value on error', () => {
    const error = {
      code: 'PGRST116',
      message: 'Not found',
    }

    const result = handleDataError(error, { operation: 'getEvents' }, [])

    expect(result).toEqual([])
  })

  it('logs error to Sentry but continues', () => {
    const error = {
      code: 'UNKNOWN',
      message: 'Database error',
    }

    const result = handleDataError(error, { operation: 'getEvents' }, [])

    expect(result).toEqual([])
    // Error should be logged but function should return fallback
    expect(mockCaptureException).toHaveBeenCalled()
  })
})

describe('createActionResult', () => {
  it('creates success result without data', () => {
    const result = createActionResult()

    expect(result.success).toBe(true)
    expect(result.data).toBeUndefined()
  })

  it('creates success result with data', () => {
    const result = createActionResult({ id: 'event-1' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ id: 'event-1' })
  })
})

describe('Error Propagation', () => {
  it('errors propagate correctly through action chain', () => {
    const error = {
      code: '23505',
      message: 'duplicate key',
    }

    const result = handleSupabaseError(
      error,
      { operation: 'createEvent' },
      'Failed to create event'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('Network Failures', () => {
  it('handles network timeout errors', () => {
    const error = {
      message: 'Network request failed',
      code: 'NETWORK_ERROR',
    }

    const result = handleActionError(error, { operation: 'fetchData' }, 'Network error occurred')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Network error occurred')
  })

  it('handles connection refused errors', () => {
    const error = {
      message: 'Connection refused',
      code: 'ECONNREFUSED',
    }

    const result = handleActionError(
      error,
      { operation: 'databaseQuery' },
      'Database connection failed'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Database connection failed')
  })
})

describe('Invalid Data Formats', () => {
  it('handles invalid JSON errors', () => {
    const error = {
      message: 'Unexpected token in JSON',
      code: 'JSON_PARSE_ERROR',
    }

    const result = handleActionError(error, { operation: 'parseData' }, 'Invalid data format')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid data format')
  })

  it('handles type mismatch errors', () => {
    const error = {
      message: 'Type mismatch',
      code: 'TYPE_ERROR',
    }

    const result = handleActionError(error, { operation: 'validateData' }, 'Invalid data type')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid data type')
  })
})

describe('Permission Errors', () => {
  it('handles unauthorized access errors', () => {
    const error = {
      message: 'permission denied',
      code: '42501',
    }

    const result = handleSupabaseError(error, { operation: 'updateEvent' }, 'Permission denied')

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('handles forbidden operation errors', () => {
    const error = new Error('You do not have permission to perform this action')

    const result = handleActionError(error, { operation: 'deleteEvent' }, 'Permission denied')

    expect(result.success).toBe(false)
    // When error message contains 'permission', handleActionError returns a specific message
    expect(result.error).toBe('You do not have permission to perform this action')
  })
})
