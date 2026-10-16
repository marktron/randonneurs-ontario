import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getCurrentSeason,
  getCurrentSeasonLabel,
  seasonOfEventDate,
  torontoCalendarYear,
} from '@/lib/season'

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

describe('seasonOfEventDate', () => {
  it('reads the calendar year', () => {
    expect(seasonOfEventDate('2027-01-15')).toBe(2027)
  })
})

describe('torontoCalendarYear', () => {
  it('is still the old year at 23:00 Toronto on Dec 31', () => {
    expect(torontoCalendarYear(new Date('2027-01-01T04:00:00Z'))).toBe(2026)
  })

  it('rolls at midnight Toronto', () => {
    expect(torontoCalendarYear(new Date('2027-01-01T05:00:00Z'))).toBe(2027)
  })
})
