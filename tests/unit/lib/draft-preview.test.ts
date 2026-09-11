import { describe, it, expect, afterEach, vi } from 'vitest'
import { isDraftPreviewEnabled } from '@/lib/draft-preview'

describe('isDraftPreviewEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns true when SHOW_DRAFT_EVENTS is exactly "true"', () => {
    vi.stubEnv('SHOW_DRAFT_EVENTS', 'true')
    expect(isDraftPreviewEnabled()).toBe(true)
  })

  it('returns false for "TRUE" (case-sensitive)', () => {
    vi.stubEnv('SHOW_DRAFT_EVENTS', 'TRUE')
    expect(isDraftPreviewEnabled()).toBe(false)
  })

  it('returns false for "1"', () => {
    vi.stubEnv('SHOW_DRAFT_EVENTS', '1')
    expect(isDraftPreviewEnabled()).toBe(false)
  })

  it('returns false when unset', () => {
    vi.stubEnv('SHOW_DRAFT_EVENTS', undefined)
    expect(isDraftPreviewEnabled()).toBe(false)
  })

  it('returns false when set to an empty string', () => {
    vi.stubEnv('SHOW_DRAFT_EVENTS', '')
    expect(isDraftPreviewEnabled()).toBe(false)
  })
})
