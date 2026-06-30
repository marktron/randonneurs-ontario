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
  // Browser translation extensions (Chrome Translate, etc.) mutate the DOM
  // out from under React; benign and unactionable.
  /removeChild.*not a child of this node/,
  /insertBefore.*not a child of this node/,
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

// Mirrors how Sentry's `ignoreErrors` matches a regex against an event's
// message: the event is dropped if any pattern matches.
export function isIgnoredClientError(message: string): boolean {
  return clientIgnoreErrors.some((pattern) => pattern.test(message))
}
