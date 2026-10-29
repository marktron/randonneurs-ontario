/**
 * Shared input validation for the registration server actions.
 *
 * Each entry point first validates its own identifier(s) (eventId, or
 * routeId/eventDate/startTime), then defers the common contact/email/phone
 * checks here. Error messages and check order match the original inline
 * validation exactly so client-facing behavior is unchanged.
 *
 * Also owns the per-email registration rate limit, which every entry point
 * applies right after the contact fields validate, and the length caps for the
 * entry-point-specific free-text fields (team name, start location).
 */
import { validateEmail, normalizePhone } from '@/lib/utils/validation'
import { isRateLimited } from '@/lib/rate-limit'
import { suggestEmailCorrection } from '@/lib/utils/email-typo'

const REGISTRATION_RATE_LIMIT_STORE = 'registration'
const REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS = 10
const REGISTRATION_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

const MAX_TEAM_NAME_LENGTH = 100
const MAX_START_LOCATION_LENGTH = 200

export const REGISTRATION_RATE_LIMIT_ERROR =
  'Too many registration attempts. Please try again later.'

export interface ContactValidationInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
  /**
   * Set once the rider has explicitly acknowledged a suspected email typo —
   * either by accepting the suggestion or by confirming the address they typed.
   * Suppresses the typo guard below so the second submit goes through.
   */
  emailConfirmed?: boolean
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
  | {
      ok: false
      error: string
      /**
       * Set only by the email-typo guard: the address we think the rider meant.
       * Callers surface this so the form can ask for a yes/no confirmation
       * rather than showing a dead-end error.
       */
      emailSuggestion?: string
    }

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

  // A syntactically valid address can still be misaddressed (rogers.com typed
  // as roger.com), and the rider never sees the confirmation email that would
  // tell them. Refuse once and make them confirm. Deliberately placed before
  // the rate limiter so the follow-up submit costs only one attempt.
  if (!input.emailConfirmed) {
    const suggestion = suggestEmailCorrection(emailResult.normalized)
    if (suggestion) {
      return {
        ok: false,
        error: `Did you mean ${suggestion}?`,
        emailSuggestion: suggestion,
      }
    }
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

/**
 * Per-email rate limit shared by every registration entry point: 10 attempts
 * per 15 minutes. Returns true when the attempt should be refused. Each call
 * counts as an attempt, so call it exactly once per submission, immediately
 * after validateContactFields succeeds (the typo guard must run first).
 */
export function isRegistrationRateLimited(normalizedEmail: string): boolean {
  return isRateLimited(
    REGISTRATION_RATE_LIMIT_STORE,
    normalizedEmail,
    REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS,
    REGISTRATION_RATE_LIMIT_WINDOW_MS
  )
}

/** Returns an error message when the team name is over the length cap, else null. */
export function validateTeamNameLength(trimmedTeamName: string | undefined): string | null {
  return trimmedTeamName && trimmedTeamName.length > MAX_TEAM_NAME_LENGTH
    ? 'Team name is too long'
    : null
}

/** Returns an error message when the start location is over the length cap, else null. */
export function validateStartLocationLength(
  trimmedStartLocation: string | undefined
): string | null {
  return trimmedStartLocation && trimmedStartLocation.length > MAX_START_LOCATION_LENGTH
    ? 'Start location is too long'
    : null
}

/**
 * Returns an error message when the start time is not a 24-hour HH:MM time,
 * else null. Joining an existing permanent ride compares times in this shape.
 */
export function validateStartTime(startTime: string): string | null {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) ? null : 'Please enter a start time as HH:MM'
}
