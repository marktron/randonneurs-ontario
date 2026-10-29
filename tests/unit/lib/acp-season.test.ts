import { describe, it, expect } from 'vitest'
import { acpSeasonOf, acpSeasonOfParts, acpSeasonWindow } from '@/lib/acp-season'

describe('acpSeasonOf', () => {
  it('labels Jan through Oct with the same calendar year', () => {
    expect(acpSeasonOf('2027-01-01')).toBe(2027)
    expect(acpSeasonOf('2027-06-15')).toBe(2027)
  })

  it('keeps Oct 31 in the season ending that year', () => {
    expect(acpSeasonOf('2027-10-31')).toBe(2027)
  })

  it('moves Nov 1 into the next season', () => {
    expect(acpSeasonOf('2026-11-01')).toBe(2027)
  })

  it('moves Dec 31 into the next season', () => {
    expect(acpSeasonOf('2026-12-31')).toBe(2027)
  })

  it('ignores any time component after the date', () => {
    expect(acpSeasonOf('2026-11-01T00:00:00Z')).toBe(2027)
  })
})

describe('acpSeasonOfParts', () => {
  it('takes a 1-based month and rolls Nov and Dec forward', () => {
    expect(acpSeasonOfParts(2026, 10)).toBe(2026)
    expect(acpSeasonOfParts(2026, 11)).toBe(2027)
    expect(acpSeasonOfParts(2026, 12)).toBe(2027)
  })
})

describe('acpSeasonWindow', () => {
  it('runs from Nov 1 of the prior year to Oct 31 of the season year', () => {
    expect(acpSeasonWindow(2027)).toEqual({ start: '2026-11-01', end: '2027-10-31' })
  })

  it('agrees with acpSeasonOf at both edges', () => {
    const { start, end } = acpSeasonWindow(2027)
    expect(acpSeasonOf(start)).toBe(2027)
    expect(acpSeasonOf(end)).toBe(2027)
  })
})
