/**
 * Standardized Error Handling Utilities
 *
 * This module provides consistent error handling patterns across the codebase:
 * - Server actions: Use handleActionError() to return ActionResult
 * - Data fetching: Use handleDataError() for graceful degradation (returns empty arrays/null)
 * - All errors are logged to Sentry and console consistently
 *
 * @see types/actions.ts for ActionResult type definition
 * @see docs/ERROR_HANDLING.md for usage guidelines
 */

import * as Sentry from '@sentry/nextjs'
import type { ActionResult } from '@/types/actions'

/**
 * Error context for better debugging
 */
export interface ErrorContext {
  /** Function or operation name where error occurred */
  operation?: string
  /** Additional context data */
  context?: Record<string, unknown>
  /** User-facing error message (optional, will use default if not provided) */
  userMessage?: string
  /** Whether to skip Sentry logging (default: false) */
  skipSentry?: boolean
}

/**
 * Standard error logging with Sentry integration
 *
 * @param error - The error object or message
 * @param context - Additional context for debugging
 */
export function logError(error: unknown, context?: ErrorContext): void {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const errorObject = error instanceof Error ? error : new Error(errorMessage)

  // Add context to error object
  if (context?.operation) {
    errorObject.name = `${context.operation}: ${errorObject.name}`
  }

  // Console logging (always include 🚨 emoji for easy searching)
  const contextStr = context?.operation ? `[${context.operation}] ` : ''
  console.error(`🚨 ${contextStr}Error:`, errorObject)
  if (context?.context) {
    console.error('🚨 Context:', context.context)
  }

  // Sentry logging (unless explicitly skipped)
  if (!context?.skipSentry) {
    Sentry.captureException(errorObject, {
      tags: {
        operation: context?.operation || 'unknown',
      },
      extra: context?.context || {},
    })
  }
}

/**
 * Handle errors in server actions (returns ActionResult)
 *
 * Use this for all server actions that need to return ActionResult<T>
 *
 * @param error - The error object or message
 * @param context - Additional context for debugging
 * @param defaultMessage - Default user-facing error message
 * @returns ActionResult with success: false
 *
 * @example
 * ```ts
 * try {
 *   // ... operation
 * } catch (error) {
 *   return handleActionError(error, { operation: 'createEvent' }, 'Failed to create event')
 * }
 * ```
 */
export function handleActionError<T = void>(
  error: unknown,
  context?: ErrorContext,
  defaultMessage = 'An unexpected error occurred'
): ActionResult<T> {
  logError(error, context)

  // Handle specific error types
  if (error instanceof Error) {
    // Database constraint violations
    if ('code' in error && error.code === '23505') {
      return {
        success: false,
        error: context?.userMessage || 'A record with this value already exists',
      }
    }

    // Permission errors
    if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      return {
        success: false,
        error: context?.userMessage || 'You do not have permission to perform this action',
      }
    }
  }

  return {
    success: false,
    error: context?.userMessage || defaultMessage,
  }
}

/**
 * Handle Supabase errors in server actions
 *
 * Convenience function for handling Supabase query errors
 *
 * @param supabaseError - Error from Supabase query
 * @param context - Additional context for debugging
 * @param defaultMessage - Default user-facing error message
 * @returns ActionResult with success: false
 *
 * @example
 * ```ts
 * const { data, error } = await supabase.from('events').insert(data)
 * if (error) {
 *   return handleSupabaseError(error, { operation: 'createEvent' }, 'Failed to create event')
 * }
 * ```
 */
export function handleSupabaseError<T = void>(
  supabaseError: { code?: string; message?: string; details?: string } | null,
  context?: ErrorContext,
  defaultMessage = 'Database operation failed'
): ActionResult<T> {
  if (!supabaseError) {
    return {
      success: false,
      error: defaultMessage,
    }
  }

  logError(supabaseError, {
    ...context,
    context: {
      ...context?.context,
      supabaseCode: supabaseError.code,
      supabaseDetails: supabaseError.details,
    },
  })

  // Handle specific Supabase error codes
  if (supabaseError.code === '23505') {
    return {
      success: false,
      error: context?.userMessage || 'A record with this value already exists',
    }
  }

  if (supabaseError.code === '23503') {
    return {
      success: false,
      error: context?.userMessage || 'Referenced record does not exist',
    }
  }

  if (supabaseError.code === 'PGRST116') {
    return {
      success: false,
      error: context?.userMessage || 'Record not found',
    }
  }

  return {
    success: false,
    error: context?.userMessage || defaultMessage,
  }
}

/**
 * Handle errors in data fetching functions (graceful degradation)
 *
 * Use this for data fetching functions that should return empty arrays or null
 * on error (graceful degradation pattern). Errors are logged but don't break the UI.
 *
 * @param error - The error object or message
 * @param context - Additional context for debugging
 * @param fallback - Fallback value to return (default: [])
 * @returns The fallback value
 *
 * @example
 * ```ts
 * const { data, error } = await supabase.from('events').select('*')
 * if (error) {
 *   return handleDataError(error, { operation: 'getEvents' }, [])
 * }
 * ```
 */
export function handleDataError<T>(
  error: unknown,
  context?: ErrorContext,
  fallback: T = [] as T
): T {
  logError(error, context)
  return fallback
}

/**
 * Create a success ActionResult
 *
 * Helper function for consistency
 *
 * @param data - Optional data to return
 * @returns ActionResult with success: true
 *
 * @example
 * ```ts
 * return createActionResult({ id: newEvent.id })
 * ```
 */
export function createActionResult<T = void>(data?: T): ActionResult<T> {
  return {
    success: true,
    ...(data !== undefined && { data }),
  }
}

/**
 * Wrap an async function with standardized error handling
 *
 * Useful for wrapping entire functions with consistent error handling
 *
 * @param fn - The async function to wrap
 * @param context - Context for error logging
 * @param defaultMessage - Default error message for ActionResult
 * @returns Wrapped function that returns ActionResult
 *
 * @example
 * ```ts
 * export const createEvent = wrapActionError(
 *   async (data: CreateEventData) => {
 *     // ... implementation
 *     return createActionResult({ id: event.id })
 *   },
 *   { operation: 'createEvent' },
 *   'Failed to create event'
 * )
 * ```
 */
export function wrapActionError<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  context: ErrorContext,
  defaultMessage = 'An unexpected error occurred'
): (...args: TArgs) => Promise<ActionResult<TReturn extends ActionResult<infer U> ? U : never>> {
  return async (...args: TArgs): Promise<ActionResult<TReturn extends ActionResult<infer U> ? U : never>> => {
    try {
      const result = await fn(...args)
      // If result is already an ActionResult, return it
      if (result && typeof result === 'object' && 'success' in result) {
        return result as ActionResult<TReturn extends ActionResult<infer U> ? U : never>
      }
      // Otherwise wrap it
      return createActionResult(result as TReturn extends ActionResult<infer U> ? U : never)
    } catch (error) {
      return handleActionError(error, context, defaultMessage)
    }
  }
}
