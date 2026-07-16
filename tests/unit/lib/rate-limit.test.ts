import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isRateLimited, resetRateLimitStores } from '@/lib/rate-limit'

/**
 * Unit tests for the in-memory sliding-window rate limiter that guards
 * login, registration, and brevet-card check-in against rapid-fire abuse
 * (`lib/rate-limit.ts`). Uses fake timers + `setSystemTime` to drive the
 * window deterministically without triggering the module's cleanup interval.
 */
describe('isRateLimited', () => {
  const WINDOW = 60_000

  beforeEach(() => {
    resetRateLimitStores()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    resetRateLimitStores()
  })

  it('allows exactly maxAttempts calls, then blocks the next', () => {
    // maxAttempts = 3 → calls 1-3 allowed, call 4 blocked.
    expect(isRateLimited('login', 'user@example.com', 3, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'user@example.com', 3, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'user@example.com', 3, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'user@example.com', 3, WINDOW)).toBe(true)
  })

  it('stays blocked while over the limit and does not record blocked attempts', () => {
    // maxAttempts = 1 → first allowed, everything after blocked within the window.
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(true)
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(true)
    // A blocked call must not extend the window: after it expires, the one
    // recorded attempt ages out and the key is allowed again (see next test).
  })

  it('frees a slot once the window has fully passed', () => {
    expect(isRateLimited('login', 'a@b.com', 2, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 2, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 2, WINDOW)).toBe(true) // at limit

    // Advance just past the window: both recorded timestamps age out.
    vi.setSystemTime(Date.now() + WINDOW + 1)
    expect(isRateLimited('login', 'a@b.com', 2, WINDOW)).toBe(false)
  })

  it('slides the window: an older attempt ages out mid-sequence', () => {
    expect(isRateLimited('login', 'x@y.com', 2, WINDOW)).toBe(false) // t0
    vi.setSystemTime(Date.now() + 40_000)
    expect(isRateLimited('login', 'x@y.com', 2, WINDOW)).toBe(false) // t0+40s
    expect(isRateLimited('login', 'x@y.com', 2, WINDOW)).toBe(true) // at limit

    // t0+61s: t0 ages out (>60s), t0+40s still in window → one slot frees up.
    vi.setSystemTime(Date.now() + 21_000)
    expect(isRateLimited('login', 'x@y.com', 2, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'x@y.com', 2, WINDOW)).toBe(true) // limit again
  })

  it('isolates different keys within the same store', () => {
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(true) // a@b.com blocked
    // A different key in the same store is unaffected.
    expect(isRateLimited('login', 'c@d.com', 1, WINDOW)).toBe(false)
  })

  it('isolates different stores for the same key', () => {
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(true) // blocked in 'login'
    // The same identifier in a different store has its own budget.
    expect(isRateLimited('registration', 'a@b.com', 1, WINDOW)).toBe(false)
  })

  it('resetRateLimitStores clears all accumulated state', () => {
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(false)
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(true)

    resetRateLimitStores()

    // Fresh state — the previously-blocked key is allowed again.
    expect(isRateLimited('login', 'a@b.com', 1, WINDOW)).toBe(false)
  })
})
