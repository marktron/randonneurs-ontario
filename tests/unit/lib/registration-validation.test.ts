import { describe, it, expect, beforeEach } from 'vitest'
import {
  validateContactFields,
  isRegistrationRateLimited,
  validateTeamNameLength,
  validateStartLocationLength,
  type ContactValidationInput,
} from '@/lib/actions/registration/validation'
import { resetRateLimitStores } from '@/lib/rate-limit'

const valid: ContactValidationInput = {
  firstName: 'Test',
  lastName: 'Rider',
  email: 'test.rider@example.com',
  phone: '416-555-0000',
  emergencyContactName: 'Emergency Contact',
  emergencyContactPhone: '416-555-1234',
}

function expectError(input: ContactValidationInput, error: string) {
  const result = validateContactFields(input)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toBe(error)
  return result
}

describe('validateContactFields', () => {
  it.each([
    ['firstName', { firstName: '   ' }],
    ['lastName', { lastName: '' }],
    ['email', { email: '  ' }],
  ])('requires %s', (_field, override) => {
    expectError({ ...valid, ...override }, 'Missing required fields')
  })

  it('requires the rider phone', () => {
    expectError({ ...valid, phone: '  ' }, 'Phone number is required')
  })

  it('requires emergency contact name and phone', () => {
    expectError(
      { ...valid, emergencyContactName: ' ' },
      'Emergency contact name and phone are required'
    )
    expectError(
      { ...valid, emergencyContactPhone: '' },
      'Emergency contact name and phone are required'
    )
  })

  it('caps first name, last name and email length', () => {
    expectError({ ...valid, firstName: 'a'.repeat(101) }, 'Name or email is too long')
    expectError({ ...valid, lastName: 'a'.repeat(101) }, 'Name or email is too long')
    expectError({ ...valid, email: 'a'.repeat(250) + '@x.co' }, 'Name or email is too long')
  })

  it('caps notes and emergency contact name length', () => {
    expectError({ ...valid, notes: 'n'.repeat(2001) }, 'Notes must be under 2000 characters')
    expectError(
      { ...valid, emergencyContactName: 'e'.repeat(201) },
      'Emergency contact name is too long'
    )
  })

  it('accepts notes and emergency contact name exactly at the cap', () => {
    const result = validateContactFields({
      ...valid,
      notes: 'n'.repeat(2000),
      emergencyContactName: 'e'.repeat(200),
    })
    expect(result.ok).toBe(true)
  })

  it('rejects a malformed email', () => {
    expectError({ ...valid, email: 'not-an-email' }, 'Please enter a valid email address')
  })

  it('refuses a likely email typo with a suggestion until confirmed', () => {
    const result = expectError(
      { ...valid, email: 'rider@roger.com' },
      'Did you mean rider@rogers.com?'
    )
    if (!result.ok) expect(result.emailSuggestion).toBe('rider@rogers.com')
  })

  it('skips the typo guard when emailConfirmed is set', () => {
    const result = validateContactFields({
      ...valid,
      email: 'rider@roger.com',
      emailConfirmed: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.normalizedEmail).toBe('rider@roger.com')
  })

  it('rejects an invalid rider phone', () => {
    expectError({ ...valid, phone: '123' }, 'Please enter a valid phone number')
  })

  it('rejects an invalid emergency contact phone', () => {
    expectError(
      { ...valid, emergencyContactPhone: '123' },
      'Please enter a valid emergency contact phone number'
    )
  })

  it('checks in order: missing fields before phone, phone before length, length before email format', () => {
    expectError({ ...valid, firstName: '', phone: '' }, 'Missing required fields')
    expectError({ ...valid, phone: '', emergencyContactName: '' }, 'Phone number is required')
    expectError({ ...valid, firstName: 'a'.repeat(101), email: 'bad' }, 'Name or email is too long')
    expectError({ ...valid, email: 'bad', phone: '123' }, 'Please enter a valid email address')
    expectError(
      { ...valid, email: 'rider@roger.com', phone: '123' },
      'Did you mean rider@rogers.com?'
    )
    expectError(
      { ...valid, phone: '123', emergencyContactPhone: '123' },
      'Please enter a valid phone number'
    )
  })

  it('returns trimmed names and normalized email and phones on success', () => {
    const result = validateContactFields({
      ...valid,
      firstName: '  Test ',
      lastName: ' Rider  ',
      email: '  Test.Rider@Example.COM ',
      phone: '(416) 555-0000',
      emergencyContactPhone: '416.555.1234',
    })
    expect(result).toEqual({
      ok: true,
      value: {
        trimmedFirstName: 'Test',
        trimmedLastName: 'Rider',
        normalizedEmail: 'test.rider@example.com',
        normalizedPhone: expect.any(String),
        normalizedEmergencyPhone: expect.any(String),
      },
    })
    if (result.ok) {
      expect(result.value.normalizedPhone).toMatch(/416.*555.*0000/)
      expect(result.value.normalizedEmergencyPhone).toMatch(/416.*555.*1234/)
    }
  })
})

describe('isRegistrationRateLimited', () => {
  beforeEach(() => {
    resetRateLimitStores()
  })

  it('allows 10 attempts and blocks the 11th', () => {
    for (let i = 0; i < 10; i++) {
      expect(isRegistrationRateLimited('limit@example.com')).toBe(false)
    }
    expect(isRegistrationRateLimited('limit@example.com')).toBe(true)
  })

  it('tracks each email separately', () => {
    for (let i = 0; i < 11; i++) isRegistrationRateLimited('a@example.com')
    expect(isRegistrationRateLimited('a@example.com')).toBe(true)
    expect(isRegistrationRateLimited('b@example.com')).toBe(false)
  })

  it('starts fresh after the stores are reset', () => {
    for (let i = 0; i < 11; i++) isRegistrationRateLimited('c@example.com')
    resetRateLimitStores()
    expect(isRegistrationRateLimited('c@example.com')).toBe(false)
  })
})

describe('validateTeamNameLength', () => {
  it('allows empty and up to 100 characters', () => {
    expect(validateTeamNameLength(undefined)).toBeNull()
    expect(validateTeamNameLength('t'.repeat(100))).toBeNull()
  })
  it('rejects 101 characters', () => {
    expect(validateTeamNameLength('t'.repeat(101))).toBe('Team name is too long')
  })
})

describe('validateStartLocationLength', () => {
  it('allows empty and up to 200 characters', () => {
    expect(validateStartLocationLength(undefined)).toBeNull()
    expect(validateStartLocationLength('s'.repeat(200))).toBeNull()
  })
  it('rejects 201 characters', () => {
    expect(validateStartLocationLength('s'.repeat(201))).toBe('Start location is too long')
  })
})
