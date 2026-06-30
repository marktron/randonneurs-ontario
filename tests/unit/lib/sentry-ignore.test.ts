import { describe, it, expect } from 'vitest'
import { clientIgnoreErrors, isIgnoredClientError } from '@/lib/sentry-ignore'

describe('isIgnoredClientError', () => {
  it('ignores RSC stream "Connection closed." noise (JAVASCRIPT-NEXTJS-28)', () => {
    // A force-dynamic page streams an RSC (Flight) response. When the browser
    // aborts mid-stream (navigation away, tab close, flaky network) React's
    // client runtime reports Error("Connection closed."). Handled + unactionable.
    expect(isIgnoredClientError('Connection closed.')).toBe(true)
  })

  it('still ignores the existing stale-tab Server Action error', () => {
    expect(isIgnoredClientError('Server Action "abc123" was not found on the server')).toBe(true)
  })

  it('does NOT ignore an unrelated application error', () => {
    expect(isIgnoredClientError('Cannot read properties of undefined')).toBe(false)
  })

  it('does NOT ignore a partial/substring match of "Connection closed."', () => {
    // Anchored regex: only the exact message is noise, not arbitrary text
    // that happens to contain the phrase.
    expect(isIgnoredClientError('Database error: Connection closed. retrying')).toBe(false)
  })

  it('exposes the pattern list for Sentry.init({ ignoreErrors })', () => {
    expect(clientIgnoreErrors.length).toBeGreaterThan(0)
    expect(clientIgnoreErrors.every((p) => p instanceof RegExp)).toBe(true)
  })
})
