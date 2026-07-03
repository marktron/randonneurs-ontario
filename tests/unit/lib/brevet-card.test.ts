import { describe, it, expect } from 'vitest'
import {
  CHECKIN_WINDOW_AFTER_LIMIT_MS,
  CHECKIN_WINDOW_BEFORE_START_MS,
  LATE_SYNC_THRESHOLD_MS,
  computeControlWindow,
  computeEventStart,
  deriveCheckinFlags,
  getCheckinAcceptanceWindow,
  hasAnyFlag,
  isDigitalCardEventType,
  isWithinCheckinAcceptanceWindow,
  type CheckinFlags,
} from '@/lib/brevet-card'
import { computeControlTimes, createTorontoDate, getNominalDistance } from '@/lib/brmTimes'
import { getAcpTimeLimitMinutes } from '@/lib/events/finish-time'

describe('isDigitalCardEventType', () => {
  it('allows brevets, populaires, and permanents', () => {
    expect(isDigitalCardEventType('brevet')).toBe(true)
    expect(isDigitalCardEventType('populaire')).toBe(true)
    expect(isDigitalCardEventType('permanent')).toBe(true)
  })

  it('excludes fleches, unknown types, and null', () => {
    expect(isDigitalCardEventType('fleche')).toBe(false)
    expect(isDigitalCardEventType('gravel')).toBe(false)
    expect(isDigitalCardEventType(null)).toBe(false)
  })
})

describe('computeEventStart', () => {
  it('builds a Toronto-local start from event_date + start_time', () => {
    const start = computeEventStart('2026-07-11', '08:00')
    expect(start.getTime()).toBe(createTorontoDate(2026, 6, 11, 8, 0).getTime())
  })

  it('accepts HH:MM:SS times (Postgres TIME format)', () => {
    const start = computeEventStart('2026-07-11', '08:30:00')
    expect(start.getTime()).toBe(createTorontoDate(2026, 6, 11, 8, 30).getTime())
  })

  it('defaults to midnight when start_time is null', () => {
    const start = computeEventStart('2026-07-11', null)
    expect(start.getTime()).toBe(createTorontoDate(2026, 6, 11, 0, 0).getTime())
  })
})

describe('check-in acceptance window', () => {
  const start = createTorontoDate(2026, 6, 11, 8, 0)

  it('opens 2 hours before the start', () => {
    const { opensAt } = getCheckinAcceptanceWindow(start, 200)
    expect(start.getTime() - opensAt.getTime()).toBe(CHECKIN_WINDOW_BEFORE_START_MS)
  })

  it('closes at the ACP limit plus the grace period', () => {
    const { closesAt } = getCheckinAcceptanceWindow(start, 200)
    const limitMs = getAcpTimeLimitMinutes(200) * 60 * 1000
    expect(closesAt.getTime() - start.getTime()).toBe(limitMs + CHECKIN_WINDOW_AFTER_LIMIT_MS)
  })

  it('accepts a check-in mid-event and rejects one a week early', () => {
    const midEvent = new Date(start.getTime() + 4 * 60 * 60 * 1000)
    const weekEarly = new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(isWithinCheckinAcceptanceWindow(start, 200, midEvent)).toBe(true)
    expect(isWithinCheckinAcceptanceWindow(start, 200, weekEarly)).toBe(false)
  })

  it('rejects a check-in long after the limit expires', () => {
    const limitMs = getAcpTimeLimitMinutes(200) * 60 * 1000
    const wayLate = new Date(start.getTime() + limitMs + CHECKIN_WINDOW_AFTER_LIMIT_MS + 60 * 1000)
    expect(isWithinCheckinAcceptanceWindow(start, 200, wayLate)).toBe(false)
  })
})

describe('computeControlWindow', () => {
  it('matches the printed-card computeControlTimes computation', () => {
    const start = createTorontoDate(2026, 6, 11, 8, 0)
    const window = computeControlWindow(start, 78.4, 207)
    const expected = computeControlTimes(start, 78.4, getNominalDistance(207), 207)
    expect(window.openAt.getTime()).toBe(expected.openAt.getTime())
    expect(window.closeAt.getTime()).toBe(expected.closeAt.getTime())
  })

  it('clamps the finish control to the nominal distance limit', () => {
    const start = createTorontoDate(2026, 6, 11, 8, 0)
    const window = computeControlWindow(start, 207, 207)
    const limitMin = getAcpTimeLimitMinutes(207)
    expect(window.closeAt.getTime() - start.getTime()).toBe(limitMin * 60 * 1000)
  })
})

describe('deriveCheckinFlags', () => {
  const start = createTorontoDate(2026, 6, 11, 8, 0)
  const window = computeControlWindow(start, 100, 200)
  const control = { radius_m: 500 }

  const insideWindow = new Date(
    (window.openAt.getTime() + window.closeAt.getTime()) / 2
  ).toISOString()

  const cleanCheckin = {
    method: 'gps',
    checked_in_at: insideWindow,
    received_at: insideWindow,
    distance_to_control_m: 42,
  }

  it('is flag-free for a clean in-window, in-radius GPS check-in', () => {
    const flags = deriveCheckinFlags(cleanCheckin, control, window)
    expect(hasAnyFlag(flags)).toBe(false)
  })

  it('flags a GPS fix outside the control radius', () => {
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, distance_to_control_m: 501 },
      control,
      window
    )
    expect(flags.outOfRadius).toBe(true)
  })

  it('does not flag radius when distance is unknown', () => {
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, distance_to_control_m: null },
      control,
      window
    )
    expect(flags.outOfRadius).toBe(false)
  })

  it('flags manual check-ins as noGps but never outOfRadius', () => {
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, method: 'manual', distance_to_control_m: null },
      control,
      window
    )
    expect(flags.noGps).toBe(true)
    expect(flags.outOfRadius).toBe(false)
  })

  it('flags check-ins before the control opens', () => {
    const early = new Date(window.openAt.getTime() - 60 * 1000).toISOString()
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, checked_in_at: early, received_at: early },
      control,
      window
    )
    expect(flags.early).toBe(true)
    expect(flags.late).toBe(false)
  })

  it('flags check-ins after the control closes', () => {
    const late = new Date(window.closeAt.getTime() + 60 * 1000).toISOString()
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, checked_in_at: late, received_at: late },
      control,
      window
    )
    expect(flags.late).toBe(true)
    expect(flags.early).toBe(false)
  })

  it('flags check-ins that synced well after the tap', () => {
    const receivedAt = new Date(
      new Date(insideWindow).getTime() + LATE_SYNC_THRESHOLD_MS + 1000
    ).toISOString()
    const flags = deriveCheckinFlags({ ...cleanCheckin, received_at: receivedAt }, control, window)
    expect(flags.lateSync).toBe(true)
  })

  it('does not flag a sync within the threshold', () => {
    const receivedAt = new Date(
      new Date(insideWindow).getTime() + LATE_SYNC_THRESHOLD_MS - 1000
    ).toISOString()
    const flags = deriveCheckinFlags({ ...cleanCheckin, received_at: receivedAt }, control, window)
    expect(flags.lateSync).toBe(false)
  })
})

describe('hasAnyFlag', () => {
  it('detects each individual flag', () => {
    const none: CheckinFlags = {
      outOfRadius: false,
      noGps: false,
      early: false,
      late: false,
      lateSync: false,
    }
    expect(hasAnyFlag(none)).toBe(false)
    for (const key of Object.keys(none) as Array<keyof CheckinFlags>) {
      expect(hasAnyFlag({ ...none, [key]: true })).toBe(true)
    }
  })
})
