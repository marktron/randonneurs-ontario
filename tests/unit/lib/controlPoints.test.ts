import { describe, it, expect } from 'vitest'
import {
  reverseControls,
  isReversedEvent,
  matchImportedControls,
  controlsInSync,
  backCardLayout,
  MAX_CARD_CONTROLS,
  groupControlsByLeg,
  expandRiderLegCards,
  buildCardLegsFromRows,
  titleStatesDistance,
} from '@/lib/controlPoints'

describe('reverseControls', () => {
  it('reverses a 5-control route with recalculated distances', () => {
    const controls = [
      { id: '1', name: 'Start', distance: '0.0' },
      { id: '2', name: 'Georgetown', distance: '45.2' },
      { id: '3', name: 'Little Lake', distance: '97.7' },
      { id: '4', name: 'Campbellville', distance: '142.3' },
      { id: '5', name: 'Finish', distance: '204.5' },
    ]

    const result = reverseControls(controls, 204.5)

    expect(result).toEqual([
      { id: '5', name: 'Finish', distance: '0.0' },
      { id: '4', name: 'Campbellville', distance: '62.2' },
      { id: '3', name: 'Little Lake', distance: '106.8' },
      { id: '2', name: 'Georgetown', distance: '159.3' },
      { id: '1', name: 'Start', distance: '204.5' },
    ])
  })

  it('reverses a 2-control route (Start/Finish only)', () => {
    const controls = [
      { id: '1', name: 'Start', distance: '0.0' },
      { id: '2', name: 'Finish', distance: '200.0' },
    ]

    const result = reverseControls(controls, 200)

    expect(result).toEqual([
      { id: '2', name: 'Finish', distance: '0.0' },
      { id: '1', name: 'Start', distance: '200.0' },
    ])
  })

  it('reverses a route with a single intermediate control', () => {
    const controls = [
      { id: '1', name: 'Start', distance: '0.0' },
      { id: '2', name: 'Midpoint', distance: '75.0' },
      { id: '3', name: 'Finish', distance: '150.0' },
    ]

    const result = reverseControls(controls, 150)

    expect(result).toEqual([
      { id: '3', name: 'Finish', distance: '0.0' },
      { id: '2', name: 'Midpoint', distance: '75.0' },
      { id: '1', name: 'Start', distance: '150.0' },
    ])
  })

  it('handles controls with decimal distances', () => {
    const controls = [
      { id: '1', name: 'Start', distance: '0.0' },
      { id: '2', name: 'Control A', distance: '33.3' },
      { id: '3', name: 'Control B', distance: '66.7' },
      { id: '4', name: 'Finish', distance: '100.0' },
    ]

    const result = reverseControls(controls, 100)

    expect(result).toEqual([
      { id: '4', name: 'Finish', distance: '0.0' },
      { id: '3', name: 'Control B', distance: '33.3' },
      { id: '2', name: 'Control A', distance: '66.7' },
      { id: '1', name: 'Start', distance: '100.0' },
    ])
  })

  it('does not mutate the original array', () => {
    const controls = [
      { id: '1', name: 'Start', distance: '0.0' },
      { id: '2', name: 'Finish', distance: '100.0' },
    ]
    const original = [...controls]

    reverseControls(controls, 100)

    expect(controls).toEqual(original)
  })
})

describe('isReversedEvent', () => {
  it('returns true for a reversed event name', () => {
    expect(isReversedEvent('Waterfront Trail (Reversed)')).toBe(true)
  })

  it('returns false for a normal event name', () => {
    expect(isReversedEvent('Waterfront Trail')).toBe(false)
  })

  it('returns true when (Reversed) appears anywhere in the name', () => {
    expect(isReversedEvent('Some Route (Reversed) Extra')).toBe(true)
  })

  it('returns false for similar but different text', () => {
    expect(isReversedEvent('Waterfront Trail Reversed')).toBe(false)
  })
})

describe('matchImportedControls', () => {
  const saved = [
    { id: 's1', name: 'Start', distanceKm: 0 },
    { id: 's2', name: 'Georgetown', distanceKm: 45.2 },
    { id: 's3', name: 'Finish', distanceKm: 200 },
  ]

  it('matches by trimmed, case-insensitive name', () => {
    const imported = [
      { name: '  start ', distanceKm: 0 },
      { name: 'GEORGETOWN', distanceKm: 45.2 },
      { name: 'finish', distanceKm: 200 },
    ]
    const result = matchImportedControls(imported, saved)
    expect(result.map((m) => m?.id)).toEqual(['s1', 's2', 's3'])
  })

  it('falls back to distance match within 0.1 km when the name differs', () => {
    const imported = [{ name: 'Renamed Control', distanceKm: 45.25 }]
    const result = matchImportedControls(imported, saved)
    expect(result[0]?.id).toBe('s2')
  })

  it('does not distance-match beyond the 0.1 km tolerance', () => {
    const imported = [{ name: 'Renamed Control', distanceKm: 45.5 }]
    const result = matchImportedControls(imported, saved)
    expect(result[0]).toBeNull()
  })

  it('returns null for genuinely new imported controls', () => {
    const imported = [{ name: 'Brand New', distanceKm: 120 }]
    const result = matchImportedControls(imported, saved)
    expect(result[0]).toBeNull()
  })

  it('matches each saved control at most once (one-to-one)', () => {
    const imported = [
      { name: 'Start', distanceKm: 0 },
      { name: 'Start', distanceKm: 0.05 },
    ]
    const result = matchImportedControls(imported, saved)
    // First takes s1 by name; second cannot re-use s1 and finds nothing else.
    expect(result[0]?.id).toBe('s1')
    expect(result[1]).toBeNull()
  })

  it('prefers name matches over distance matches across the whole set', () => {
    const twoSaved = [
      { id: 'a', name: 'Alpha', distanceKm: 10 },
      { id: 'b', name: 'Beta', distanceKm: 10 },
    ]
    // "Beta" should claim its name match even though it appears second and
    // shares a distance with "Alpha".
    const imported = [
      { name: 'Renamed', distanceKm: 10 },
      { name: 'Beta', distanceKm: 10 },
    ]
    const result = matchImportedControls(imported, twoSaved)
    expect(result[1]?.id).toBe('b')
    expect(result[0]?.id).toBe('a')
  })

  it('attaches a saved row to the closest same-name imported control, not the first', () => {
    // Multi-pass route: the import now lists Wheatley at both passes, but the
    // saved row (with its check-ins) belongs to the second pass.
    const savedWheatley = [{ id: 'w', name: 'Wheatley', distanceKm: 1145.3 }]
    const imported = [
      { name: 'Wheatley', distanceKm: 919.5 },
      { name: 'Wheatley', distanceKm: 1145.4 },
    ]
    const result = matchImportedControls(imported, savedWheatley)
    expect(result[0]).toBeNull()
    expect(result[1]?.id).toBe('w')
  })

  it('pairs repeated names one-to-one by nearest distance regardless of order', () => {
    const savedChatham = [
      { id: 'c1', name: 'Chatham', distanceKm: 0 },
      { id: 'c2', name: 'Chatham', distanceKm: 355.8 },
    ]
    const imported = [
      { name: 'Chatham', distanceKm: 355.8 },
      { name: 'Chatham', distanceKm: 0 },
    ]
    const result = matchImportedControls(imported, savedChatham)
    expect(result[0]?.id).toBe('c2')
    expect(result[1]?.id).toBe('c1')
  })
})

describe('controlsInSync', () => {
  const saved = [
    { name: 'Start', distanceKm: 0 },
    { name: 'Midway', distanceKm: 100 },
    { name: 'Finish', distanceKm: 200 },
  ]

  it('returns true for an identical ordered sequence', () => {
    expect(controlsInSync([...saved], saved)).toBe(true)
  })

  it('trims names before comparing', () => {
    const rows = [
      { name: ' Start ', distanceKm: 0 },
      { name: 'Midway', distanceKm: 100 },
      { name: 'Finish ', distanceKm: 200 },
    ]
    expect(controlsInSync(rows, saved)).toBe(true)
  })

  it('is case-sensitive on names', () => {
    const rows = [
      { name: 'start', distanceKm: 0 },
      { name: 'Midway', distanceKm: 100 },
      { name: 'Finish', distanceKm: 200 },
    ]
    expect(controlsInSync(rows, saved)).toBe(false)
  })

  it('returns false when order differs', () => {
    const rows = [
      { name: 'Midway', distanceKm: 100 },
      { name: 'Start', distanceKm: 0 },
      { name: 'Finish', distanceKm: 200 },
    ]
    expect(controlsInSync(rows, saved)).toBe(false)
  })

  it('returns false when a distance differs', () => {
    const rows = [
      { name: 'Start', distanceKm: 0 },
      { name: 'Midway', distanceKm: 101 },
      { name: 'Finish', distanceKm: 200 },
    ]
    expect(controlsInSync(rows, saved)).toBe(false)
  })

  it('returns false when the counts differ', () => {
    expect(controlsInSync(saved.slice(0, 2), saved)).toBe(false)
  })

  it('treats numerically-equal distances as equal', () => {
    const rows = [
      { name: 'Start', distanceKm: 0.0 },
      { name: 'Midway', distanceKm: 100.0 },
      { name: 'Finish', distanceKm: 200.0 },
    ]
    expect(controlsInSync(rows, saved)).toBe(true)
  })
})

describe('backCardLayout', () => {
  it('exports a cap of 24', () => {
    expect(MAX_CARD_CONTROLS).toBe(24)
  })

  it('uses the normal 4-row tier up to 12 controls', () => {
    expect(backCardLayout(2)).toEqual({ rowsPerColumn: 4, tier: 'normal' })
    expect(backCardLayout(12)).toEqual({ rowsPerColumn: 4, tier: 'normal' })
  })

  it('never drops below 4 rows per column for tiny cards', () => {
    // ceil(2/3) = 1, but the grid keeps its 4-row shape.
    expect(backCardLayout(0).rowsPerColumn).toBe(4)
    expect(backCardLayout(3).rowsPerColumn).toBe(4)
  })

  it('switches to compact at 13 controls', () => {
    expect(backCardLayout(13)).toEqual({ rowsPerColumn: 5, tier: 'compact' })
    expect(backCardLayout(15)).toEqual({ rowsPerColumn: 5, tier: 'compact' })
    expect(backCardLayout(16)).toEqual({ rowsPerColumn: 6, tier: 'compact' })
    expect(backCardLayout(18)).toEqual({ rowsPerColumn: 6, tier: 'compact' })
  })

  it('switches to dense at 19 controls', () => {
    expect(backCardLayout(19)).toEqual({ rowsPerColumn: 7, tier: 'dense' })
    expect(backCardLayout(21)).toEqual({ rowsPerColumn: 7, tier: 'dense' })
  })

  it('switches to ultra at 22 controls', () => {
    expect(backCardLayout(22)).toEqual({ rowsPerColumn: 8, tier: 'ultra' })
    expect(backCardLayout(24)).toEqual({ rowsPerColumn: 8, tier: 'ultra' })
  })

  it('clamps above the cap rather than throwing (callers reject >24)', () => {
    expect(backCardLayout(25)).toEqual({ rowsPerColumn: 8, tier: 'ultra' })
    expect(backCardLayout(40)).toEqual({ rowsPerColumn: 8, tier: 'ultra' })
  })
})

describe('groupControlsByLeg', () => {
  it('groups fully-tagged controls in first-appearance order', () => {
    const controls = [
      { name: 'A1', legRwgpsId: '101', legName: 'Leg 1: A' },
      { name: 'A2', legRwgpsId: '101', legName: 'Leg 1: A' },
      { name: 'B1', legRwgpsId: '102', legName: 'Leg 2: B' },
    ]
    expect(groupControlsByLeg(controls)).toEqual([
      { legRwgpsId: '101', legName: 'Leg 1: A', controls: [controls[0], controls[1]] },
      { legRwgpsId: '102', legName: 'Leg 2: B', controls: [controls[2]] },
    ])
  })

  it('returns null for untagged controls (single-route card)', () => {
    expect(groupControlsByLeg([{ name: 'Start' }, { name: 'Finish' }])).toBeNull()
    expect(groupControlsByLeg([{ name: 'Start', legRwgpsId: null, legName: null }])).toBeNull()
  })

  it('returns null for a mixed list (any untagged row falls back to single-route)', () => {
    expect(
      groupControlsByLeg([
        { name: 'A1', legRwgpsId: '101', legName: 'Leg 1: A' },
        { name: 'Stray' },
      ])
    ).toBeNull()
  })

  it('returns null for an empty list', () => {
    expect(groupControlsByLeg([])).toBeNull()
  })
})

describe('buildCardLegsFromRows', () => {
  const rows = [
    { name: 'L1 Start', distanceKm: 0, legRwgpsId: '101', legName: 'Leg 1: A' },
    { name: 'L1 Mid', distanceKm: 100.4, legRwgpsId: '101', legName: 'Leg 1: A' },
    { name: 'L1 Finish', distanceKm: 205.3, legRwgpsId: '101', legName: 'Leg 1: A' },
    { name: 'L2 Start', distanceKm: 0, legRwgpsId: '102', legName: 'Leg 2: B' },
    { name: 'L2 Finish', distanceKm: 302.1, legRwgpsId: '102', legName: 'Leg 2: B' },
  ]

  it('groups position-ordered rows into CardLegs in first-appearance order', () => {
    const legs = buildCardLegsFromRows(rows)!
    expect(legs.map((l) => l.legRwgpsId)).toEqual(['101', '102'])
    expect(legs.map((l) => l.legName)).toEqual(['Leg 1: A', 'Leg 2: B'])
    expect(legs[0].controls.map((c) => c.name)).toEqual(['L1 Start', 'L1 Mid', 'L1 Finish'])
    expect(legs[1].controls.map((c) => c.name)).toEqual(['L2 Start', 'L2 Finish'])
  })

  it('sets per-leg distance to the max control distance and maps distances through', () => {
    const legs = buildCardLegsFromRows(rows)!
    expect(legs[0].distanceKm).toBe(205.3)
    expect(legs[1].distanceKm).toBe(302.1)
    expect(legs[0].controls.map((c) => c.distance)).toEqual([0, 100.4, 205.3])
  })

  it('builds the RWGPS url from the leg id and stable per-leg control ids', () => {
    const legs = buildCardLegsFromRows(rows)!
    expect(legs[0].rwgpsUrl).toBe('https://ridewithgps.com/routes/101')
    expect(legs[1].rwgpsUrl).toBe('https://ridewithgps.com/routes/102')
    expect(legs[0].controls.map((c) => c.id)).toEqual([
      'leg-0-control-0',
      'leg-0-control-1',
      'leg-0-control-2',
    ])
    expect(legs[1].controls.map((c) => c.id)).toEqual(['leg-1-control-0', 'leg-1-control-1'])
  })

  it('never sets open/close times on leg controls (the event limit governs)', () => {
    const legs = buildCardLegsFromRows(rows)!
    for (const control of legs.flatMap((l) => l.controls)) {
      expect(control.openTime).toBeUndefined()
      expect(control.closeTime).toBeUndefined()
    }
  })

  it('returns null for untagged, mixed, or empty rows (single-route card)', () => {
    expect(
      buildCardLegsFromRows([{ name: 'Start', distanceKm: 0, legRwgpsId: null, legName: null }])
    ).toBeNull()
    expect(
      buildCardLegsFromRows([
        rows[0],
        { name: 'Untagged', distanceKm: 50, legRwgpsId: null, legName: null },
      ])
    ).toBeNull()
    expect(buildCardLegsFromRows([])).toBeNull()
  })
})

describe('expandRiderLegCards', () => {
  it('expands rider-major: all of rider 1 legs before rider 2', () => {
    expect(expandRiderLegCards(['r1', 'r2'], ['l1', 'l2'])).toEqual([
      { rider: 'r1', leg: 'l1' },
      { rider: 'r1', leg: 'l2' },
      { rider: 'r2', leg: 'l1' },
      { rider: 'r2', leg: 'l2' },
    ])
  })

  it('returns empty for no riders', () => {
    expect(expandRiderLegCards([], ['l1'])).toEqual([])
  })
})

describe('titleStatesDistance', () => {
  it('detects a title that already ends with the exact distance', () => {
    expect(titleStatesDistance('Ottawa 200', 200)).toBe(true)
    expect(titleStatesDistance('Carleton Place 1000', 1000)).toBe(true)
  })

  it('accepts a trailing km unit', () => {
    expect(titleStatesDistance('Ottawa 200 km', 200)).toBe(true)
    expect(titleStatesDistance('Ottawa 200km', 200)).toBe(true)
  })

  /**
   * The load-bearing case. Randonneuring names are nominal ("Ottawa 200")
   * while the measured route is longer (203.4 km). Those are different
   * numbers, so the real distance must still be printed.
   */
  it('does not suppress when the nominal name and real distance differ', () => {
    expect(titleStatesDistance('Ottawa 200', 203.4)).toBe(false)
    expect(titleStatesDistance('PBP 1200', 1219)).toBe(false)
  })

  it('matches a fractional distance stated in the title', () => {
    expect(titleStatesDistance('Ottawa 203.4', 203.4)).toBe(true)
  })

  it('is false for titles with no trailing number', () => {
    expect(titleStatesDistance('Hard, Short and Long.', 1000)).toBe(false)
    expect(titleStatesDistance('Leg 1: Gravenhurst', 205.3)).toBe(false)
    expect(titleStatesDistance('', 200)).toBe(false)
  })

  it('does not match a number embedded mid-title', () => {
    expect(titleStatesDistance('200 Loop of Ottawa', 200)).toBe(false)
  })
})
