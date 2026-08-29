import type { BrevetCardType } from '@/lib/brevet-card'

/**
 * Shared localStorage persistence for rider registration details.
 *
 * Registration forms save the rider's info after a successful registration so
 * the next form can pre-fill it. Other components (control card generator,
 * "Your Upcoming Rides") read the same record.
 */
export const REGISTRATION_STORAGE_KEY = 'ro-registration'

export interface SavedRegistrationData {
  firstName: string
  lastName: string
  email: string
  phone: string
  gender: string
  shareRegistration: boolean
  emergencyContactName: string
  emergencyContactPhone: string
  brevetCardType: BrevetCardType
}

export function getSavedRegistrationData(): SavedRegistrationData | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(REGISTRATION_STORAGE_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export function saveRegistrationData(data: SavedRegistrationData): void {
  try {
    localStorage.setItem(REGISTRATION_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ignore storage errors
  }
}
