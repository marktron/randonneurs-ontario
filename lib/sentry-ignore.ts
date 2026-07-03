// Client-side Sentry `ignoreErrors` patterns, extracted so they can be unit
// tested (see tests/unit/lib/sentry-ignore.test.ts). Imported by
// instrumentation-client.ts into Sentry.init({ ignoreErrors }).
//
// Each entry is benign, unactionable browser noise. Keep the rationale inline
// so future readers know why a pattern is safe to drop.
export const clientIgnoreErrors: RegExp[] = [
  /Invalid call to runtime\.sendMessage/,
  /Java object is gone/,
  /window\.webkit\.messageHandlers/,
  /Event `Event` \(type=error\) captured as exception/,
  /Non-Error promise rejection captured/,
  /^Load failed$/,
  /^network error$/,
  // Firefox's wording for a fetch() aborted at the network layer — user
  // navigated away, closed the tab, hit a flaky connection, or an extension
  // killed the request (e.g. a route prefetch on /). Same benign profile as the
  // Safari "Load failed" and Android Chromium "network error" filters above:
  // unhandled rejection, no first-party frames, zero user impact. Unanchored
  // because the phrase is distinctive and Sentry matches both the bare value and
  // the "TypeError: ..." form (JAVASCRIPT-NEXTJS-2B).
  /NetworkError when attempting to fetch resource/,
  // Browser translation extensions (Chrome Translate, etc.) mutate the DOM
  // out from under React; benign and unactionable.
  /removeChild.*not a child of this node/,
  /insertBefore.*not a child of this node/,
  // Safari/iOS translate variant of the same race: it reparents text nodes, so
  // a later reconciliation removeChild throws a DOMException (code 8) whose value
  // is "The object can not be found here." Same benign, zero-impact, no
  // first-party-frame profile as the Chrome wording above (JAVASCRIPT-NEXTJS-29).
  /The object can not be found here\./,
  // Stale tabs across deploys: server action IDs change per build, so a
  // pre-deploy tab POSTs an ID the new build doesn't know. Next.js
  // self-recovers with a reload.
  /Server Action .* was not found on the server/,
  // Streamed RSC (Flight) response aborted mid-load — the user navigated away,
  // closed the tab, or hit a flaky connection before the stream finished, so
  // React's client runtime reports Error("Connection closed."). Handled by
  // React, zero user impact, no first-party frames (JAVASCRIPT-NEXTJS-28).
  /^Connection closed\.$/,
]

// Server-side `ignoreErrors` patterns. Imported by sentry.server.config.ts.
// Server request errors reach Sentry via `Sentry.captureRequestError`
// (instrumentation.ts) and never pass through the client list above, so
// server-only noise must be filtered here.
export const serverIgnoreErrors: RegExp[] = [
  // Bots/fuzzers requesting URLs with control chars (e.g. /%0A) crash inside
  // Next.js when it tries to write the slug into the x-next-cache-tags
  // response header. Framework bug, no user impact.
  /Invalid character in header content/,
  // Stale-deploy Server Action: a pre-deploy browser tab POSTs an action ID the
  // new build no longer knows (action IDs are per-build). Next.js throws
  // server-side ("Failed to find Server Action...") then self-recovers the
  // client with a hard navigation to the new build. Handled by the framework,
  // benign (JAVASCRIPT-NEXTJS-2A). The client variant ("Server Action ... was
  // not found on the server") is filtered separately in clientIgnoreErrors.
  /Failed to find Server Action/,
]

// Mirrors how Sentry's `ignoreErrors` matches a regex against an event's
// message: the event is dropped if any pattern matches.
export function isIgnoredClientError(message: string): boolean {
  return clientIgnoreErrors.some((pattern) => pattern.test(message))
}

export function isIgnoredServerError(message: string): boolean {
  return serverIgnoreErrors.some((pattern) => pattern.test(message))
}
