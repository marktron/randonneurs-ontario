import { describe, it, expect, afterEach, vi } from 'vitest'
import { getCurrentSeason, getCurrentSeasonLabel } from '@/lib/season'

describe('getCurrentSeason', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the configured season as a number', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', '2027')
    expect(getCurrentSeason()).toBe(2027)
  })

  it('falls back to 2026 when the env var is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', '')
    expect(getCurrentSeason()).toBe(2026)
  })

  it('falls back to 2026 when the env var is not a number', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', 'not-a-year')
    expect(getCurrentSeason()).toBe(2026)
  })
})

describe('getCurrentSeasonLabel', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns the configured season as a string', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', '2027')
    expect(getCurrentSeasonLabel()).toBe('2027')
  })

  it('falls back to "2026" when the env var is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', '')
    expect(getCurrentSeasonLabel()).toBe('2026')
  })
})
