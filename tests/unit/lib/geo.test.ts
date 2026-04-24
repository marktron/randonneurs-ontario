import { describe, it, expect } from 'vitest'
import { haversineMeters } from '@/lib/geo'

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(43.65, -79.38, 43.65, -79.38)).toBe(0)
  })

  it('computes Toronto to Mississauga distance (~25 km)', () => {
    // Toronto City Hall: 43.6534, -79.3841
    // Mississauga City Hall: 43.5890, -79.6441
    const meters = haversineMeters(43.6534, -79.3841, 43.589, -79.6441)
    expect(meters).toBeGreaterThan(22_000)
    expect(meters).toBeLessThan(25_000)
  })

  it('computes 1 degree of latitude as ~111 km', () => {
    const meters = haversineMeters(0, 0, 1, 0)
    expect(meters).toBeGreaterThan(110_000)
    expect(meters).toBeLessThan(112_000)
  })

  it('is symmetric', () => {
    const a = haversineMeters(43.08, -81.37, 43.15, -81.68)
    const b = haversineMeters(43.15, -81.68, 43.08, -81.37)
    expect(a).toBeCloseTo(b, 6)
  })

  it('handles antipodal-ish distances without NaN', () => {
    const meters = haversineMeters(-45, 170, 45, -10)
    expect(Number.isFinite(meters)).toBe(true)
    expect(meters).toBeGreaterThan(10_000_000)
  })
})
