import { describe, it, expect } from 'vitest'
import {
  reverseControls,
  isReversedEvent,
  matchImportedControls,
  controlsInSync,
  backCardLayout,
  MAX_CARD_CONTROLS,
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
  it('exports a cap of 21', () => {
    expect(MAX_CARD_CONTROLS).toBe(21)
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

  it('clamps above the cap rather than throwing (callers reject >21)', () => {
    expect(backCardLayout(22)).toEqual({ rowsPerColumn: 7, tier: 'dense' })
    expect(backCardLayout(40)).toEqual({ rowsPerColumn: 7, tier: 'dense' })
  })
})
