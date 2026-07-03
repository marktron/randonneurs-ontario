/**
 * Digital brevet card domain logic (pure functions).
 *
 * Control open/close times are never stored — they are computed here from
 * the control's distance and the event start, exactly like the printed
 * control cards (see docs/digital-brevet-card.md).
 */

import { computeControlTimes, createTorontoDate, getNominalDistance } from '@/lib/brmTimes'
import { getAcpTimeLimitMinutes } from '@/lib/events/finish-time'

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
    lateSync: receivedAt.getTime() - checkedInAt.getTime() > LATE_SYNC_THRESHOLD_MS,
  }
}

export function hasAnyFlag(flags: CheckinFlags): boolean {
  return flags.outOfRadius || flags.noGps || flags.early || flags.late || flags.lateSync
}
