import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as Sentry from '@sentry/nextjs'
import {
  logError,
  handleActionError,
  handleSupabaseError,
  handleDataError,
  createActionResult,
} from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

describe('lib/errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('logError', () => {
    it('should log error to console with 🚨 emoji', () => {
      const error = new Error('Test error')
      logError(error, { operation: 'testOperation' })

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('🚨'),
        expect.anything()
      )
    })

    it('should log to Sentry by default', () => {
      const error = new Error('Test error')
      logError(error, { operation: 'testOperation' })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          tags: { operation: 'testOperation' },
        })
      )
    })

    it('should skip Sentry when skipSentry is true', () => {
      const error = new Error('Test error')
      logError(error, { operation: 'testOperation', skipSentry: true })

      expect(Sentry.captureException).not.toHaveBeenCalled()
    })

    it('should include context in Sentry extra data', () => {
      const error = new Error('Test error')
      const context = { userId: '123', eventId: '456' }
      logError(error, { operation: 'testOperation', context })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: context,
        })
      )
    })

    it('should handle string errors', () => {
      logError('String error', { operation: 'testOperation' })

      expect(Sentry.captureException).toHaveBeenCalled()
      expect(console.error).toHaveBeenCalled()
    })
  })

  describe('handleActionError', () => {
    it('should return ActionResult with success: false', () => {
      const error = new Error('Test error')
      const result = handleActionError(error, { operation: 'testOperation' })

      expect(result).toEqual({
        success: false,
        error: 'An unexpected error occurred',
      })
    })

    it('should use custom user message when provided', () => {
      const error = new Error('Test error')
      const result = handleActionError(
        error,
        { operation: 'testOperation', userMessage: 'Custom error message' },
        'Default message'
      )

      expect(result).toEqual({
        success: false,
        error: 'Custom error message',
      })
    })

    it('should use default message when userMessage not provided', () => {
      const error = new Error('Test error')
      const result = handleActionError(
        error,
        { operation: 'testOperation' },
        'Custom default message'
      )

      expect(result).toEqual({
        success: false,
        error: 'Custom default message',
      })
    })

    it('should handle database constraint violations', () => {
      const error = new Error('Duplicate key')
      ;(error as any).code = '23505'
      const result = handleActionError(error, { operation: 'testOperation' })

      expect(result).toEqual({
        success: false,
        error: 'A record with this value already exists',
      })
    })

    it('should handle permission errors', () => {
      const error = new Error('Permission denied')
      const result = handleActionError(error, { operation: 'testOperation' })

      // Should still log and return default message
      expect(result.success).toBe(false)
      expect(Sentry.captureException).toHaveBeenCalled()
    })
  })

  describe('handleSupabaseError', () => {
    it('should return ActionResult with success: false for null error', () => {
      const result = handleSupabaseError(null, { operation: 'testOperation' })

      expect(result).toEqual({
        success: false,
        error: 'Database operation failed',
      })
    })

    it('should handle duplicate key error (23505)', () => {
      const error = { code: '23505', message: 'Duplicate key' }
      const result = handleSupabaseError(
        error,
        { operation: 'testOperation' },
        'Default message'
      )

      expect(result).toEqual({
        success: false,
        error: 'A record with this value already exists',
      })
    })

    it('should handle foreign key violation (23503)', () => {
      const error = { code: '23503', message: 'Foreign key violation' }
      const result = handleSupabaseError(error, { operation: 'testOperation' })

      expect(result).toEqual({
        success: false,
        error: 'Referenced record does not exist',
      })
    })

    it('should handle not found error (PGRST116)', () => {
      const error = { code: 'PGRST116', message: 'Not found' }
      const result = handleSupabaseError(error, { operation: 'testOperation' })

      expect(result).toEqual({
        success: false,
        error: 'Record not found',
      })
    })

    it('should use custom user message when provided', () => {
      const error = { code: '23505', message: 'Duplicate' }
      const result = handleSupabaseError(
        error,
        { operation: 'testOperation', userMessage: 'Custom duplicate message' },
        'Default message'
      )

      expect(result).toEqual({
        success: false,
        error: 'Custom duplicate message',
      })
    })

    it('should include Supabase error details in context', () => {
      const error = { code: '23505', message: 'Duplicate', details: 'Details here' }
      handleSupabaseError(error, { operation: 'testOperation' })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          extra: expect.objectContaining({
            supabaseCode: '23505',
            supabaseDetails: 'Details here',
          }),
        })
      )
    })
  })

  describe('handleDataError', () => {
    it('should return fallback value (empty array by default)', () => {
      const error = new Error('Test error')
      const result = handleDataError(error, { operation: 'testOperation' })

      expect(result).toEqual([])
    })

    it('should return custom fallback value', () => {
      const error = new Error('Test error')
      const result = handleDataError(
        error,
        { operation: 'testOperation' },
        null
      )

      expect(result).toBeNull()
    })

    it('should log error to Sentry', () => {
      const error = new Error('Test error')
      handleDataError(error, { operation: 'testOperation' })

      expect(Sentry.captureException).toHaveBeenCalled()
    })

    it('should include context in logs', () => {
      const error = new Error('Test error')
      const context = { urlSlug: 'toronto', year: 2024 }
      handleDataError(error, { operation: 'testOperation', context })

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          extra: context,
        })
      )
    })
  })

  describe('createActionResult', () => {
    it('should create success ActionResult without data', () => {
      const result = createActionResult()

      expect(result).toEqual({
        success: true,
      })
    })

    it('should create success ActionResult with data', () => {
      const data = { id: '123', name: 'Test' }
      const result = createActionResult(data)

      expect(result).toEqual({
        success: true,
        data,
      })
    })

    it('should handle undefined data', () => {
      const result = createActionResult(undefined)

      expect(result).toEqual({
        success: true,
        data: undefined,
      })
    })
  })
})
