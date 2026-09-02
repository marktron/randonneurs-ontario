'use server'

/**
 * Digital brevet card rider flow (see docs/digital-brevet-card.md).
 *
 * Riders reach their card at /card/[token] where the token is the
 * registration's management_token — the same capability URL family used by
 * /registration/manage/[token] and /results/submit/[token]. No auth; all
 * reads/writes go through the service-role client.
 */

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { createActionResult, handleActionError, handleSupabaseError, logError } from '@/lib/errors'
import { isRateLimited } from '@/lib/rate-limit'
import { haversineMeters } from '@/lib/geo'
import { cumulativeLegDistanceKm } from '@/lib/controlPoints'
import {
  resolveRiderStart,
  computeControlWindow,
  computeElapsedHm,
  deriveCheckinFlags,
  getCheckinAcceptanceWindow,
  isDigitalCardEventType,
  isWithinCheckinAcceptanceWindow,
  resolveRecordedCheckinTime,
  RIDER_UNDO_WINDOW_MS,
  type CheckinFlags,
} from '@/lib/brevet-card'
import { handleFinishIfFinalControl, revertFinishIfFinalControl } from '@/lib/events/finish-result'
import {
  MAX_LOCATION_ACCURACY_M,
  MAX_LOCATION_FAILURE_ELAPSED_MS,
  isLocationContext,
  isLocationFailureReason,
  isLocationFailureStage,
  isValidCoordinatePair,
  type LocationFailureDiagnostic,
} from '@/lib/location-diagnostics'
import type { ActionResult } from '@/types/actions'
import type { CheckinMethod, ControlCheckinInsert } from '@/types/queries'

// Rate limit: generous enough for a rider re-tapping through a 1200 km event,
// tight enough to stop scripted abuse of a leaked token.
const CHECKIN_MAX_ATTEMPTS = 30
const CHECKIN_WINDOW_MS = 15 * 60 * 1000

// Device clocks can drift; a tap "from the future" beyond this is rejected.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

// ============================================================================
// Shared: derive whether a control is the event's final control
// ============================================================================

/**
 * Given the result of a MAX(position) event_controls query (run alongside
 * other work, never as an added sequential round trip) and the position of
 * the control being checked in or undone, decide whether that control is
 * the event's final one. Used by both `checkInAtControl` and `undoCheckin`
 * so the fallback policy lives in one place: any failure to resolve either
 * side (a failed max-position query, or — for `undoCheckin` — a failed
 * lookup of the undone control's own position, signalled by a null
 * `position`) fails closed as not-final and is logged. Wrongly triggering
 * the finish/revert flow is worse than occasionally missing it.
 */
function deriveIsFinalControl(
  maxPositionRow: { position: number } | null,
  maxPositionError: unknown,
  position: number | null,
  logContext: { operation: string; context?: Record<string, unknown> }
): boolean {
  if (maxPositionError) {
    logError(maxPositionError, logContext)
    return false
  }
  return maxPositionRow != null && position != null && maxPositionRow.position === position
}

// ============================================================================
// Types
// ============================================================================

export interface CardControl {
  id: string
  position: number
  name: string
  /** Route distance (km) — per-leg for collection events, mirroring RWGPS. */
  distanceKm: number
  /**
   * Cumulative event distance (km), shown as a second "N km this event" line.
   * Set only for legs-2+ controls on collection events; null (or absent)
   * elsewhere, where it would equal `distanceKm`.
   */
  overallDistanceKm?: number | null
  lat: number | null
  lng: number | null
  radiusM: number
  notes: string | null
  /** Leg heading from event_controls.leg_name; null for single-route events. */
  legName: string | null
  /**
   * ISO timestamps, computed from distance + event start (never stored).
   * Null for leg-tagged controls: per-leg distances restart at 0, so no
   * per-control window exists — the overall event limit governs.
   */
  opensAt: string | null
  closesAt: string | null
}

export interface CardCheckin {
  controlId: string
  checkedInAt: string
  receivedAt: string
  method: string
  distanceToControlM: number | null
  flags: CheckinFlags
}

export interface BrevetCardData {
  registration: {
    id: string
    status: string | null
    /** True when this registration has an approved pre-ride start. */
    isPreRide: boolean
  }
  event: {
    id: string
    slug: string
    name: string
    status: string | null
    eventType: string | null
    eventDate: string
    startTime: string | null
    distanceKm: number
    chapterName: string | null
    /** ISO timestamp of this rider's start (the pre-ride start when set). */
    startsAt: string
    organizer: {
      name: string | null
      phone: string | null
      email: string | null
    }
    /** RWGPS route id for the event's linked route, or null when none. */
    rwgpsId: string | null
  }
  rider: {
    firstName: string
    lastName: string
  }
  controls: CardControl[]
  checkins: CardCheckin[]
}

interface RegistrationWithEvent {
  id: string
  status: string | null
  rider_id: string
  pre_ride_date: string | null
  pre_ride_start_time: string | null
  events: {
    id: string
    slug: string
    name: string
    status: string | null
    event_type: string | null
    event_date: string
    start_time: string | null
    distance_km: number
    organizer_name: string | null
    organizer_phone: string | null
    organizer_email: string | null
    chapters: { name: string; slug: string } | null
    routes: { rwgps_id: string | null } | null
  }
  riders: { first_name: string; last_name: string; email: string | null }
}

// ============================================================================
// Read: card data by token
// ============================================================================

/**
 * Load the full card for a registration token, or null when the token is
 * unknown. Returns data even when the card isn't usable (cancelled
 * registration, ineligible event type, no controls) — the page decides what
 * to show; check `registration.status`, `event.eventType`, and `controls`.
 */
export async function getBrevetCardByToken(token: string): Promise<BrevetCardData | null> {
  if (!token) return null

  const supabase = getSupabaseAdmin()

  const { data: registration, error } = await supabase
    .from('registrations')
    .select(
      `
      id, status, rider_id, pre_ride_date, pre_ride_start_time,
      events!inner (
        id, slug, name, status, event_type, event_date, start_time, distance_km,
        organizer_name, organizer_phone, organizer_email,
        routes (rwgps_id),
        chapters (name, slug)
      ),
      riders!inner (first_name, last_name, email)
    `
    )
    .eq('management_token', token)
    .single()

  // Expected "not found" for an invalid token — not logged to Sentry.
  if (error || !registration) {
    return null
  }

  const reg = registration as unknown as RegistrationWithEvent
  const event = reg.events

  // Both queries depend only on the registration row — run them together.
  const [{ data: controlRows, error: controlsError }, { data: checkinRows, error: checkinsError }] =
    await Promise.all([
      supabase
        .from('event_controls')
        .select(
          'id, position, name, distance_km, lat, lng, radius_m, notes, leg_rwgps_id, leg_name'
        )
        .eq('event_id', event.id)
        .order('position', { ascending: true }),
      supabase
        .from('control_checkins')
        .select('control_id, checked_in_at, received_at, method, distance_to_control_m')
        .eq('registration_id', reg.id),
    ])

  // Fail loud on transient DB errors: returning null here would 404 the
  // page and rendering without check-ins would silently show an empty card.
  if (controlsError) {
    logError(controlsError, {
      operation: 'getBrevetCardByToken.controls',
      context: { eventId: event.id },
    })
    throw new Error('Failed to load brevet card controls')
  }
  if (checkinsError) {
    logError(checkinsError, {
      operation: 'getBrevetCardByToken.checkins',
      context: { registrationId: reg.id },
    })
    throw new Error('Failed to load brevet card check-ins')
  }

  const controls = (controlRows || []) as {
    id: string
    position: number
    name: string
    distance_km: number
    lat: number | null
    lng: number | null
    radius_m: number
    notes: string | null
    leg_rwgps_id: string | null
    leg_name: string | null
  }[]

  const checkins = (checkinRows || []) as {
    control_id: string
    checked_in_at: string
    received_at: string
    method: string
    distance_to_control_m: number | null
  }[]

  const eventStart = resolveRiderStart(event, reg)
  const controlById = new Map(controls.map((c) => [c.id, c]))

  // Collection events store per-leg distances (restarting at 0 each leg);
  // legs-2+ controls also display the cumulative event distance. Null for
  // single-route events, whose stored distances are already cumulative.
  const cumulativeDistances = cumulativeLegDistanceKm(
    controls.map((c) => ({
      distanceKm: c.distance_km,
      legRwgpsId: c.leg_rwgps_id,
      legName: c.leg_name,
    }))
  )
  const firstLegRwgpsId = controls[0]?.leg_rwgps_id ?? null

  return {
    registration: {
      id: reg.id,
      status: reg.status,
      isPreRide: reg.pre_ride_date != null,
    },
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      status: event.status,
      eventType: event.event_type,
      eventDate: event.event_date,
      startTime: event.start_time,
      distanceKm: event.distance_km,
      chapterName: event.chapters?.name || null,
      startsAt: eventStart.toISOString(),
      organizer: {
        name: event.organizer_name,
        phone: event.organizer_phone,
        email: event.organizer_email,
      },
      rwgpsId: event.routes?.rwgps_id ?? null,
    },
    rider: {
      firstName: reg.riders.first_name,
      lastName: reg.riders.last_name,
    },
    controls: controls.map((control, i) => {
      // Leg-tagged controls carry no window — their stored distances restart
      // at 0 per leg, so a window from the event start would be wrong for
      // legs 2+.
      const window =
        control.leg_name !== null
          ? null
          : computeControlWindow(eventStart, control.distance_km, event.distance_km)
      return {
        id: control.id,
        position: control.position,
        name: control.name,
        distanceKm: control.distance_km,
        overallDistanceKm:
          cumulativeDistances && control.leg_rwgps_id !== firstLegRwgpsId
            ? cumulativeDistances[i]
            : null,
        lat: control.lat,
        lng: control.lng,
        radiusM: control.radius_m,
        notes: control.notes,
        legName: control.leg_name,
        opensAt: window === null ? null : window.openAt.toISOString(),
        closesAt: window === null ? null : window.closeAt.toISOString(),
      }
    }),
    checkins: checkins.flatMap((checkin) => {
      const control = controlById.get(checkin.control_id)
      // A check-in for a deleted/replaced control has nothing to render.
      if (!control) return []
      const window =
        control.leg_name !== null
          ? null
          : computeControlWindow(eventStart, control.distance_km, event.distance_km)
      return [
        {
          controlId: checkin.control_id,
          checkedInAt: checkin.checked_in_at,
          receivedAt: checkin.received_at,
          method: checkin.method,
          distanceToControlM: checkin.distance_to_control_m,
          flags: deriveCheckinFlags(checkin, control, window),
        },
      ]
    }),
  }
}

// ============================================================================
// Write: check in at a control
// ============================================================================

interface CheckinInputBase {
  controlId: string
  /** ISO timestamp from the device clock at tap time. */
  checkedInAt: string
}

interface GpsCheckinInput extends CheckinInputBase {
  lat: number
  lng: number
  accuracyM?: number
  /**
   * Server-issued receipt timestamp of the manual row a GPS retry intends to
   * enrich. This prevents a delayed retry from upgrading a replacement row
   * created after Undo.
   */
  expectedManualReceivedAt?: string
  locationFailure?: never
}

interface ManualCheckinInput extends CheckinInputBase {
  lat?: never
  lng?: never
  accuracyM?: never
  expectedManualReceivedAt?: never
  /** Bounded, privacy-conscious context for a coordinate-less check-in. */
  locationFailure?: LocationFailureDiagnostic
}

/** Coordinates are an all-or-none pair at compile time and at runtime. */
export type CheckinInput = GpsCheckinInput | ManualCheckinInput

export interface CheckinOutcome {
  checkin: CardCheckin
  /** True when this rider had already checked in at this control. */
  alreadyExisted: boolean
  /** True when a recent manual check-in was atomically enriched with this GPS fix. */
  upgradedFromManual: boolean
}

interface PersistedCheckinRow {
  control_id: string
  checked_in_at: string
  received_at: string
  method: string
  distance_to_control_m: number | null
}

/** Every read of a persisted check-in returns exactly these columns. */
const CHECKIN_ROW_COLUMNS = 'control_id, checked_in_at, received_at, method, distance_to_control_m'

/**
 * The row that currently owns (registration, control), if any. Used by both
 * write-miss fallbacks: the 23505 insert conflict and the upgrade whose
 * optimistic-lock UPDATE matched nothing.
 */
function fetchExistingCheckinRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  registrationId: string,
  controlId: string
) {
  return supabase
    .from('control_checkins')
    .select(CHECKIN_ROW_COLUMNS)
    .eq('registration_id', registrationId)
    .eq('control_id', controlId)
    .maybeSingle()
}

/**
 * Result of a check-in attempt. `retryable` marks failures that are
 * transient (rate limit, DB hiccup): the client outbox must keep the entry
 * queued and retry later instead of dropping the tap.
 */
export type CheckinResult = ActionResult<CheckinOutcome> & {
  retryable?: boolean
}

export async function checkInAtControl(token: string, input: CheckinInput): Promise<CheckinResult> {
  try {
    if (!token) {
      return { success: false, error: 'Invalid card link' }
    }

    if (isRateLimited('checkin', token, CHECKIN_MAX_ATTEMPTS, CHECKIN_WINDOW_MS)) {
      return {
        success: false,
        error: 'Too many check-in attempts. Please wait a few minutes.',
        retryable: true,
      }
    }

    const checkedInAt = new Date(input.checkedInAt || '')
    if (Number.isNaN(checkedInAt.getTime())) {
      return { success: false, error: 'Invalid check-in time' }
    }

    const hasLat = input.lat !== undefined
    const hasLng = input.lng !== undefined

    // Coordinates are a pair. Treat null/non-number runtime input as invalid
    // too, even though the TypeScript boundary advertises optional numbers.
    if (
      hasLat !== hasLng ||
      (hasLat && (typeof input.lat !== 'number' || typeof input.lng !== 'number'))
    ) {
      return { success: false, error: 'Latitude and longitude must be provided together' }
    }

    const hasCoords = hasLat && hasLng
    if (hasCoords) {
      if (!isValidCoordinatePair(input.lat, input.lng)) {
        return { success: false, error: 'Invalid GPS coordinates' }
      }
      if (
        input.accuracyM !== undefined &&
        (typeof input.accuracyM !== 'number' ||
          !Number.isFinite(input.accuracyM) ||
          input.accuracyM < 0 ||
          input.accuracyM > MAX_LOCATION_ACCURACY_M)
      ) {
        return { success: false, error: 'Invalid GPS accuracy' }
      }
    } else if (input.accuracyM !== undefined) {
      return { success: false, error: 'GPS accuracy requires latitude and longitude' }
    }

    if (input.expectedManualReceivedAt !== undefined) {
      if (!hasCoords) {
        return { success: false, error: 'A manual check-in identity requires GPS coordinates' }
      }
      if (
        typeof input.expectedManualReceivedAt !== 'string' ||
        Number.isNaN(new Date(input.expectedManualReceivedAt).getTime())
      ) {
        return { success: false, error: 'Invalid manual check-in identity' }
      }
    }

    if (hasCoords && input.locationFailure !== undefined) {
      return { success: false, error: 'Location failure details require a manual check-in' }
    }

    if (input.locationFailure !== undefined) {
      const diagnostic = input.locationFailure
      if (
        diagnostic === null ||
        typeof diagnostic !== 'object' ||
        !isLocationFailureReason(diagnostic.reason) ||
        !isLocationFailureStage(diagnostic.stage) ||
        !isLocationContext(diagnostic.context) ||
        typeof diagnostic.elapsedMs !== 'number' ||
        !Number.isInteger(diagnostic.elapsedMs) ||
        diagnostic.elapsedMs < 0 ||
        diagnostic.elapsedMs > MAX_LOCATION_FAILURE_ELAPSED_MS
      ) {
        return { success: false, error: 'Invalid location failure details' }
      }
    }

    const supabase = getSupabaseAdmin()

    const { data: registration, error: fetchError } = await supabase
      .from('registrations')
      .select(
        `
        id, status, rider_id, pre_ride_date, pre_ride_start_time,
        events!inner (id, slug, name, status, event_type, event_date, start_time, distance_km, chapters (name, slug)),
        riders!inner (first_name, last_name, email)
      `
      )
      .eq('management_token', token)
      .single()

    // Expected "not found" for an invalid token — not logged to Sentry.
    if (fetchError || !registration) {
      return { success: false, error: 'Registration not found' }
    }

    const reg = registration as unknown as RegistrationWithEvent
    const event = reg.events

    if (reg.status !== 'registered') {
      return { success: false, error: 'Only active registrations can check in' }
    }

    if (!isDigitalCardEventType(event.event_type)) {
      return { success: false, error: 'This event does not use a digital brevet card' }
    }

    if (event.status === 'cancelled') {
      return { success: false, error: 'This event has been cancelled' }
    }
    if (event.status === 'submitted') {
      return { success: false, error: 'Results for this event have already been submitted' }
    }

    const eventStart = resolveRiderStart(event, reg)

    if (!isWithinCheckinAcceptanceWindow(eventStart, event.distance_km)) {
      return {
        success: false,
        error:
          'Check-ins are only accepted around the event (from 2 hours before the start until the time limit expires)',
      }
    }

    // Reject taps claiming to be from the future beyond plausible clock skew.
    // A GPS upgrade is exempt: it echoes back this server's own recorded
    // time, which is legitimately ahead for a pre-start tap at the first
    // control (resolveRecordedCheckinTime records the official start). The
    // upgrade UPDATE never writes checked_in_at, so nothing is persisted
    // from this value either way.
    const isGpsUpgrade = input.expectedManualReceivedAt !== undefined
    if (!isGpsUpgrade && checkedInAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
      return { success: false, error: 'Check-in time is in the future' }
    }

    // ...and taps backdated to before check-ins opened for this event.
    const { opensAt: checkinOpensAt } = getCheckinAcceptanceWindow(eventStart, event.distance_km)
    if (checkedInAt.getTime() < checkinOpensAt.getTime()) {
      return {
        success: false,
        error: 'Check-in time is before check-in opened for this event (2 hours before the start)',
      }
    }

    // Verify the control belongs to this registration's event, and — in the
    // same round trip — find the event's highest control position, so the
    // finish flow below doesn't need a second sequential event_controls
    // query to know whether this was the final control.
    const [
      { data: controlRow, error: controlError },
      { data: maxPositionRow, error: maxPositionError },
    ] = await Promise.all([
      supabase
        .from('event_controls')
        .select('id, event_id, name, position, distance_km, lat, lng, radius_m, leg_name')
        .eq('id', input.controlId)
        .single(),
      supabase
        .from('event_controls')
        .select('position')
        .eq('event_id', event.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (controlError || !controlRow) {
      return { success: false, error: 'Control not found' }
    }

    const control = controlRow as {
      id: string
      event_id: string
      name: string
      position: number
      distance_km: number
      lat: number | null
      lng: number | null
      radius_m: number
      leg_name: string | null
    }

    if (control.event_id !== event.id) {
      return { success: false, error: 'Control not found' }
    }

    const isFinalControl = deriveIsFinalControl(
      maxPositionRow as { position: number } | null,
      maxPositionError,
      control.position,
      { operation: 'checkInAtControl.maxPosition', context: { eventId: event.id } }
    )

    // Riders tap the start control when they arrive, often before the gun.
    // Record the official start instead of the tap. Positions are
    // renormalized 1-based on every save (lib/actions/event-controls.ts), so
    // position 1 is always the first control.
    const recordedCheckinAt = resolveRecordedCheckinTime(
      checkedInAt,
      eventStart,
      control.position === 1
    )

    // The server derives the method: coordinates present → gps, absent →
    // manual (recorded and flagged for organizer review, never blocked).
    const method: CheckinMethod = hasCoords ? 'gps' : 'manual'
    const distanceToControl =
      hasCoords && control.lat !== null && control.lng !== null
        ? haversineMeters(input.lat!, input.lng!, control.lat, control.lng)
        : null

    const insertData: ControlCheckinInsert = {
      control_id: control.id,
      registration_id: reg.id,
      checked_in_at: recordedCheckinAt.toISOString(),
      method,
      lat: hasCoords ? input.lat : null,
      lng: hasCoords ? input.lng : null,
      accuracy_m: hasCoords && typeof input.accuracyM === 'number' ? input.accuracyM : null,
      distance_to_control_m: distanceToControl,
      location_failure_reason: input.locationFailure?.reason ?? null,
      location_failure_stage: input.locationFailure?.stage ?? null,
      location_failure_elapsed_ms: input.locationFailure?.elapsedMs ?? null,
      location_failure_context: input.locationFailure?.context ?? null,
    }

    let row: PersistedCheckinRow | null = null
    let alreadyExisted = false
    let upgradedFromManual = false

    if (input.expectedManualReceivedAt !== undefined) {
      // A queued upgrade from an older client (localStorage survives deploys)
      // can arrive from far away. Refuse it rather than overwrite the manual
      // row's honest no-GPS diagnostic with an out-of-radius fix.
      if (distanceToControl !== null && distanceToControl > control.radius_m) {
        return {
          success: false,
          error: 'GPS could not be added: that fix is outside this control',
        }
      }

      // Upgrade requests are update-only. They must never insert: if Undo
      // removes the target before a delayed request arrives, an INSERT would
      // silently resurrect the rider's deleted check-in.
      const upgradeCutoff = new Date(Date.now() - RIDER_UNDO_WINDOW_MS).toISOString()
      const { data: upgraded, error: upgradeError } = await supabase
        .from('control_checkins')
        .update({
          method: 'gps',
          lat: input.lat,
          lng: input.lng,
          accuracy_m: input.accuracyM ?? null,
          distance_to_control_m: distanceToControl,
          location_failure_reason: null,
          location_failure_stage: null,
          location_failure_elapsed_ms: null,
          location_failure_context: null,
        })
        .eq('registration_id', reg.id)
        .eq('control_id', control.id)
        .eq('method', 'manual')
        .eq('received_at', input.expectedManualReceivedAt)
        .gte('received_at', upgradeCutoff)
        .select(CHECKIN_ROW_COLUMNS)
        .maybeSingle()

      if (upgradeError) {
        return {
          ...handleSupabaseError(
            upgradeError,
            {
              operation: 'checkInAtControl.upgradeManual',
              context: { controlId: control.id },
            },
            'Failed to record check-in'
          ),
          retryable: true,
        }
      }

      if (upgraded) {
        row = upgraded as PersistedCheckinRow
        upgradedFromManual = true
      } else {
        // The target may have aged out, been corrected by an organizer, or
        // been replaced after Undo. Return the current winner when one
        // exists, but never apply the stale GPS evidence to it.
        const { data: existing, error: existingError } = await fetchExistingCheckinRow(
          supabase,
          reg.id,
          control.id
        )

        if (existingError) {
          return {
            ...handleSupabaseError(
              existingError,
              {
                operation: 'checkInAtControl.fetchUpgradeTarget',
                context: { controlId: control.id },
              },
              'Failed to record check-in'
            ),
            retryable: true,
          }
        }
        if (!existing) {
          return {
            success: false,
            error: 'The saved check-in was removed before GPS could be added',
          }
        }
        row = existing as PersistedCheckinRow
      }
      alreadyExisted = true
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('control_checkins')
        .insert(insertData)
        .select(CHECKIN_ROW_COLUMNS)
        .single()

      row = inserted as PersistedCheckinRow | null

      if (insertError) {
        // Unique violation (registration_id, control_id) — the offline outbox
        // retried a check-in that already landed. Return the existing row.
        if (insertError.code === '23505') {
          const { data: existing, error: existingError } = await fetchExistingCheckinRow(
            supabase,
            reg.id,
            control.id
          )

          if (existingError || !existing) {
            return {
              ...handleSupabaseError(
                existingError,
                { operation: 'checkInAtControl.fetchExisting', context: { controlId: control.id } },
                'Failed to record check-in'
              ),
              retryable: true,
            }
          }
          row = existing as PersistedCheckinRow
          alreadyExisted = true
        } else {
          return {
            ...handleSupabaseError(
              insertError,
              { operation: 'checkInAtControl', context: { controlId: control.id } },
              'Failed to record check-in'
            ),
            retryable: true,
          }
        }
      }
    }

    if (!row) {
      return { success: false, error: 'Failed to record check-in', retryable: true }
    }

    // Null for leg-tagged controls — no per-control window exists (see
    // CardControl.opensAt), so the returned flags never read early/late.
    const window =
      control.leg_name !== null
        ? null
        : computeControlWindow(eventStart, control.distance_km, event.distance_km)

    // Final-control check-ins pre-fill the rider's result and send the
    // "add your track" email. Never blocks the check-in (module never throws).
    await handleFinishIfFinalControl({
      isFinalControl,
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        event_date: event.event_date,
        distance_km: event.distance_km,
        chapters: event.chapters,
      },
      rider: {
        id: reg.rider_id,
        firstName: reg.riders.first_name,
        lastName: reg.riders.last_name,
        email: reg.riders.email,
      },
      managementToken: token,
      finishTime: computeElapsedHm(eventStart, new Date(row.checked_in_at)),
    })

    return createActionResult<CheckinOutcome>({
      checkin: {
        controlId: row.control_id,
        checkedInAt: row.checked_in_at,
        receivedAt: row.received_at,
        method: row.method,
        distanceToControlM: row.distance_to_control_m,
        flags: deriveCheckinFlags(row, control, window),
      },
      alreadyExisted,
      upgradedFromManual,
    })
  } catch (error) {
    // Unexpected failures (DB down, network to Supabase) are transient.
    return {
      ...handleActionError(error, { operation: 'checkInAtControl' }, 'Failed to record check-in'),
      retryable: true,
    }
  }
}

// ============================================================================
// Write: undo a check-in (rider self-service, time-boxed)
// ============================================================================

export interface UndoCheckinInput {
  controlId: string
}

/**
 * Let a rider remove their own check-in for a short window after it was
 * recorded (RIDER_UNDO_WINDOW_MS, keyed off `received_at` so a late offline
 * sync still gets the full window). After that, only an organizer can
 * correct it. Admin-recorded check-ins are never rider-removable.
 */
export async function undoCheckin(token: string, input: UndoCheckinInput): Promise<ActionResult> {
  try {
    if (!token) {
      return { success: false, error: 'Invalid card link' }
    }

    if (isRateLimited('checkin', token, CHECKIN_MAX_ATTEMPTS, CHECKIN_WINDOW_MS)) {
      return {
        success: false,
        error: 'Too many attempts. Please wait a few minutes.',
      }
    }

    const supabase = getSupabaseAdmin()

    const { data: registration, error: fetchError } = await supabase
      .from('registrations')
      .select(
        `
        id, status, rider_id,
        events!inner (id, status, event_type)
      `
      )
      .eq('management_token', token)
      .single()

    // Expected "not found" for an invalid token — not logged to Sentry.
    if (fetchError || !registration) {
      return { success: false, error: 'Registration not found' }
    }

    const reg = registration as unknown as {
      id: string
      status: string | null
      rider_id: string
      events: { id: string; status: string | null; event_type: string | null }
    }
    const event = reg.events

    // Mirror checkInAtControl's lifecycle guards: a cancelled or submitted
    // (frozen) event is no longer rider-mutable.
    if (event.status === 'cancelled') {
      return { success: false, error: 'This event has been cancelled' }
    }
    if (event.status === 'submitted') {
      return {
        success: false,
        error: 'Results for this event have already been submitted',
      }
    }

    const { data: existing, error: existingError } = await supabase
      .from('control_checkins')
      .select('id, method, received_at')
      .eq('registration_id', reg.id)
      .eq('control_id', input.controlId)
      .maybeSingle()

    if (existingError) {
      return handleSupabaseError(
        existingError,
        { operation: 'undoCheckin.fetch', context: { controlId: input.controlId } },
        'Failed to undo check-in'
      )
    }

    if (!existing) {
      return { success: false, error: 'Check-in not found' }
    }

    const checkin = existing as { id: string; method: string; received_at: string }

    if (checkin.method === 'admin') {
      return {
        success: false,
        error:
          'This check-in was recorded by an organizer and can only be changed by an organizer.',
      }
    }

    if (Date.now() - new Date(checkin.received_at).getTime() > RIDER_UNDO_WINDOW_MS) {
      return {
        success: false,
        error: 'The undo window has passed — the organizer can correct it.',
      }
    }

    // Delete the check-in and — in the same round trip — find whether the
    // undone control was the event's final one (control's own position vs.
    // the event's highest position), so revertFinishIfFinalControl below
    // doesn't need its own sequential event_controls queries.
    const [
      { error: deleteError },
      { data: controlPositionRow, error: controlPositionError },
      { data: maxPositionRow, error: maxPositionError },
    ] = await Promise.all([
      supabase.from('control_checkins').delete().eq('id', checkin.id),
      supabase.from('event_controls').select('position').eq('id', input.controlId).single(),
      supabase
        .from('event_controls')
        .select('position')
        .eq('event_id', event.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (deleteError) {
      return handleSupabaseError(
        deleteError,
        { operation: 'undoCheckin.delete', context: { checkinId: checkin.id } },
        'Failed to undo check-in'
      )
    }

    // The undone control's own position lookup can fail independently of
    // the max-position query; log that here (same not-final fallback the
    // old sequential lookup used), then let the shared derivation below
    // handle the max-position side.
    if (controlPositionError) {
      logError(controlPositionError, {
        operation: 'undoCheckin.controlPosition',
        context: { controlId: input.controlId },
      })
    }
    const isFinalControl = deriveIsFinalControl(
      maxPositionRow as { position: number } | null,
      maxPositionError,
      controlPositionError
        ? null
        : ((controlPositionRow as { position: number } | null)?.position ?? null),
      { operation: 'undoCheckin.maxPosition', context: { eventId: event.id } }
    )

    // If the rider undid their finish check-in, roll back the pre-filled result.
    await revertFinishIfFinalControl({
      eventId: event.id,
      riderId: reg.rider_id,
      isFinalControl,
    })

    revalidatePath(`/card/${token}`)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'undoCheckin' }, 'Failed to undo check-in')
  }
}
