import { describe, it, expect } from 'vitest'
import {
  clientIgnoreErrors,
  isIgnoredClientError,
  serverIgnoreErrors,
  isIgnoredServerError,
} from '@/lib/sentry-ignore'

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

  it('ignores the Firefox fetch-abort NetworkError (JAVASCRIPT-NEXTJS-2B)', () => {
    // Firefox's wording for a fetch() aborted at the network layer (navigation
    // away, tab close, flaky connection, extension). Same benign profile as the
    // Safari "Load failed" / Android Chromium "network error" filters: unhandled
    // rejection, no first-party frames, zero user impact. Sentry matches
    // ignoreErrors against both the bare value and the "Type: value" form, so
    // both must be dropped.
    expect(isIgnoredClientError('NetworkError when attempting to fetch resource.')).toBe(true)
    expect(isIgnoredClientError('TypeError: NetworkError when attempting to fetch resource.')).toBe(
      true
    )
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

  it('ignores the Android WebView Java bridge invocation error (JAVASCRIPT-NEXTJS-2H)', () => {
    // An Android autofill/password-manager tool injects a script (scanForForms)
    // into the page and talks to its host app through a @JavascriptInterface
    // bridge; when that bridge call fails, the injected script throws. Not our
    // code (no first-party frames), zero user impact. Unanchored because the
    // failing bridge method name varies ("Error invoking log: ...").
    expect(isIgnoredClientError('Error invoking log: Java bridge method invocation error')).toBe(
      true
    )
    expect(
      isIgnoredClientError('Error: Error invoking log: Java bridge method invocation error')
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

describe('isIgnoredServerError', () => {
  it('ignores the stale-deploy Server Action error (JAVASCRIPT-NEXTJS-2A)', () => {
    // A pre-deploy browser tab POSTs an action ID the new build no longer knows.
    // Next.js throws server-side then self-recovers the client with a hard
    // navigation. Handled by the framework, benign. This is a SERVER error
    // (captureRequestError), so it needs the server list — the client
    // ignoreErrors list never sees it.
    expect(
      isIgnoredServerError(
        'Failed to find Server Action. This request might be from an older or newer deployment.\n' +
          'Read more: https://nextjs.org/docs/messages/failed-to-find-server-action'
      )
    ).toBe(true)
  })

  it('still ignores the bot control-char header error', () => {
    expect(isIgnoredServerError('Invalid character in header content ["x-next-cache-tags"]')).toBe(
      true
    )
  })

  it('ignores the aborted-response stream error (JAVASCRIPT-NEXTJS-2J)', () => {
    // Server-side mirror of the client "Connection closed." filter: the browser
    // closed the response stream (navigated away, closed the tab, flaky
    // connection) before React finished streaming the page, so React's
    // destination "close" handler aborts the render with this message. Handled
    // by React, zero user impact, no first-party frames.
    expect(isIgnoredServerError('The destination stream closed early.')).toBe(true)
  })

  it('ignores the write-side variant of the same aborted stream', () => {
    expect(isIgnoredServerError('The destination stream errored while writing data.')).toBe(true)
  })

  it('does NOT ignore a partial/substring match of the stream-abort messages', () => {
    // Anchored so a real error that merely quotes the phrase still reports.
    expect(
      isIgnoredServerError('Upload failed: The destination stream closed early. retrying')
    ).toBe(false)
  })

  it('does NOT ignore an unrelated server error', () => {
    expect(isIgnoredServerError('Cannot read properties of undefined')).toBe(false)
  })

  it('exposes the server pattern list for Sentry.init({ ignoreErrors })', () => {
    expect(serverIgnoreErrors.length).toBeGreaterThan(0)
    expect(serverIgnoreErrors.every((p) => p instanceof RegExp)).toBe(true)
  })
})
