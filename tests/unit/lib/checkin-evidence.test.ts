import { describe, it, expect } from 'vitest'
import { buildCheckinEvidence, formatCheckinDistanceCompact } from '@/lib/checkin-evidence'
import type { AdminCheckinGridRider } from '@/lib/actions/control-checkins'
import type { CheckinFlags } from '@/lib/brevet-card'

const NO_FLAGS: CheckinFlags = {
  outOfRadius: false,
  noGps: false,
  early: false,
  late: false,
  lateSync: false,
}

// Controls deliberately out of position order to prove sorting.
const CONTROLS = [
  { id: 'c2', position: 2, name: 'Mid', distanceKm: 90 },
  { id: 'c1', position: 1, name: 'Start', distanceKm: 0 },
  { id: 'c3', position: 3, name: 'Finish', distanceKm: 200 },
]

function makeRider(
  overrides: Partial<AdminCheckinGridRider> & { riderId: string }
): AdminCheckinGridRider {
  return {
    registrationId: `reg-${overrides.riderId}`,
    riderName: 'Test Rider',
    managementToken: null,
    preRideDate: null,
    preRideStartTime: null,
    checkins: [],
    ...overrides,
  }
}

function makeCheckin(controlId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `chk-${controlId}`,
    controlId,
    registrationId: 'reg-r1',
    checkedInAt: '2026-05-15T12:00:00Z',
    receivedAt: '2026-05-15T12:00:05Z',
    method: 'gps',
    lat: 43.6,
    lng: -79.4,
    accuracyM: 12,
    distanceToControlM: 40,
    note: null,
    flags: NO_FLAGS,
    ...overrides,
  }
}

describe('buildCheckinEvidence', () => {
  it('builds position-ordered rows with null for missed controls', () => {
    const rider = makeRider({
      riderId: 'r1',
      checkins: [makeCheckin('c3'), makeCheckin('c1')],
    })

    const evidence = buildCheckinEvidence(CONTROLS, [rider])

    expect(Object.keys(evidence)).toEqual(['r1'])
    const rows = evidence['r1']
    expect(rows.map((r) => r.name)).toEqual(['Start', 'Mid', 'Finish'])
    expect(rows[0].checkin).not.toBeNull()
    expect(rows[1].checkin).toBeNull() // missed control
    expect(rows[2].checkin).not.toBeNull()
    expect(rows[2].distanceKm).toBe(200)
    expect(rows[2].checkin?.method).toBe('gps')
    expect(rows[2].checkin?.flags).toEqual(NO_FLAGS)
  })

  it('omits riders with no check-ins', () => {
    const withCheckins = makeRider({ riderId: 'r1', checkins: [makeCheckin('c1')] })
    const without = makeRider({ riderId: 'r2', checkins: [] })

    const evidence = buildCheckinEvidence(CONTROLS, [withCheckins, without])

    expect(Object.keys(evidence)).toEqual(['r1'])
  })

  it('returns an empty map when there are no controls', () => {
    const rider = makeRider({ riderId: 'r1', checkins: [makeCheckin('c1')] })
    expect(buildCheckinEvidence([], [rider])).toEqual({})
  })
})

describe('formatCheckinDistanceCompact', () => {
  it('formats metres under 1 km', () => {
    expect(formatCheckinDistanceCompact(320, null)).toBe('320 m from control')
  })

  it('formats km at/above 1 km with accuracy', () => {
    expect(formatCheckinDistanceCompact(29040, 35)).toBe('29.0 km from control (±35 m)')
  })

  it('omits accuracy when zero or not finite', () => {
    expect(formatCheckinDistanceCompact(320, 0)).toBe('320 m from control')
    expect(formatCheckinDistanceCompact(320, Number.NaN)).toBe('320 m from control')
  })
})
