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

  it('ignores the Safari/iOS translate removeChild NotFoundError (JAVASCRIPT-NEXTJS-29)', () => {
    // iOS Safari auto-translate reparents text nodes out from under React; a
    // later reconciliation removeChild then throws a DOMException whose value is
    // "The object can not be found here." Sentry matches ignoreErrors against
    // both the bare value and the "Type: value" form, so both must be dropped.
    expect(isIgnoredClientError('The object can not be found here.')).toBe(true)
    expect(isIgnoredClientError('NotFoundError: The object can not be found here.')).toBe(true)
  })

  it('still ignores the Chrome/Firefox translate removeChild/insertBefore variants', () => {
    expect(
      isIgnoredClientError(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
      )
    ).toBe(true)
    expect(
      isIgnoredClientError(
        "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node."
      )
    ).toBe(true)
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
