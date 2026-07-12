import { describe, it, expect } from 'vitest'
import {
  CHECKIN_WINDOW_AFTER_LIMIT_MS,
  CHECKIN_WINDOW_BEFORE_START_MS,
  LATE_SYNC_THRESHOLD_MS,
  RIDER_UNDO_WINDOW_MS,
  STAMP_MAX_ROTATION_DEG,
  computeControlWindow,
  computeElapsedHm,
  computeEventStart,
  deriveCheckinFlags,
  detectWrongControl,
  formatDistanceKm,
  getCheckinAcceptanceWindow,
  hasAnyFlag,
  isDigitalCardEventType,
  isWithinCheckinAcceptanceWindow,
  resolveRiderStart,
  stampRotation,
  stampOffset,
  type CheckinFlags,
  type WrongControlCandidate,
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

  it('never flags lateSync for admin-entered check-ins, even with a huge received-vs-checked-in gap', () => {
    // Admin corrections insert with received_at defaulting to now() while
    // checked_in_at is the historical corrected time — that gap is not an
    // offline-outbox sync delay and must not produce a lateSync badge.
    const receivedAt = new Date(
      new Date(insideWindow).getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString()
    const flags = deriveCheckinFlags(
      { ...cleanCheckin, method: 'admin', received_at: receivedAt },
      control,
      window
    )
    expect(flags.lateSync).toBe(false)
  })

  it('still flags lateSync for gps and manual check-ins beyond the threshold', () => {
    const receivedAt = new Date(
      new Date(insideWindow).getTime() + LATE_SYNC_THRESHOLD_MS + 1000
    ).toISOString()
    const gpsFlags = deriveCheckinFlags(
      { ...cleanCheckin, method: 'gps', received_at: receivedAt },
      control,
      window
    )
    const manualFlags = deriveCheckinFlags(
      { ...cleanCheckin, method: 'manual', distance_to_control_m: null, received_at: receivedAt },
      control,
      window
    )
    expect(gpsFlags.lateSync).toBe(true)
    expect(manualFlags.lateSync).toBe(true)
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

describe('detectWrongControl', () => {
  // Reference points around Toronto. ~0.001° lat ≈ 111 m.
  const A = { lat: 43.65, lng: -79.38, radiusM: 500 } // tapped
  const B_LAT = 43.7 // ~5.6 km north of A
  const C_LAT = 43.701 // ~111 m north of B

  const insideA = { lat: 43.6501, lng: -79.38 } // ~11 m from A
  const atB = { lat: B_LAT, lng: -79.38 }
  const farAway = { lat: 43.9, lng: -79.9 }

  function candidate(over: Partial<WrongControlCandidate> & { id: string }): WrongControlCandidate {
    return {
      name: over.id,
      lat: B_LAT,
      lng: -79.38,
      radiusM: 500,
      alreadyCheckedIn: false,
      ...over,
    }
  }

  it('returns null when the fix is inside the tapped radius, even if another control shares the spot', () => {
    // Out-and-back: a second control sits at the same coords as the tapped one.
    const shared = candidate({ id: 'finish', lat: A.lat, lng: A.lng })
    expect(detectWrongControl(insideA, A, [shared])).toBeNull()
  })

  it('redirects when the fix is outside the tapped control but inside another', () => {
    const b = candidate({ id: 'B' })
    const decision = detectWrongControl(atB, A, [b])
    expect(decision).not.toBeNull()
    expect(decision!.kind).toBe('redirect')
    expect(decision!.control.id).toBe('B')
  })

  it('picks the nearest control when two others contain the fix (order-independent)', () => {
    const b = candidate({ id: 'B', lat: B_LAT })
    const c = candidate({ id: 'C', lat: C_LAT })
    // C listed first to prove the choice is by distance, not array order.
    const decision = detectWrongControl(atB, A, [c, b])
    expect(decision!.control.id).toBe('B')
  })

  it('skips candidate controls without coordinates', () => {
    const noCoords = candidate({ id: 'no-coords', lat: null, lng: null })
    expect(detectWrongControl(atB, A, [noCoords])).toBeNull()
  })

  it('reports already-checked-in when the matched candidate is done', () => {
    const b = candidate({ id: 'B', alreadyCheckedIn: true })
    const decision = detectWrongControl(atB, A, [b])
    expect(decision!.kind).toBe('already-checked-in')
    expect(decision!.control.id).toBe('B')
  })

  it('returns null when the fix is outside every radius', () => {
    const b = candidate({ id: 'B' })
    expect(detectWrongControl(farAway, A, [b])).toBeNull()
  })

  it('still scans others when the tapped control has no coordinates', () => {
    const noCoordTapped = { lat: null, lng: null, radiusM: 500 }
    const b = candidate({ id: 'B' })
    const decision = detectWrongControl(atB, noCoordTapped, [b])
    expect(decision!.kind).toBe('redirect')
    expect(decision!.control.id).toBe('B')
  })
})

describe('formatDistanceKm', () => {
  it('formats metres as one-decimal kilometres', () => {
    expect(formatDistanceKm(0)).toBe('0.0')
    expect(formatDistanceKm(320)).toBe('0.3')
    expect(formatDistanceKm(5560)).toBe('5.6')
  })
})

describe('RIDER_UNDO_WINDOW_MS', () => {
  it('is fifteen minutes', () => {
    expect(RIDER_UNDO_WINDOW_MS).toBe(15 * 60 * 1000)
  })
})

// H:MM formatting itself (zero-padded minutes, unpadded hours, multi-day
// hour counts) is covered by formatElapsedForSubmission's own tests
// (tests/unit/lib/events/finish-time.test.ts) — computeElapsedHm delegates
// to it, so only the Date-diff behaviour unique to this function is
// asserted here.
describe('computeElapsedHm', () => {
  it('rounds seconds down to the completed minute at the 60-minute rollover boundary', () => {
    const start = new Date('2026-07-04T06:00:00Z')
    // 60 minutes 59 seconds elapsed — must floor to 60 minutes, not roll to 1:01.
    expect(computeElapsedHm(start, new Date('2026-07-04T07:00:59Z'))).toBe('1:00')
  })

  it('handles multi-day elapsed times as total hours', () => {
    const start = new Date('2026-07-04T06:00:00Z')
    expect(computeElapsedHm(start, new Date('2026-07-08T15:30:00Z'))).toBe('105:30')
  })

  it('clamps a finish before the start (clock skew) to 0:00', () => {
    const start = new Date('2026-07-04T06:00:00Z')
    expect(computeElapsedHm(start, new Date('2026-07-04T05:59:00Z'))).toBe('0:00')
  })
})

describe('resolveRiderStart', () => {
  const event = { event_date: '2026-08-01', start_time: '08:00' }

  it('uses the event start when no pre-ride is set', () => {
    const start = resolveRiderStart(event, { pre_ride_date: null, pre_ride_start_time: null })
    expect(start.getTime()).toBe(computeEventStart('2026-08-01', '08:00').getTime())
  })

  it('prefers the pre-ride start when set', () => {
    const start = resolveRiderStart(event, {
      pre_ride_date: '2026-07-28',
      pre_ride_start_time: '06:30',
    })
    expect(start.getTime()).toBe(computeEventStart('2026-07-28', '06:30').getTime())
  })

  it('never mixes the pre-ride date with the event time', () => {
    // The DB CHECK makes date-without-time unrepresentable, but the resolver
    // must not silently borrow event.start_time if it ever sees one.
    const start = resolveRiderStart(event, {
      pre_ride_date: '2026-07-28',
      pre_ride_start_time: null,
    })
    expect(start.getTime()).toBe(computeEventStart('2026-07-28', null).getTime())
  })

  it('handles TIME values with seconds (HH:MM:SS from Postgres)', () => {
    const start = resolveRiderStart(event, {
      pre_ride_date: '2026-07-28',
      pre_ride_start_time: '06:30:00',
    })
    expect(start.getTime()).toBe(computeEventStart('2026-07-28', '06:30').getTime())
  })
})

describe('stampRotation', () => {
  it('is deterministic for the same control id', () => {
    expect(stampRotation('ctrl-1')).toBe(stampRotation('ctrl-1'))
    expect(stampRotation('00000000-1f0c-4000-a000-000000000003')).toBe(
      stampRotation('00000000-1f0c-4000-a000-000000000003')
    )
  })

  it('stays within ±STAMP_MAX_ROTATION_DEG for arbitrary ids', () => {
    const ids = [
      'ctrl-1',
      'ctrl-2',
      'a',
      '',
      '00000000-1f0c-4000-a000-000000000003',
      'e9b1c4d2-7f3a-4b5e-9c8d-2a1b3c4d5e6f',
    ]
    for (const id of ids) {
      const angle = stampRotation(id)
      expect(Math.abs(angle)).toBeLessThanOrEqual(STAMP_MAX_ROTATION_DEG)
    }
  })

  it('spreads different ids across different angles', () => {
    const angles = new Set(
      ['ctrl-1', 'ctrl-2', 'ctrl-3', 'ctrl-4', 'ctrl-5', 'ctrl-6'].map(stampRotation)
    )
    // Not a strict uniqueness guarantee (hash collisions are legal), but a
    // spread this poor would defeat the hand-stamped look.
    expect(angles.size).toBeGreaterThanOrEqual(4)
  })
})

describe('stampOffset', () => {
  it('is deterministic for the same control id', () => {
    expect(stampOffset('ctrl-1')).toEqual(stampOffset('ctrl-1'))
  })

  it('stays within dx ±4 and dy ±3 for arbitrary ids', () => {
    const ids = [
      'ctrl-1',
      'a',
      '',
      '00000000-1f0c-4000-a000-000000000003',
      'e9b1c4d2-7f3a-4b5e-9c8d-2a1b3c4d5e6f',
    ]
    for (const id of ids) {
      const { dx, dy } = stampOffset(id)
      expect(Math.abs(dx)).toBeLessThanOrEqual(4)
      expect(Math.abs(dy)).toBeLessThanOrEqual(3)
    }
  })

  it('is not perfectly correlated with rotation across ids', () => {
    // Different hash slices: ids with distinct rotations should not all
    // share one offset. (Loose check — collisions are legal.)
    const offsets = new Set(
      ['ctrl-1', 'ctrl-2', 'ctrl-3', 'ctrl-4', 'ctrl-5', 'ctrl-6'].map((id) =>
        JSON.stringify(stampOffset(id))
      )
    )
    expect(offsets.size).toBeGreaterThanOrEqual(3)
  })
})
