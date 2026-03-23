import { describe, it, expect } from 'vitest'
import {
  closeHours,
  computeControlTimes,
  getNominalDistance,
  formatHM,
  formatControlTime,
  formatCardDate,
  createTorontoDate,
} from '@/lib/brmTimes'

describe('closeHours', () => {
  it('returns 1 hour for the start control (0 km)', () => {
    expect(closeHours(0)).toBe(1)
  })

  it('returns 1 hour for negative distances', () => {
    expect(closeHours(-10)).toBe(1)
  })

  // 0–600 km band at 15 km/h
  it('calculates closing time for 60 km (60/15 = 4h)', () => {
    expect(closeHours(60)).toBeCloseTo(4, 2)
  })

  it('calculates closing time for 200 km (200/15 ≈ 13.33h)', () => {
    expect(closeHours(200)).toBeCloseTo(200 / 15, 2)
  })

  it('calculates closing time for 300 km (300/15 = 20h)', () => {
    expect(closeHours(300)).toBeCloseTo(20, 2)
  })

  it('calculates closing time for 400 km (400/15 ≈ 26.67h)', () => {
    expect(closeHours(400)).toBeCloseTo(400 / 15, 2)
  })

  it('calculates closing time for 600 km (600/15 = 40h)', () => {
    expect(closeHours(600)).toBeCloseTo(40, 2)
  })

  // 600–1000 km band at 11.428 km/h
  it('calculates closing time for 700 km (40 + 100/11.428)', () => {
    expect(closeHours(700)).toBeCloseTo(40 + 100 / 11.428, 2)
  })

  it('calculates closing time for 1000 km (40 + 400/11.428)', () => {
    expect(closeHours(1000)).toBeCloseTo(40 + 400 / 11.428, 2)
  })

  // 1000–1300 km band at 13.333 km/h
  it('calculates closing time for 1200 km (40 + 400/11.428 + 200/13.333)', () => {
    expect(closeHours(1200)).toBeCloseTo(40 + 400 / 11.428 + 200 / 13.333, 2)
  })

  it('calculates closing time for 1300 km (all three bands)', () => {
    expect(closeHours(1300)).toBeCloseTo(40 + 400 / 11.428 + 300 / 13.333, 2)
  })
})

describe('openHours (tested via computeControlTimes)', () => {
  // We test openHours indirectly via computeControlTimes since it's not exported.
  // openMin = round(openHours(d) * 60)
  const start = new Date('2025-06-01T12:00:00Z')

  it('opens immediately at the start control (0 km)', () => {
    const { openMin } = computeControlTimes(start, 0, 200)
    expect(openMin).toBe(0)
  })

  // 0–200 km at 34 km/h
  it('calculates open time for 100 km (100/34 ≈ 2.94h ≈ 176 min)', () => {
    const { openMin } = computeControlTimes(start, 100, 200)
    expect(openMin).toBe(Math.round((100 / 34) * 60))
  })

  it('calculates open time for 200 km (200/34 ≈ 5.88h ≈ 353 min)', () => {
    const { openMin } = computeControlTimes(start, 200, 300)
    expect(openMin).toBe(Math.round((200 / 34) * 60))
  })

  // 200–400 km at 32 km/h
  it('calculates open time for 300 km (200/34 + 100/32)', () => {
    const expected = Math.round((200 / 34 + 100 / 32) * 60)
    const { openMin } = computeControlTimes(start, 300, 400)
    expect(openMin).toBe(expected)
  })

  it('calculates open time for 400 km (200/34 + 200/32)', () => {
    const expected = Math.round((200 / 34 + 200 / 32) * 60)
    const { openMin } = computeControlTimes(start, 400, 600)
    expect(openMin).toBe(expected)
  })

  // 400–600 km at 30 km/h
  it('calculates open time for 600 km (200/34 + 200/32 + 200/30)', () => {
    const expected = Math.round((200 / 34 + 200 / 32 + 200 / 30) * 60)
    const { openMin } = computeControlTimes(start, 600, 1000)
    expect(openMin).toBe(expected)
  })

  // 600–1000 km at 28 km/h
  it('calculates open time for 1000 km (200/34 + 200/32 + 200/30 + 400/28)', () => {
    const expected = Math.round((200 / 34 + 200 / 32 + 200 / 30 + 400 / 28) * 60)
    const { openMin } = computeControlTimes(start, 1000, 1200)
    expect(openMin).toBe(expected)
  })

  // 1000–1300 km at 26 km/h
  it('calculates open time for 1200 km (all five segments)', () => {
    const expected = Math.round((200 / 34 + 200 / 32 + 200 / 30 + 400 / 28 + 200 / 26) * 60)
    const { openMin } = computeControlTimes(start, 1200, 1300)
    expect(openMin).toBe(expected)
  })
})

describe('computeControlTimes', () => {
  const start = new Date('2025-06-01T12:00:00Z')

  it('returns Date objects for openAt and closeAt', () => {
    const { openAt, closeAt } = computeControlTimes(start, 100, 200)
    expect(openAt).toBeInstanceOf(Date)
    expect(closeAt).toBeInstanceOf(Date)
  })

  it('does not mutate the start date', () => {
    const original = start.getTime()
    computeControlTimes(start, 100, 200)
    expect(start.getTime()).toBe(original)
  })

  it('truncates control distance to whole km by default', () => {
    const truncated = computeControlTimes(start, 100.9, 200)
    const exact = computeControlTimes(start, 100, 200)
    expect(truncated.openMin).toBe(exact.openMin)
    expect(truncated.closeMin).toBe(exact.closeMin)
  })

  it('uses exact distance when truncateKm is false', () => {
    const exact = computeControlTimes(start, 100.9, 200, undefined, {
      truncateKm: false,
    })
    const truncated = computeControlTimes(start, 100, 200)
    // 100.9/34 > 100/34, so open time should differ
    expect(exact.openMin).not.toBe(truncated.openMin)
  })

  describe('finish control clamping', () => {
    it('clamps a 200 km finish to 13h 30m (810 min)', () => {
      const { closeMin } = computeControlTimes(start, 205, 200, 205)
      expect(closeMin).toBe(810)
    })

    it('clamps a 300 km finish to 20h (1200 min)', () => {
      const { closeMin } = computeControlTimes(start, 307, 300, 307)
      expect(closeMin).toBe(1200)
    })

    it('clamps a 400 km finish to 27h (1620 min)', () => {
      const { closeMin } = computeControlTimes(start, 410, 400, 410)
      expect(closeMin).toBe(1620)
    })

    it('clamps a 600 km finish to 40h (2400 min)', () => {
      const { closeMin } = computeControlTimes(start, 615, 600, 615)
      expect(closeMin).toBe(2400)
    })

    it('clamps a 1000 km finish to 75h (4500 min)', () => {
      const { closeMin } = computeControlTimes(start, 1010, 1000, 1010)
      expect(closeMin).toBe(4500)
    })

    it('clamps a 1200 km finish to 90h (5400 min)', () => {
      const { closeMin } = computeControlTimes(start, 1220, 1200, 1220)
      expect(closeMin).toBe(5400)
    })

    it('clamps a 1300 km finish to 108h 20m (6500 min)', () => {
      const { closeMin } = computeControlTimes(start, 1310, 1300, 1310)
      expect(closeMin).toBe(6500)
    })

    it('detects finish when control is at route distance', () => {
      const { closeMin } = computeControlTimes(start, 204, 200, 204)
      expect(closeMin).toBe(810)
    })

    it('does not clamp an intermediate control', () => {
      const { closeMin } = computeControlTimes(start, 150, 200, 204)
      // 150 km < 204 km route, so it should use the normal calculation
      expect(closeMin).toBe(Math.round(closeHours(150) * 60))
    })
  })

  describe('uses nominal distance when routeKm is not provided', () => {
    it('finish detected when controlKm >= nominalKm', () => {
      const { closeMin } = computeControlTimes(start, 200, 200)
      expect(closeMin).toBe(810) // 13h 30m
    })

    it('intermediate when controlKm < nominalKm', () => {
      const { closeMin } = computeControlTimes(start, 150, 200)
      expect(closeMin).toBe(Math.round(closeHours(150) * 60))
    })
  })

  it('computes correct openAt by adding openMin to start', () => {
    const { openAt, openMin } = computeControlTimes(start, 200, 300)
    const expected = new Date(start.getTime() + openMin * 60 * 1000)
    expect(openAt.getTime()).toBe(expected.getTime())
  })

  it('computes correct closeAt by adding closeMin to start', () => {
    const { closeAt, closeMin } = computeControlTimes(start, 200, 300)
    const expected = new Date(start.getTime() + closeMin * 60 * 1000)
    expect(closeAt.getTime()).toBe(expected.getTime())
  })
})

describe('getNominalDistance', () => {
  it('returns 200 for distances <= 200', () => {
    expect(getNominalDistance(100)).toBe(200)
    expect(getNominalDistance(200)).toBe(200)
  })

  it('returns 300 for distances 201–300', () => {
    expect(getNominalDistance(201)).toBe(300)
    expect(getNominalDistance(300)).toBe(300)
  })

  it('returns 400 for distances 301–400', () => {
    expect(getNominalDistance(301)).toBe(400)
    expect(getNominalDistance(400)).toBe(400)
  })

  it('returns 600 for distances 401–600', () => {
    expect(getNominalDistance(401)).toBe(600)
    expect(getNominalDistance(600)).toBe(600)
  })

  it('returns 1000 for distances 601–1000', () => {
    expect(getNominalDistance(601)).toBe(1000)
    expect(getNominalDistance(1000)).toBe(1000)
  })

  it('returns 1200 for distances 1001–1200', () => {
    expect(getNominalDistance(1001)).toBe(1200)
    expect(getNominalDistance(1200)).toBe(1200)
  })

  it('returns 1300 for distances > 1200', () => {
    expect(getNominalDistance(1201)).toBe(1300)
    expect(getNominalDistance(1300)).toBe(1300)
    expect(getNominalDistance(2000)).toBe(1300)
  })
})

describe('formatHM', () => {
  it('formats zero minutes as 00:00', () => {
    expect(formatHM(0)).toBe('00:00')
  })

  it('formats minutes less than an hour', () => {
    expect(formatHM(30)).toBe('00:30')
  })

  it('formats exact hours', () => {
    expect(formatHM(60)).toBe('01:00')
    expect(formatHM(120)).toBe('02:00')
  })

  it('formats hours and minutes', () => {
    expect(formatHM(810)).toBe('13:30') // 200 km time limit
    expect(formatHM(1200)).toBe('20:00') // 300 km time limit
    expect(formatHM(2400)).toBe('40:00') // 600 km time limit
  })

  it('formats large values (>24h)', () => {
    expect(formatHM(4500)).toBe('75:00') // 1000 km time limit
    expect(formatHM(5400)).toBe('90:00') // 1200 km time limit
    expect(formatHM(6500)).toBe('108:20') // 1300 km time limit
  })

  it('pads single-digit minutes', () => {
    expect(formatHM(61)).toBe('01:01')
  })
})

describe('createTorontoDate', () => {
  it('creates a date that formats to the intended Toronto local time', () => {
    // June 15 at 09:00 Toronto (EDT, UTC-4)
    const date = createTorontoDate(2025, 5, 15, 9, 0)

    const formatted = date.toLocaleTimeString('en-US', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(formatted).toBe('09:00')
  })

  it('handles EST (winter) correctly', () => {
    // January 15 at 09:00 Toronto (EST, UTC-5)
    const date = createTorontoDate(2025, 0, 15, 9, 0)

    const formatted = date.toLocaleTimeString('en-US', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(formatted).toBe('09:00')
  })

  it('handles EDT (summer) correctly', () => {
    // July 15 at 14:30 Toronto (EDT, UTC-4)
    const date = createTorontoDate(2025, 6, 15, 14, 30)

    const formatted = date.toLocaleTimeString('en-US', {
      timeZone: 'America/Toronto',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    expect(formatted).toBe('14:30')
  })

  it('preserves the correct date in Toronto timezone', () => {
    const date = createTorontoDate(2025, 5, 15, 9, 0)

    const formatted = date.toLocaleDateString('en-US', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    expect(formatted).toBe('06/15/2025')
  })
})

describe('formatControlTime', () => {
  it('formats a date as "Day HH:MM" in Toronto timezone', () => {
    // June 15, 2025 at 09:00 Toronto time
    const date = createTorontoDate(2025, 5, 15, 9, 0)
    const result = formatControlTime(date)

    expect(result).toMatch(/^Sun 09:00$/)
  })

  it('uses 24-hour time', () => {
    const date = createTorontoDate(2025, 5, 15, 14, 30)
    const result = formatControlTime(date)

    expect(result).toMatch(/^Sun 14:30$/)
  })
})

describe('formatCardDate', () => {
  it('formats a date as "Mon DD YYYY" in Toronto timezone', () => {
    const date = createTorontoDate(2025, 5, 15, 9, 0)
    const result = formatCardDate(date)

    expect(result).toBe('Jun 15 2025')
  })

  it('pads single-digit days', () => {
    const date = createTorontoDate(2025, 0, 5, 9, 0)
    const result = formatCardDate(date)

    expect(result).toBe('Jan 05 2025')
  })
})
