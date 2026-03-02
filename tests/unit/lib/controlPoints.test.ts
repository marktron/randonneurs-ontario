import { describe, it, expect } from 'vitest'
import { reverseControls, isReversedEvent } from '@/lib/controlPoints'

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
