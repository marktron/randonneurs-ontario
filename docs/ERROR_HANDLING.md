# Error Handling Guide

This guide explains the standardized error handling patterns used throughout the Randonneurs Ontario application.

## Overview

All error handling is centralized in `lib/errors.ts` to ensure:
- **Consistency**: All errors follow the same patterns
- **Observability**: All errors are logged to Sentry and console
- **User Experience**: Appropriate error messages for different scenarios
- **Maintainability**: Single source of truth for error handling logic

## Error Handling Patterns

### 1. Server Actions (ActionResult Pattern)

Server actions that modify data should return `ActionResult<T>` and use the error handling utilities.

#### Basic Pattern

```typescript
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export async function createEvent(data: CreateEventData): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const { data: newEvent, error } = await getSupabaseAdmin()
      .from('events')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'createEvent', userMessage: 'An event with this slug already exists' },
        'Failed to create event'
      )
    }

    if (!newEvent) {
      return handleActionError(
        new Error('Event creation returned no data'),
        { operation: 'createEvent' },
        'Failed to create event'
      )
    }

    return createActionResult({ id: newEvent.id })
  } catch (error) {
    return handleActionError(error, { operation: 'createEvent' }, 'Failed to create event')
  }
}
```

#### Key Functions

- **`handleSupabaseError()`**: Use for Supabase query errors
  - Automatically handles common error codes (23505 = duplicate, 23503 = foreign key, etc.)
  - Logs to Sentry with context
  - Returns `ActionResult` with appropriate error message

- **`handleActionError()`**: Use for general errors in try/catch blocks
  - Logs to Sentry with context
  - Returns `ActionResult` with error message

- **`createActionResult()`**: Helper to create success responses
  - Returns `{ success: true, data?: T }`

#### Error Context

Always provide context when handling errors:

```typescript
handleActionError(error, {
  operation: 'createEvent',           // Function/operation name
  context: { eventId, chapterId },    // Additional debugging data
  userMessage: 'Custom user message', // Optional: override default message
  skipSentry: false,                  // Optional: skip Sentry logging (rare)
})
```

### 2. Data Fetching Functions (Graceful Degradation)

Data fetching functions should return empty arrays or `null` on error to allow graceful degradation in the UI.

#### Basic Pattern

```typescript
import { handleDataError } from '@/lib/errors'

export async function getEventsByChapter(urlSlug: string): Promise<Event[]> {
  return unstable_cache(
    async () => {
      const { data: events, error } = await getSupabase()
        .from('events')
        .select('*')
        .eq('status', 'scheduled')

      if (error) {
        return handleDataError(
          error,
          { operation: 'getEventsByChapter', context: { urlSlug } },
          []  // Fallback: empty array
        )
      }

      return events || []
    },
    [`events-by-chapter-${urlSlug}`],
    { tags: ['events'] }
  )()
}
```

#### Key Function

- **`handleDataError()`**: Use for data fetching errors
  - Logs to Sentry (errors are still tracked)
  - Returns fallback value (empty array, null, etc.)
  - UI continues to work with empty data

### 3. Direct Error Logging

For cases where you need to log an error but handle it differently:

```typescript
import { logError } from '@/lib/errors'

// Log error but continue execution
if (someCondition) {
  logError(new Error('Something went wrong'), {
    operation: 'processData',
    context: { userId, dataId },
  })
  // Continue with fallback logic
}
```

## Common Error Scenarios

### Supabase Error Codes

The `handleSupabaseError()` function automatically handles common Supabase error codes:

- **23505**: Unique constraint violation → "A record with this value already exists"
- **23503**: Foreign key violation → "Referenced record does not exist"
- **PGRST116**: Not found → "Record not found"

### Permission Errors

```typescript
if (error.message.includes('permission') || error.message.includes('unauthorized')) {
  return handleActionError(error, {
    operation: 'updateEvent',
    userMessage: 'You do not have permission to perform this action',
  })
}
```

### Validation Errors

For validation errors (user input), return early without logging to Sentry:

```typescript
if (!name.trim() || !chapterId) {
  return { success: false, error: 'Missing required fields' }
  // No Sentry logging needed for validation errors
}
```

## Migration Guide

### Before (Inconsistent)

```typescript
// ❌ Inconsistent error handling
const { data, error } = await supabase.from('events').select('*')

if (error) {
  console.error('Error:', error)  // No Sentry, inconsistent format
  return { success: false, error: 'Failed' }  // Generic message
}
```

### After (Standardized)

```typescript
// ✅ Standardized error handling
const { data, error } = await supabase.from('events').select('*')

if (error) {
  return handleSupabaseError(
    error,
    { operation: 'getEvents', context: { filters } },
    'Failed to fetch events'
  )
}
```

## Best Practices

1. **Always provide operation name**: Makes debugging easier
   ```typescript
   { operation: 'createEvent' }  // ✅ Good
   { operation: 'unknown' }      // ❌ Bad
   ```

2. **Include relevant context**: Helps with debugging
   ```typescript
   { context: { eventId, chapterId, userId } }  // ✅ Good
   { context: {} }                              // ❌ Less helpful
   ```

3. **Use appropriate error handler**:
   - `handleSupabaseError()` for Supabase queries
   - `handleActionError()` for try/catch blocks
   - `handleDataError()` for data fetching (graceful degradation)

4. **Don't log validation errors to Sentry**:
   ```typescript
   // Validation errors are expected, don't log to Sentry
   if (!email || !password) {
     return { success: false, error: 'Email and password are required' }
   }
   ```

5. **Use 🚨 emoji in console.error**: Already handled by `logError()`, but if you need to log manually:
   ```typescript
   console.error('🚨 Error:', error)  // Easy to search for
   ```

## Testing

When testing error handling:

```typescript
import { handleActionError } from '@/lib/errors'
import * as Sentry from '@sentry/nextjs'

// Mock Sentry in tests
jest.mock('@sentry/nextjs')

it('should log errors to Sentry', async () => {
  const error = new Error('Test error')
  const result = handleActionError(error, { operation: 'test' })
  
  expect(result.success).toBe(false)
  expect(Sentry.captureException).toHaveBeenCalled()
})
```

## Related Files

- **`lib/errors.ts`**: Error handling utilities
- **`types/actions.ts`**: `ActionResult<T>` type definition
- **`sentry.server.config.ts`**: Sentry server configuration
- **`sentry.edge.config.ts`**: Sentry edge configuration
- **`instrumentation-client.ts`**: Sentry client configuration

## See Also

- [Data Layer Guide](./DATA_LAYER.md) - Data fetching patterns
- [Architecture Guide](./ARCHITECTURE.md) - Overall architecture
- [Contributing Guide](./CONTRIBUTING.md) - Development guidelines
