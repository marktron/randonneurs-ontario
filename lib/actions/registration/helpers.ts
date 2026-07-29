/**
 * Presentation and telemetry helpers shared by the registration server actions.
 *
 * Pure functions plus one Sentry telemetry helper — no database access — so
 * they can live outside the `'use server'` module.
 */
import { createHash } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { format, parseISO } from 'date-fns'

import { isDigitalCardEventType } from '@/lib/brevet-card'
import { buildRwgpsCollectionUrl } from '@/lib/rwgps'
import { SITE_URL } from '@/lib/site-url'

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
 * Build the RWGPS link for a registration email: the route page when the
 * route has an rwgps_id, else the collection page for collection-backed
 * routes (multi-leg events), else undefined (row omitted from the email).
 */
export function buildRouteUrl(
  rwgpsId: string | null | undefined,
  rwgpsCollectionId?: string | null
): string | undefined {
  if (rwgpsId) return `https://ridewithgps.com/routes/${rwgpsId}`
  if (rwgpsCollectionId) return buildRwgpsCollectionUrl(rwgpsCollectionId)
  return undefined
}

export function buildManagementUrl(managementToken: string): string {
  const baseUrl = SITE_URL
  return `${baseUrl}/registration/manage/${managementToken}`
}

export function buildDigitalCardUrl(managementToken: string): string {
  const baseUrl = SITE_URL
  return `${baseUrl}/card/${managementToken}`
}

// TEMPORARY KILL SWITCH: the digital brevet card is deployed but not yet
// ready for riders. Flip to true to restore the card link in registration
// confirmation emails (and update registration-helpers.test.ts to match).
const DIGITAL_CARD_EMAIL_LINK_ENABLED = false

/**
 * Card URL to include in the registration confirmation email, or undefined
 * to omit the section entirely. Included for card-eligible event types even
 * if the organizer hasn't saved controls yet — the card page explains when
 * it's not set up, and most organizers configure controls after registration
 * opens.
 */
export function buildConfirmationEmailCardUrl(
  eventType: string | null,
  managementToken: string
): string | undefined {
  if (!DIGITAL_CARD_EMAIL_LINK_ENABLED) return undefined
  return isDigitalCardEventType(eventType) ? buildDigitalCardUrl(managementToken) : undefined
}
