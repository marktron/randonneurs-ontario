import { describe, expect, it } from 'vitest'
import {
  isValidCoordinatePair,
  isValidLatitude,
  isValidLongitude,
} from '@/lib/location-diagnostics'

describe('isValidLatitude', () => {
  it('accepts the inclusive bounds', () => {
    expect(isValidLatitude(-90)).toBe(true)
    expect(isValidLatitude(90)).toBe(true)
    expect(isValidLatitude(43.65)).toBe(true)
  })

  it('rejects values outside the bounds', () => {
    expect(isValidLatitude(-90.0001)).toBe(false)
    expect(isValidLatitude(90.0001)).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(isValidLatitude(NaN)).toBe(false)
    expect(isValidLatitude(Infinity)).toBe(false)
    expect(isValidLatitude(-Infinity)).toBe(false)
  })

  it('rejects non-number types', () => {
    expect(isValidLatitude('43.65')).toBe(false)
    expect(isValidLatitude(null)).toBe(false)
    expect(isValidLatitude(undefined)).toBe(false)
  })
})

describe('isValidLongitude', () => {
  it('accepts the inclusive bounds', () => {
    expect(isValidLongitude(-180)).toBe(true)
    expect(isValidLongitude(180)).toBe(true)
    expect(isValidLongitude(-79.38)).toBe(true)
  })

  it('rejects values outside the bounds', () => {
    expect(isValidLongitude(-180.0001)).toBe(false)
    expect(isValidLongitude(180.0001)).toBe(false)
  })

  it('rejects non-finite numbers', () => {
    expect(isValidLongitude(NaN)).toBe(false)
    expect(isValidLongitude(Infinity)).toBe(false)
    expect(isValidLongitude(-Infinity)).toBe(false)
  })

  it('rejects non-number types', () => {
    expect(isValidLongitude('-79.38')).toBe(false)
    expect(isValidLongitude(null)).toBe(false)
    expect(isValidLongitude(undefined)).toBe(false)
  })
})

describe('isValidCoordinatePair', () => {
  it('accepts a valid pair at the inclusive bounds', () => {
    expect(isValidCoordinatePair(-90, -180)).toBe(true)
    expect(isValidCoordinatePair(90, 180)).toBe(true)
    expect(isValidCoordinatePair(43.65, -79.38)).toBe(true)
  })

  it('rejects the pair if either coordinate is invalid', () => {
    expect(isValidCoordinatePair(NaN, -79.38)).toBe(false)
    expect(isValidCoordinatePair(43.65, Infinity)).toBe(false)
    expect(isValidCoordinatePair('43.65', -79.38)).toBe(false)
    expect(isValidCoordinatePair(91, -79.38)).toBe(false)
    expect(isValidCoordinatePair(43.65, 181)).toBe(false)
  })
})
