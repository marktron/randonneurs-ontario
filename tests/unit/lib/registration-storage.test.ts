/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  REGISTRATION_STORAGE_KEY,
  getSavedRegistrationData,
  saveRegistrationData,
  type SavedRegistrationData,
} from '@/lib/registration-storage'

const sample: SavedRegistrationData = {
  firstName: 'Anna',
  lastName: 'Smith',
  email: 'anna@example.com',
  phone: '555-1234',
  gender: 'F',
  shareRegistration: true,
  emergencyContactName: 'Bob Smith',
  emergencyContactPhone: '555-9876',
}

describe('registration-storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses the legacy ro-registration key so existing rider data survives', () => {
    expect(REGISTRATION_STORAGE_KEY).toBe('ro-registration')
  })

  it('round-trips saved registration data', () => {
    saveRegistrationData(sample)
    expect(getSavedRegistrationData()).toEqual(sample)
  })

  it('returns null when nothing is saved', () => {
    expect(getSavedRegistrationData()).toBeNull()
  })

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(REGISTRATION_STORAGE_KEY, '{not-json')
    expect(getSavedRegistrationData()).toBeNull()
  })

  it('swallows storage write errors', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveRegistrationData(sample)).not.toThrow()
  })
})
