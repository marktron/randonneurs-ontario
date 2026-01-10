import { describe, it, expect } from 'vitest'
import { createSlug, formatEventType, parseLocalDate, formatFinishTime } from '@/lib/utils'

describe('createSlug', () => {
  it('converts string to lowercase', () => {
    expect(createSlug('Hello World')).toBe('hello-world')
  })

  it('replaces spaces with hyphens', () => {
    expect(createSlug('hello world test')).toBe('hello-world-test')
  })

  it('replaces non-alphanumeric characters with hyphens', () => {
    expect(createSlug('Test@Route#2024!')).toBe('test-route-2024')
  })

  it('collapses multiple hyphens into one', () => {
    expect(createSlug('hello   world')).toBe('hello-world')
    expect(createSlug('test---route')).toBe('test-route')
  })

  it('removes leading and trailing hyphens', () => {
    expect(createSlug('--test--')).toBe('test')
    expect(createSlug('!!!hello!!!')).toBe('hello')
  })

  it('truncates to 100 characters', () => {
    const longString = 'a'.repeat(150)
    const result = createSlug(longString)
    expect(result).toHaveLength(100)
    expect(result).toBe('a'.repeat(100))
  })

  it('handles empty string', () => {
    expect(createSlug('')).toBe('')
  })

  it('handles string with only special characters', () => {
    expect(createSlug('!@#$%')).toBe('')
  })

  it('preserves numbers', () => {
    expect(createSlug('Route 200 km')).toBe('route-200-km')
  })

  it('handles real-world event names', () => {
    expect(createSlug('Spring 200 - Waterloo')).toBe('spring-200-waterloo')
    expect(createSlug("New Year's 25km 2026-01-01")).toBe('new-year-s-25km-2026-01-01')
  })
})

describe('formatEventType', () => {
  it('formats brevet to Brevet', () => {
    expect(formatEventType('brevet')).toBe('Brevet')
  })

  it('formats populaire to Populaire', () => {
    expect(formatEventType('populaire')).toBe('Populaire')
  })

  it('formats fleche to Fleche', () => {
    expect(formatEventType('fleche')).toBe('Fleche')
  })

  it('formats permanent to Permanent', () => {
    expect(formatEventType('permanent')).toBe('Permanent')
  })

  it('returns Brevet for unknown types', () => {
    expect(formatEventType('unknown')).toBe('Brevet')
    expect(formatEventType('')).toBe('Brevet')
    expect(formatEventType('randonnee')).toBe('Brevet')
  })

  it('is case-sensitive (only lowercase matches)', () => {
    expect(formatEventType('BREVET')).toBe('Brevet') // fallback
    expect(formatEventType('Brevet')).toBe('Brevet') // fallback
  })
})

describe('parseLocalDate', () => {
  it('parses date string as local midnight', () => {
    const date = parseLocalDate('2025-06-15')
    expect(date.getFullYear()).toBe(2025)
    expect(date.getMonth()).toBe(5) // June is 5 (0-indexed)
    expect(date.getDate()).toBe(15)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
    expect(date.getSeconds()).toBe(0)
  })

  it('handles January dates', () => {
    const date = parseLocalDate('2026-01-01')
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(0) // January is 0
    expect(date.getDate()).toBe(1)
  })

  it('handles December dates', () => {
    const date = parseLocalDate('2025-12-31')
    expect(date.getFullYear()).toBe(2025)
    expect(date.getMonth()).toBe(11) // December is 11
    expect(date.getDate()).toBe(31)
  })

  it('handles leap year dates', () => {
    const date = parseLocalDate('2024-02-29')
    expect(date.getFullYear()).toBe(2024)
    expect(date.getMonth()).toBe(1) // February is 1
    expect(date.getDate()).toBe(29)
  })
})

describe('formatFinishTime', () => {
  it('returns empty string for null input', () => {
    expect(formatFinishTime(null)).toBe('')
  })

  it('formats simple time HH:MM:SS to HH:MM', () => {
    expect(formatFinishTime('10:30:00')).toBe('10:30')
    expect(formatFinishTime('08:15:00')).toBe('8:15')
    expect(formatFinishTime('23:59:00')).toBe('23:59')
  })

  it('formats time without seconds', () => {
    expect(formatFinishTime('10:30')).toBe('10:30')
  })

  it('formats time over 24 hours', () => {
    expect(formatFinishTime('105:30:00')).toBe('105:30')
    expect(formatFinishTime('48:00:00')).toBe('48:00')
  })

  it('handles PostgreSQL interval with days', () => {
    expect(formatFinishTime('4 days 09:30:00')).toBe('105:30')
    expect(formatFinishTime('2 days 00:00:00')).toBe('48:00')
  })

  it('handles single day interval', () => {
    expect(formatFinishTime('1 day 02:15:00')).toBe('26:15')
    expect(formatFinishTime('1 day 00:00:00')).toBe('24:00')
  })

  it('handles zero days explicitly', () => {
    expect(formatFinishTime('0 days 12:30:00')).toBe('12:30')
  })

  it('returns original string if pattern does not match', () => {
    expect(formatFinishTime('invalid')).toBe('invalid')
    expect(formatFinishTime('abc')).toBe('abc')
  })

  it('handles midnight times', () => {
    expect(formatFinishTime('00:00:00')).toBe('0:00')
  })

  it('handles real-world brevet finish times', () => {
    // 200km in 9h30m
    expect(formatFinishTime('09:30:00')).toBe('9:30')
    // 400km in 22h15m
    expect(formatFinishTime('22:15:00')).toBe('22:15')
    // 600km in 35h45m (1 day 11:45)
    expect(formatFinishTime('1 day 11:45:00')).toBe('35:45')
    // 1200km in 85h00m (3 days 13:00)
    expect(formatFinishTime('3 days 13:00:00')).toBe('85:00')
  })
})
