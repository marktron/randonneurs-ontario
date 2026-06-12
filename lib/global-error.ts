/**
 * Helpers for the App Router global error boundary (`app/global-error.tsx`).
 *
 * Kept as a pure module so the reporting decision is unit-testable in isolation.
 */

/**
 * Detect benign DOM `Event` throws (e.g. a `<script>` in `<head>` failing to
 * load due to an ad blocker, browser extension, or a transient network blip).
 *
 * React 19 / Next.js can surface such resource-load `error` events to the
 * global error boundary as the `error` prop. They are not real application
 * errors — they carry no useful stack and impact no users — so we drop them
 * rather than manufacture a synthetic exception (JAVASCRIPT-NEXTJS-26).
 */
function isBenignDomEvent(value: unknown): boolean {
  // Primary check: a genuine DOM Event instance (guarded for non-DOM runtimes).
  if (typeof Event !== 'undefined' && value instanceof Event) {
    return true
  }

  // Fallback: an event-like object that lost its prototype (e.g. via a
  // structured clone). Narrowly matched so real error-shaped objects — which
  // never carry `isTrusted` — are still reported.
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { isTrusted?: unknown }).isTrusted === 'boolean' &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}

/**
 * Normalize an unknown value thrown to the global error boundary into the
 * `Error` that should be reported to Sentry.
 *
 * @returns the `Error` to capture, or `null` when the value is benign browser
 *   noise that should not be reported.
 */
export function normalizeGlobalError(error: unknown): Error | null {
  if (isBenignDomEvent(error)) {
    return null
  }

  if (error instanceof Error) {
    return error
  }

  return new Error(`Non-Error thrown: ${stringifySafely(error)}`)
}

/**
 * Describe a thrown non-Error value without ever throwing ourselves — we run
 * inside the global error boundary, where a secondary throw is unrecoverable.
 * `JSON.stringify` raises a `TypeError` on circular structures.
 */
function stringifySafely(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
