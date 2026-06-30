/**
 * Retry a Supabase/PostgREST query on transient failures.
 *
 * Supabase occasionally returns a generic HTTP 5xx ("Internal server error.")
 * from the gateway/PostgREST layer — a brief platform blip, connection reset,
 * or cold start — unrelated to the query itself (Sentry JAVASCRIPT-NEXTJS-25).
 * A single retry absorbs almost all of these.
 *
 * Only transient failures are retried:
 * - HTTP 5xx responses, and
 * - thrown transport/network errors (surfaced here as `status: 0`).
 *
 * Client errors (4xx) and errors without a status are returned unchanged — they
 * indicate a real problem (bad query, invalid input) that retrying can't fix.
 *
 * Callers should treat a returned `error` as fatal (e.g. throw) rather than
 * caching a fallback — see `getChapterResults` for why caching an empty result
 * on failure is harmful under `unstable_cache`.
 */

/**
 * Minimal shape `queryWithRetry` inspects. A Supabase/PostgREST response
 * (`PostgrestResponse`, `PostgrestMaybeSingleResponse`, etc.) satisfies it,
 * and `queryWithRetry` returns the caller's exact response type unchanged so
 * `data` keeps its precise typing.
 */
export interface RetryableResponse {
  error: { message?: string; code?: string } | null
  /** HTTP status from the PostgREST response. Absent for synthetic results. */
  status?: number
}

export interface QueryRetryOptions {
  /** Total attempts including the first. Default: 3. */
  attempts?: number
  /** Delay (ms) before the retry following the given attempt number. */
  delayMs?: (attempt: number) => number
}

function isTransientFailure(result: RetryableResponse): boolean {
  if (!result.error) return false
  // status 0 → thrown transport/network error; >=500 → server-side failure.
  return result.status === 0 || (result.status !== undefined && result.status >= 500)
}

export async function queryWithRetry<R extends RetryableResponse>(
  run: () => PromiseLike<R>,
  { attempts = 3, delayMs = (attempt) => 100 * attempt }: QueryRetryOptions = {}
): Promise<R> {
  let result = {
    data: null,
    error: { message: 'queryWithRetry: query was never executed' },
    status: 0,
  } as unknown as R

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      result = await run()
    } catch (thrown) {
      // A rejected promise means a transport/network failure (fetch reject).
      // Mark it transient (status 0) so it is retried.
      result = {
        data: null,
        error: { message: thrown instanceof Error ? thrown.message : String(thrown) },
        status: 0,
      } as unknown as R
    }

    if (!isTransientFailure(result)) return result
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs(attempt)))
  }

  return result
}
