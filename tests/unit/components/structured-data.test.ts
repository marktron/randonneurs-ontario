import { describe, it, expect } from 'vitest'
import { getTorontoUtcOffset } from '@/components/structured-data'

describe('getTorontoUtcOffset', () => {
  it('returns the EST offset (-05:00) for a January date', () => {
    expect(getTorontoUtcOffset('2026-01-15')).toBe('-05:00')
  })

  it('returns the EDT offset (-04:00) for a July date', () => {
    expect(getTorontoUtcOffset('2026-07-15')).toBe('-04:00')
  })

  it('returns the EST offset just before the spring-forward transition', () => {
    // DST began 2026-03-08 in Toronto; early March is still standard time.
    expect(getTorontoUtcOffset('2026-03-01')).toBe('-05:00')
  })

  it('returns the EDT offset just after the spring-forward transition', () => {
    expect(getTorontoUtcOffset('2026-03-09')).toBe('-04:00')
  })

  it('returns the EST offset just after the fall-back transition', () => {
    // DST ended 2026-11-01 in Toronto.
    expect(getTorontoUtcOffset('2026-11-02')).toBe('-05:00')
  })
})
