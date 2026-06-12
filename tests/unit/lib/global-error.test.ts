import { describe, it, expect } from 'vitest'
import { normalizeGlobalError } from '@/lib/global-error'

describe('normalizeGlobalError', () => {
  it('returns the same Error instance when given a real Error', () => {
    const error = new Error('boom')
    expect(normalizeGlobalError(error)).toBe(error)
  })

  it('wraps a thrown string into an Error', () => {
    const result = normalizeGlobalError('kaboom')
    expect(result).toBeInstanceOf(Error)
    expect(result?.message).toBe('Non-Error thrown: kaboom')
  })

  it('wraps a thrown plain object into an Error with JSON', () => {
    const result = normalizeGlobalError({ code: 42 })
    expect(result).toBeInstanceOf(Error)
    expect(result?.message).toBe('Non-Error thrown: {"code":42}')
  })

  it('drops a benign DOM error Event (resource-load failure) — returns null', () => {
    // A <script> in <head> that fails to load surfaces here as a DOM Event,
    // not a real Error. It is benign and unactionable noise (JAVASCRIPT-NEXTJS-26).
    const event = new Event('error')
    expect(normalizeGlobalError(event)).toBeNull()
  })

  it('drops an event-like object that lost its prototype (cross-realm / serialized)', () => {
    // An Event that crossed a realm or serialization boundary fails the
    // `instanceof Event` check but keeps its shape, as seen in Sentry:
    // { isTrusted: true, type: 'error', target: 'head > script', currentTarget: null }
    const eventLike = {
      isTrusted: true,
      type: 'error',
      target: 'head > script',
      currentTarget: null,
    }
    expect(normalizeGlobalError(eventLike)).toBeNull()
  })

  it('still reports a real object error that happens to lack isTrusted', () => {
    const result = normalizeGlobalError({ message: 'server exploded', type: 'fatal' })
    expect(result).toBeInstanceOf(Error)
  })

  it('does not throw on a circular object (JSON.stringify would TypeError)', () => {
    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular

    const result = normalizeGlobalError(circular)
    expect(result).toBeInstanceOf(Error)
    expect(result?.message).toContain('Non-Error thrown:')
  })
})
