import { describe, it, expect } from 'vitest'
import { formatRideName } from '@/lib/events/format'

describe('formatRideName', () => {
  it('appends distance with km suffix when name has no trailing distance', () => {
    expect(formatRideName('Gentle Start', 120)).toBe('Gentle Start 120km')
  })

  it('does not duplicate distance when name already ends with bare number', () => {
    expect(formatRideName('Gentle Start 120', 120)).toBe('Gentle Start 120')
  })

  it('does not duplicate distance when name already ends with km suffix', () => {
    expect(formatRideName('Gentle Start 120km', 120)).toBe('Gentle Start 120km')
  })

  it('is case-insensitive when detecting trailing KM suffix', () => {
    expect(formatRideName('Gentle Start 120KM', 120)).toBe('Gentle Start 120KM')
    expect(formatRideName('Gentle Start 120Km', 120)).toBe('Gentle Start 120Km')
  })

  it('appends when trailing number does not match event distance', () => {
    expect(formatRideName('Gentle Start 100', 120)).toBe('Gentle Start 100 120km')
  })

  it('only checks the end of the name, not numbers in the middle', () => {
    expect(formatRideName('Super 400 Preparation', 400)).toBe('Super 400 Preparation 400km')
  })

  it('trims surrounding whitespace from the input name', () => {
    expect(formatRideName('  Gentle Start  ', 120)).toBe('Gentle Start 120km')
    expect(formatRideName('  Gentle Start 120  ', 120)).toBe('Gentle Start 120')
  })

  it('does not match when the number is not preceded by a space', () => {
    expect(formatRideName('Gentle-Start120', 120)).toBe('Gentle-Start120 120km')
  })
})
