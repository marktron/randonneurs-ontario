/**
 * Digital brevet card domain logic (pure functions).
 *
 * Control open/close times are never stored — they are computed here from
 * the control's distance and the event start, exactly like the printed
 * control cards (see docs/digital-brevet-card.md).
 */

import { computeControlTimes, createTorontoDate, getNominalDistance } from '@/lib/brmTimes'
import { formatElapsedForSubmission, getAcpTimeLimitMinutes } from '@/lib/events/finish-time'
import { haversineMeters } from '@/lib/geo'

// ============================================================================
// Eligibility
// ============================================================================

/**
 * Event types that support a digital brevet card. Flèches are excluded:
 * team-based free-route events don't have a fixed control sequence.
 */
export const DIGITAL_CARD_EVENT_TYPES = ['brevet', 'populaire', 'permanent'] as const

export function isDigitalCardEventType(eventType: string | null): boolean {
  return eventType !== null && (DIGITAL_CARD_EVENT_TYPES as readonly string[]).includes(eventType)
}

/**
 * Default check-in radius for new controls. Deliberately generous while
 * RWGPS control coordinates remain unaudited (see review decisions in
 * docs/digital-brevet-card.md §14).
 */
export const DEFAULT_CONTROL_RADIUS_M = 500

// ============================================================================
// Event start & check-in acceptance window
// ============================================================================

/**
 * Build the event start Date from the events row's `event_date` (YYYY-MM-DD)
 * and `start_time` (HH:MM[:SS]), interpreted in Toronto local time.
 */
export function computeEventStart(eventDate: string, startTime: string | null): Date {
  const [year, month, day] = eventDate.split('-').map(Number)
  const [hours, minutes] = (startTime || '0:00').split(':').map(Number)
  return createTorontoDate(year, month - 1, day, hours, minutes)
}

/**
 * Per-registration pre-ride override columns. The DB CHECK
 * `registrations_pre_ride_both_or_neither` guarantees both set or both null.
 */
export interface PreRideStart {
  pre_ride_date: string | null
  pre_ride_start_time: string | null
}

/**
 * The start Date this rider's card runs on: the registration's approved
 * pre-ride start when set, otherwise the event's scheduled start. Every
 * control window, the check-in acceptance window, and the finish elapsed
 * time derive from this — same single-source-of-truth rule as
 * `computeEventStart`.
 */
export function resolveRiderStart(
  event: { event_date: string; start_time: string | null },
  registration: PreRideStart
): Date {
  if (registration.pre_ride_date !== null) {
    return computeEventStart(registration.pre_ride_date, registration.pre_ride_start_time)
  }
  return computeEventStart(event.event_date, event.start_time)
}

/** Check-ins accepted from this long before the event start. */
export const CHECKIN_WINDOW_BEFORE_START_MS = 2 * 60 * 60 * 1000
/** Check-ins accepted until this long after the ACP time limit expires. */
export const CHECKIN_WINDOW_AFTER_LIMIT_MS = 6 * 60 * 60 * 1000

/**
 * The window during which the server accepts check-ins for an event:
 * [start − 2 h, start + ACP time limit + 6 h]. Outside it, check-ins are
 * rejected outright (prevents accidental test taps from polluting data).
 */
export function getCheckinAcceptanceWindow(
  eventStart: Date,
  distanceKm: number
): { opensAt: Date; closesAt: Date } {
  const limitMs = getAcpTimeLimitMinutes(distanceKm) * 60 * 1000
  return {
    opensAt: new Date(eventStart.getTime() - CHECKIN_WINDOW_BEFORE_START_MS),
    closesAt: new Date(eventStart.getTime() + limitMs + CHECKIN_WINDOW_AFTER_LIMIT_MS),
  }
}

export function isWithinCheckinAcceptanceWindow(
  eventStart: Date,
  distanceKm: number,
  now: Date = new Date()
): boolean {
  const { opensAt, closesAt } = getCheckinAcceptanceWindow(eventStart, distanceKm)
  return now >= opensAt && now <= closesAt
}

// ============================================================================
// Control windows
// ============================================================================

export interface ControlWindow {
  openAt: Date
  closeAt: Date
}

/**
 * ACP open/close window for a single control, matching the printed-card
 * computation (`app/control-cards/print/page.tsx`).
 */
export function computeControlWindow(
  eventStart: Date,
  controlDistanceKm: number,
  eventDistanceKm: number
): ControlWindow {
  const { openAt, closeAt } = computeControlTimes(
    eventStart,
    controlDistanceKm,
    getNominalDistance(eventDistanceKm),
    eventDistanceKm
  )
  return { openAt, closeAt }
}

// ============================================================================
// Anomaly flags (derived at read time, never stored)
// ============================================================================

/** A late-synced check-in reached the server this long after the tap. */
export const LATE_SYNC_THRESHOLD_MS = 10 * 60 * 1000

export interface CheckinFlags {
  /** GPS fix was outside the control's radius. */
  outOfRadius: boolean
  /** Rider checked in without a usable GPS fix. */
  noGps: boolean
  /** Checked in before the control opened. */
  early: boolean
  /** Checked in after the control closed. */
  late: boolean
  /** Synced from the offline outbox well after the tap. */
  lateSync: boolean
}

export interface CheckinForFlags {
  method: string
  checked_in_at: string
  received_at: string
  distance_to_control_m: number | null
}

export function deriveCheckinFlags(
  checkin: CheckinForFlags,
  control: { radius_m: number },
  window: ControlWindow
): CheckinFlags {
  const checkedInAt = new Date(checkin.checked_in_at)
  const receivedAt = new Date(checkin.received_at)

  return {
    outOfRadius:
      checkin.method === 'gps' &&
      checkin.distance_to_control_m !== null &&
      checkin.distance_to_control_m > control.radius_m,
    noGps: checkin.method === 'manual',
    early: checkedInAt < window.openAt,
    late: checkedInAt > window.closeAt,
    // Admin corrections record a historical checked_in_at with received_at
    // defaulting to the time of the edit — that gap is not an offline-outbox
    // sync delay, so admin entries are exempt from the lateSync signal.
    lateSync:
      checkin.method !== 'admin' &&
      receivedAt.getTime() - checkedInAt.getTime() > LATE_SYNC_THRESHOLD_MS,
  }
}

export function hasAnyFlag(flags: CheckinFlags): boolean {
  return flags.outOfRadius || flags.noGps || flags.early || flags.late || flags.lateSync
}

// ============================================================================
// Wrong-control detection (GPS check-ins) & rider undo window
// ============================================================================

/**
 * How long after a check-in a rider may undo it themselves. After this the
 * only correction path is an organizer editing the check-in in the admin.
 */
export const RIDER_UNDO_WINDOW_MS = 15 * 60 * 1000

/** A control's geometry, enough to test whether a GPS fix lands inside it. */
export interface ControlGeo {
  lat: number | null
  lng: number | null
  radiusM: number
}

/** A candidate "other" control the rider might actually be standing at. */
export interface WrongControlCandidate extends ControlGeo {
  id: string
  name: string
  /** Already checked in (synced or pending in the outbox). */
  alreadyCheckedIn: boolean
}

export type WrongControlDecision =
  | { kind: 'redirect'; control: WrongControlCandidate; distanceM: number }
  | { kind: 'already-checked-in'; control: WrongControlCandidate; distanceM: number }

/**
 * Decide whether a GPS fix suggests the rider tapped the wrong control.
 *
 * - Tapped control has coords and the fix is inside its radius → `null`
 *   (proceed silently; also covers out-and-back routes where two controls
 *   share a location — a satisfied tap is never interrupted).
 * - Otherwise find the nearest OTHER control (with coords) whose radius
 *   contains the fix:
 *     - not yet checked in → `redirect` (offer to check in there instead)
 *     - already checked in → `already-checked-in` (offer proceed/cancel only)
 * - Fix inside no control's radius → `null` (today's behaviour: record + let
 *   the server flag it).
 *
 * Pure and React-free so it can be unit-tested directly.
 */
export function detectWrongControl(
  fix: { lat: number; lng: number },
  tapped: ControlGeo,
  others: WrongControlCandidate[]
): WrongControlDecision | null {
  // Satisfied tap: the fix is inside the control the rider actually tapped.
  if (
    tapped.lat !== null &&
    tapped.lng !== null &&
    haversineMeters(fix.lat, fix.lng, tapped.lat, tapped.lng) <= tapped.radiusM
  ) {
    return null
  }

  let nearest: { control: WrongControlCandidate; distanceM: number } | null = null
  for (const other of others) {
    if (other.lat === null || other.lng === null) continue
    const distanceM = haversineMeters(fix.lat, fix.lng, other.lat, other.lng)
    if (distanceM > other.radiusM) continue
    if (!nearest || distanceM < nearest.distanceM) {
      nearest = { control: other, distanceM }
    }
  }

  if (!nearest) return null

  return {
    kind: nearest.control.alreadyCheckedIn ? 'already-checked-in' : 'redirect',
    control: nearest.control,
    distanceM: nearest.distanceM,
  }
}

/** Format a metre distance as kilometres for rider-facing copy (e.g. "0.3"). */
export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(1)
}

/**
 * Elapsed ride time as the H:MM string the results form accepts
 * (`/^\d{1,3}:\d{2}$/` in submitRiderResult). Seconds round down; a finish
 * before the start (device clock skew) clamps to 0:00. Delegates the H:MM
 * formatting to `formatElapsedForSubmission` (lib/events/finish-time.ts) so
 * the two check-in-driven and manual-entry paths can't drift apart.
 */
export function computeElapsedHm(start: Date, end: Date): string {
  const totalMinutes = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000))
  return formatElapsedForSubmission(totalMinutes)
}
