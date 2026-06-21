/**
 * Shared input validation for the registration server actions.
 *
 * Each entry point first validates its own identifier(s) (eventId, or
 * routeId/eventDate/startTime), then defers the common contact/email/phone
 * checks here. Error messages and check order match the original inline
 * validation exactly so client-facing behavior is unchanged.
 */
import { validateEmail, normalizePhone } from '@/lib/utils/validation'

export interface ContactValidationInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
}

export interface ValidatedContact {
  trimmedFirstName: string
  trimmedLastName: string
  normalizedEmail: string
  /** The rider's own cell phone number, normalized. */
  normalizedPhone: string
  /** The emergency contact's phone number, normalized. */
  normalizedEmergencyPhone: string
}

export type ContactValidationResult =
  | { ok: true; value: ValidatedContact }
  | { ok: false; error: string }

/**
 * Validate the contact fields common to every registration entry point:
 * required name/email, required emergency contact, length limits, and
 * email/phone normalization. Returns normalized values on success.
 *
 * Callers must validate their own identifier fields first (the original
 * "Missing required fields" check combined those with the name/email check,
 * which still surfaces the same message here when a name or email is blank).
 */
export function validateContactFields(input: ContactValidationInput): ContactValidationResult {
  const { firstName, lastName, email, phone, notes, emergencyContactName, emergencyContactPhone } =
    input

  if (!firstName.trim() || !lastName.trim() || !email.trim()) {
    return { ok: false, error: 'Missing required fields' }
  }

  if (!phone?.trim()) {
    return { ok: false, error: 'Phone number is required' }
  }

  if (!emergencyContactName?.trim() || !emergencyContactPhone?.trim()) {
    return { ok: false, error: 'Emergency contact name and phone are required' }
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 254) {
    return { ok: false, error: 'Name or email is too long' }
  }
  if (notes && notes.length > 2000) {
    return { ok: false, error: 'Notes must be under 2000 characters' }
  }
  if (emergencyContactName && emergencyContactName.length > 200) {
    return { ok: false, error: 'Emergency contact name is too long' }
  }

  const emailResult = validateEmail(email)
  if (!emailResult.valid) {
    return { ok: false, error: 'Please enter a valid email address' }
  }

  const phoneResult = normalizePhone(phone)
  if (!phoneResult.valid) {
    return { ok: false, error: 'Please enter a valid phone number' }
  }

  const emergencyPhoneResult = normalizePhone(emergencyContactPhone)
  if (!emergencyPhoneResult.valid) {
    return { ok: false, error: 'Please enter a valid emergency contact phone number' }
  }

  return {
    ok: true,
    value: {
      trimmedFirstName: firstName.trim(),
      trimmedLastName: lastName.trim(),
      normalizedEmail: emailResult.normalized,
      normalizedPhone: phoneResult.formatted,
      normalizedEmergencyPhone: emergencyPhoneResult.formatted,
    },
  }
}
