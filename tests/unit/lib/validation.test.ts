import { describe, it, expect } from 'vitest'
import { validateEmail, normalizePhone } from '@/lib/utils/validation'

describe('validateEmail', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('user@example.com')).toEqual({
      valid: true,
      normalized: 'user@example.com',
    })
    expect(validateEmail('USER@EXAMPLE.COM')).toEqual({
      valid: true,
      normalized: 'user@example.com',
    })
    expect(validateEmail('  user@example.com  ')).toEqual({
      valid: true,
      normalized: 'user@example.com',
    })
    expect(validateEmail('first.last@domain.co.uk')).toEqual({
      valid: true,
      normalized: 'first.last@domain.co.uk',
    })
  })

  it('rejects invalid email addresses', () => {
    expect(validateEmail('notanemail').valid).toBe(false)
    expect(validateEmail('@missing.local').valid).toBe(false)
    expect(validateEmail('missing@tld').valid).toBe(false)
    expect(validateEmail('').valid).toBe(false)
    expect(validateEmail('spaces in@email.com').valid).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('formats 10-digit North American numbers', () => {
    expect(normalizePhone('4165551234')).toEqual({ valid: true, formatted: '416-555-1234' })
    expect(normalizePhone('416-555-1234')).toEqual({ valid: true, formatted: '416-555-1234' })
    expect(normalizePhone('(416) 555-1234')).toEqual({ valid: true, formatted: '416-555-1234' })
    expect(normalizePhone('416.555.1234')).toEqual({ valid: true, formatted: '416-555-1234' })
    expect(normalizePhone('416 555 1234')).toEqual({ valid: true, formatted: '416-555-1234' })
  })

  it('handles 11-digit with leading 1', () => {
    expect(normalizePhone('14165551234')).toEqual({ valid: true, formatted: '416-555-1234' })
    expect(normalizePhone('1-416-555-1234')).toEqual({ valid: true, formatted: '416-555-1234' })
  })

  it('passes through international numbers with +', () => {
    expect(normalizePhone('+442071234567')).toEqual({ valid: true, formatted: '+442071234567' })
    expect(normalizePhone('+44 207 123 4567')).toEqual({ valid: true, formatted: '+442071234567' })
  })

  it('accepts 7-digit local numbers', () => {
    const result = normalizePhone('555-9999')
    expect(result.valid).toBe(true)
    expect(result.formatted).toBe('5559999')
  })

  it('rejects too-short numbers', () => {
    expect(normalizePhone('12345').valid).toBe(false)
    expect(normalizePhone('abc').valid).toBe(false)
  })

  it('rejects empty input', () => {
    expect(normalizePhone('').valid).toBe(false)
    expect(normalizePhone('  ').valid).toBe(false)
  })
})
