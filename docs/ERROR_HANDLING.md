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
  operation: 'createEvent', // Function/operation name
  context: { eventId, chapterId }, // Additional debugging data
  userMessage: 'Custom user message', // Optional: override default message
  skipSentry: false, // Optional: skip Sentry logging (rare)
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
          [] // Fallback: empty array
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

#### Caveat: do not cache the fallback (`unstable_cache`)

Graceful degradation is only safe when the fallback is **not cached**. Returning
`[]` from inside an `unstable_cache` callback persists that empty array under the
cache key until the next tag-based revalidation. A transient Supabase 5xx
("Internal server error.") during background ISR revalidation then becomes
**durable bad data** — the page shows no results for an extended period, silently
(Sentry `JAVASCRIPT-NEXTJS-25`).

For data fetchers wrapped in `unstable_cache`:

1. Retry transient failures with **`queryWithRetry()`** (`lib/data/with-retry.ts`),
   which retries HTTP 5xx and transport errors but leaves 4xx/unknown errors
   alone. A single retry absorbs nearly all gateway blips.
2. If an error remains, **throw** instead of returning a fallback. A thrown error
   inside an `unstable_cache` callback is not cached, so Next.js keeps serving the
   last good (stale) page and retries on the next revalidation. The throw is
   reported to Sentry via `captureRequestError` (`instrumentation.ts`); pass
   `skipSentry: true` to `logError` first if you want a console breadcrumb with
   context without a duplicate Sentry event.

```typescript
import { logError } from '@/lib/errors'
import { queryWithRetry } from '@/lib/data/with-retry'

const result = await queryWithRetry(() =>
  getSupabase().from('events').select('*').eq('status', 'scheduled')
)
if (result.error || !result.data) {
  logError(result.error ?? new Error('No data'), {
    operation: 'getEventsByChapter',
    context: { urlSlug },
    skipSentry: true,
  })
  throw new Error(`getEventsByChapter failed for ${urlSlug}: ${result.error?.message}`)
}
return result.data
```

`handleDataError()` returning a fallback is still correct for **uncached** reads,
where the empty result lives only for that single request.

All cached fetchers in `lib/data/results.ts` (`getChapterResults`,
`getAvailableYears`, `getRiderBySlug`, `getRiderResults`) follow this
retry-then-throw pattern for their primary queries. Best-effort enrichment
queries (e.g. season-scoped awards) are intentionally left to degrade silently,
since they don't determine whether the cached entry is empty.

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
  console.error('Error:', error) // No Sentry, inconsistent format
  return { success: false, error: 'Failed' } // Generic message
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
   {
     operation: 'createEvent'
   } // ✅ Good
   {
     operation: 'unknown'
   } // ❌ Bad
   ```

2. **Include relevant context**: Helps with debugging

   ```typescript
   {
     context: {
       ;(eventId, chapterId, userId)
     }
   } // ✅ Good
   {
     context: {
     }
   } // ❌ Less helpful
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
   console.error('🚨 Error:', error) // Easy to search for
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

## Global Error Boundary & Browser Noise

`app/global-error.tsx` is the App Router top-level error boundary. It reports
caught errors to Sentry, normalizing non-`Error` throws via
`normalizeGlobalError()` in `lib/global-error.ts`.

Browsers can surface **benign resource-load failures** to this boundary as a
DOM `Event` rather than a real `Error` — for example a `<script>` in `<head>`
failing to load because of an ad blocker, browser extension, or a transient
network blip. These carry no useful stack and impact no users.
`normalizeGlobalError()` returns `null` for such DOM `Event` values so the
boundary skips reporting them (previously they were wrapped into a synthetic
`Error: Non-Error thrown: {"isTrusted":true}` and sent to Sentry as noise —
Sentry issue `JAVASCRIPT-NEXTJS-26`).

This complements the `ignoreErrors` list in `instrumentation-client.ts`, which
filters by message string. The synthetic message bypassed that list, so the
filtering is done at the source instead.

### Client `ignoreErrors` list

The client-side `ignoreErrors` patterns live in `lib/sentry-ignore.ts`
(`clientIgnoreErrors`), extracted from `instrumentation-client.ts` so they can
be unit tested (`tests/unit/lib/sentry-ignore.test.ts`). Each pattern targets
benign, unactionable browser noise and carries an inline rationale.

One such pattern is `/^Connection closed\.$/` (Sentry issue
`JAVASCRIPT-NEXTJS-28`). Pages marked `export const dynamic = 'force-dynamic'`
(e.g. `app/registration/manage/[token]/page.tsx`) stream their React Server Component
(Flight) response to the browser. When the browser aborts that stream mid-load
— the user navigates away, closes the tab, or hits a flaky connection — React's
client runtime reports `Error: Connection closed.`. It is handled, has zero user
impact, and its stack contains no first-party frames, so it is filtered rather
than fixed.

Browser auto-translation is another source of benign noise. When a translator
(Chrome Translate, iOS Safari translate, etc.) rewrites text nodes, it reparents
them out from under React; a later reconciliation `removeChild`/`insertBefore`
then fails because the node is no longer where React left it. React handles it
and the user sees nothing. Chrome/Firefox phrase this as `...not a child of this
node`; **Safari/iOS phrases it differently** — a `NotFoundError` DOMException
(code 8) with value `The object can not be found here.`, so it needs its own
pattern `/The object can not be found here\./` (Sentry issue
`JAVASCRIPT-NEXTJS-29`).

Android WebView tooling is a third source. Autofill/password-manager apps
inject a script (`scanForForms`) into pages and call back into their host app
through a `@JavascriptInterface` bridge; when that bridge call fails, the
injected script throws `Error invoking <method>: Java bridge method invocation
error` (Sentry issue `JAVASCRIPT-NEXTJS-2H`). The stack contains only the
injected `<anonymous>` script — no first-party frames — so it is filtered with
`/Java bridge method invocation error/`, alongside the related
`/Java object is gone/` pattern for the same class of Android bridge noise.

### Server `ignoreErrors` list

Server-side request errors reach Sentry through
`onRequestError = Sentry.captureRequestError` (`instrumentation.ts`) and **never
pass through the client `ignoreErrors` list**. Benign server noise is filtered
separately via `serverIgnoreErrors` in `lib/sentry-ignore.ts`, wired into
`sentry.server.config.ts`'s `Sentry.init({ ignoreErrors })`. Sentry runs
`ignoreErrors` in `beforeSend` for every event, including `captureRequestError`
ones, so a message match there drops the event.

Three kinds of pattern live in the server list:

- `/Invalid character in header content/` — bots/fuzzers request URLs with
  control chars (e.g. `/%0A`), which crash inside Next.js when it writes the slug
  into the `x-next-cache-tags` response header. Framework bug, no user impact.
- `/Failed to find Server Action/` (Sentry issue `JAVASCRIPT-NEXTJS-2A`) — the
  **server-side** counterpart of the stale-tab Server Action case. Action IDs are
  minted per build, so after a deploy a browser tab still on the old build POSTs
  an ID the new build doesn't know (`POST /page`), and Next.js throws `Failed to
find Server Action. This request might be from an older or newer deployment.`
  before self-recovering the client with a hard navigation. Handled by the
  framework, benign. This is distinct from the **client** pattern `/Server Action
.* was not found on the server/` in `clientIgnoreErrors` — different runtime,
  different wording.
- `/^The destination stream closed early\.$/` and `/^The destination stream
errored while writing data\.$/` (Sentry issue `JAVASCRIPT-NEXTJS-2J`) — the
  **server-side** mirror of the client `/^Connection closed\.$/` filter. When
  React streams a page it attaches `close`/`error` handlers to the destination
  Node stream; if the browser goes away first (navigated away, closed the tab,
  flaky connection, aborted prefetch), that handler aborts the in-flight render
  with one of these messages and Next.js reports it through
  `captureRequestError`. Seen on `GET /riders/[slug]`, but it is route-agnostic
  — any streamed page can produce it. The stack sits entirely inside React/Next's
  `PassThrough` handler with no first-party frames, and the request is already
  gone, so there is nothing to fix. Both patterns are anchored so a real error
  that merely quotes the phrase still reports.

## Related Files

- **`lib/errors.ts`**: Error handling utilities
- **`lib/data/with-retry.ts`**: `queryWithRetry` — retry transient Supabase 5xx in cached fetchers
- **`lib/global-error.ts`**: Global error boundary normalization (`normalizeGlobalError`)
- **`app/global-error.tsx`**: App Router top-level error boundary
- **`types/actions.ts`**: `ActionResult<T>` type definition
- **`sentry.server.config.ts`**: Sentry server configuration
- **`sentry.edge.config.ts`**: Sentry edge configuration
- **`instrumentation-client.ts`**: Sentry client configuration
- **`instrumentation.ts`**: `onRequestError = captureRequestError` — server request error capture
- **`lib/sentry-ignore.ts`**: Client + server `ignoreErrors` patterns (`clientIgnoreErrors`, `serverIgnoreErrors`)

## See Also

- [Data Layer Guide](./DATA_LAYER.md) - Data fetching patterns
- [Architecture Guide](./ARCHITECTURE.md) - Overall architecture
- [Contributing Guide](./CONTRIBUTING.md) - Development guidelines
