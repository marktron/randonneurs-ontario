/**
 * Presentation and telemetry helpers shared by the registration server actions.
 *
 * Pure functions plus one Sentry telemetry helper — no database access — so
 * they can live outside the `'use server'` module.
 */
import { createHash } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { format, parseISO } from 'date-fns'

/**
 * Truncated SHA-256 of an email, for forensic correlation in telemetry
 * without leaking PII. 12 hex chars is enough to disambiguate users in
 * practice but too short for offline lookup.
 */
export function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12)
}

/**
 * Emit a Sentry warning when a silent spam guard drops a submission. The
 * response to the client is still { success: true } so bots can't probe the
 * boundary — this is server-only telemetry to correlate real-user reports
 * ("I see the success screen but no row exists") with the guard that fired.
 */
export function logSilentDrop(
  guard: 'honeypot',
  action: 'registerForEvent' | 'registerForPermanent' | 'completeRegistrationWithRider',
  extra: Record<string, unknown>
): void {
  Sentry.captureMessage('Registration silently dropped by spam guard', {
    level: 'warning',
    tags: { guard, action },
    extra,
  })
}

/**
 * Format a date string for display in confirmation emails.
 * @example formatEventDate("2025-06-15") → "Sunday, June 15, 2025"
 */
export function formatEventDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

/**
 * Format a time string (HH:MM) for display in 12-hour format.
 * @example formatEventTime("14:30") → "2:30 PM"
 */
export function formatEventTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD'
  const [hours, minutes] = timeStr.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

/**
 * Build a URL to the route page if route info is available.
 */
export function buildRouteUrl(rwgpsId: string | null | undefined): string | undefined {
  if (!rwgpsId) return undefined
  return `https://ridewithgps.com/routes/${rwgpsId}`
}

export function buildManagementUrl(managementToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
  return `${baseUrl}/registration/manage/${managementToken}`
}

export function buildDigitalCardUrl(managementToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
  return `${baseUrl}/card/${managementToken}`
}
