import { describe, it, expect } from 'vitest'
import {
  calculateElapsedMinutes,
  formatElapsedForDisplay,
  formatElapsedForSubmission,
  getAcpTimeLimitMinutes,
  getFinishDayOptions,
} from '@/lib/events/finish-time'

describe('getAcpTimeLimitMinutes', () => {
  it('returns the ACP limit for each nominal distance', () => {
    expect(getAcpTimeLimitMinutes(200)).toBe(13 * 60 + 30)
    expect(getAcpTimeLimitMinutes(300)).toBe(20 * 60)
    expect(getAcpTimeLimitMinutes(400)).toBe(27 * 60)
    expect(getAcpTimeLimitMinutes(600)).toBe(40 * 60)
    expect(getAcpTimeLimitMinutes(1000)).toBe(75 * 60)
    expect(getAcpTimeLimitMinutes(1200)).toBe(90 * 60)
    expect(getAcpTimeLimitMinutes(1300)).toBe(108 * 60 + 20)
  })

  it('rounds populaires up to the 200 km limit', () => {
    expect(getAcpTimeLimitMinutes(120)).toBe(13 * 60 + 30)
  })

  it('uses the LRM 12 km/h global average for events beyond 1300 km', () => {
    // LRM rule: randonnées of 1400 km and up are limited to distance/12 hours,
    // not a further extension of the ACP banded table.
    expect(getAcpTimeLimitMinutes(1400)).toBe(7000)
    expect(getAcpTimeLimitMinutes(1900)).toBe(9500)
    expect(getAcpTimeLimitMinutes(2000)).toBe(10000)
  })
})

describe('getFinishDayOptions', () => {
  it('returns an empty list when the event has no start time', () => {
    expect(getFinishDayOptions('2026-05-15', null, 200)).toEqual([])
  })

  it('returns same-day plus a buffer day for an early-morning 200 km that finishes within the day', () => {
    // 06:00 + 13:30 = 19:30 same day, plus one buffer day past the cutoff so
    // an over-limit finisher can still record their real day.
    const opts = getFinishDayOptions('2026-05-16', '06:00', 200)
    expect(opts.map((o) => o.offset)).toEqual([0, 1])
    expect(opts[0].date).toBe('2026-05-16')
    expect(opts[1].date).toBe('2026-05-17')
  })

  it('returns same-day, next-day, and a buffer day for a 200 km that crosses midnight at the cutoff', () => {
    // 14:00 + 13:30 = 03:30 next day, plus one buffer day past the cutoff
    const opts = getFinishDayOptions('2026-05-16', '14:00', 200)
    expect(opts).toHaveLength(3)
    expect(opts[0].date).toBe('2026-05-16')
    expect(opts[1].date).toBe('2026-05-17')
    expect(opts[2].date).toBe('2026-05-18')
  })

  it('returns four days for a 600 km starting late evening, including the buffer day', () => {
    // 22:00 + 40:00 = 14:00 day+2, plus one buffer day past the cutoff
    const opts = getFinishDayOptions('2026-05-16', '22:00', 600)
    expect(opts.map((o) => o.offset)).toEqual([0, 1, 2, 3])
  })

  it('returns five days for a 1000 km, including the buffer day', () => {
    // 06:00 + 75:00 = 09:00 day+3, plus one buffer day past the cutoff
    const opts = getFinishDayOptions('2026-05-16', '06:00', 1000)
    expect(opts.map((o) => o.offset)).toEqual([0, 1, 2, 3, 4])
  })

  it('crosses month boundaries correctly, including the buffer day', () => {
    const opts = getFinishDayOptions('2026-05-31', '22:00', 600)
    expect(opts.map((o) => o.date)).toEqual([
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ])
  })

  it('produces a short, human label for each day', () => {
    const opts = getFinishDayOptions('2026-05-16', '14:00', 200)
    // toLocaleDateString output is locale-dependent, but should include the
    // weekday abbreviation and a short month and day-of-month.
    expect(opts[0].label).toMatch(/Sat/)
    expect(opts[0].label).toMatch(/May/)
    expect(opts[0].label).toMatch(/16/)
    expect(opts[1].label).toMatch(/Sun/)
    expect(opts[1].label).toMatch(/17/)
  })

  it('offers 9 days for a 2000 km, spanning the LRM cutoff plus the buffer day', () => {
    const opts = getFinishDayOptions('2026-08-04', '05:00', 2000)
    expect(opts).toHaveLength(9)
    expect(opts[0].date).toBe('2026-08-04')
    expect(opts[8].date).toBe('2026-08-12')
  })

  it('lets an over-limit finisher pick a day past the strict cutoff', () => {
    // 05:00 start + 166h40m LRM limit lands the cutoff moment at 03:40 on
    // 2026-08-11 — the last day option must extend one day beyond that so a
    // rider who finishes late can still record their real finish day.
    const opts = getFinishDayOptions('2026-08-04', '05:00', 2000)
    const cutoffDay = '2026-08-11'
    const lastOption = opts[opts.length - 1]
    expect(lastOption.date).toBe('2026-08-12')
    expect(lastOption.date > cutoffDay).toBe(true)
  })
})

describe('calculateElapsedMinutes', () => {
  it('computes same-day elapsed', () => {
    expect(calculateElapsedMinutes('06:00', '19:30', 0)).toBe(13 * 60 + 30)
  })

  it('computes elapsed with day offset', () => {
    // 22:00 day 0 → 03:30 day 1 = 5h30m
    expect(calculateElapsedMinutes('22:00', '03:30', 1)).toBe(5 * 60 + 30)
  })

  it('returns null when finish equals start (zero elapsed)', () => {
    expect(calculateElapsedMinutes('08:00', '08:00', 0)).toBeNull()
  })

  it('returns null when finish is before start on the same day', () => {
    expect(calculateElapsedMinutes('14:00', '02:00', 0)).toBeNull()
  })

  it('returns null for malformed inputs', () => {
    expect(calculateElapsedMinutes('', '12:00', 0)).toBeNull()
    expect(calculateElapsedMinutes('08:00', '', 0)).toBeNull()
    expect(calculateElapsedMinutes('08:00', '12:00', -1)).toBeNull()
  })

  it('handles a multi-day brevet', () => {
    // 04:00 day 0 → 20:00 day+1 = 40h0m (a 600 km at the strict limit)
    expect(calculateElapsedMinutes('04:00', '20:00', 1)).toBe(40 * 60)
  })
})

describe('formatElapsedForSubmission', () => {
  it('formats minutes as H:MM', () => {
    expect(formatElapsedForSubmission(13 * 60 + 30)).toBe('13:30')
    expect(formatElapsedForSubmission(60)).toBe('1:00')
    expect(formatElapsedForSubmission(7)).toBe('0:07')
  })

  it('handles three-digit hours for a 1300 km', () => {
    expect(formatElapsedForSubmission(108 * 60 + 20)).toBe('108:20')
  })

  it('matches the action regex', () => {
    expect(formatElapsedForSubmission(105 * 60 + 45)).toMatch(/^\d{1,3}:\d{2}$/)
  })
})

describe('formatElapsedForDisplay', () => {
  it('formats elapsed minutes for inline display', () => {
    expect(formatElapsedForDisplay(13 * 60 + 30)).toBe('13h 30m')
    expect(formatElapsedForDisplay(60)).toBe('1h 00m')
  })

  it('returns empty string for invalid input', () => {
    expect(formatElapsedForDisplay(NaN)).toBe('')
    expect(formatElapsedForDisplay(-1)).toBe('')
  })
})
