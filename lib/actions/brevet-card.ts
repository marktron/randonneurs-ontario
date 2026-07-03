'use server'

/**
 * Digital brevet card rider flow (see docs/digital-brevet-card.md).
 *
 * Riders reach their card at /card/[token] where the token is the
 * registration's management_token — the same capability URL family used by
 * /registration/manage/[token] and /results/submit/[token]. No auth; all
 * reads/writes go through the service-role client.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { createActionResult, handleActionError, handleSupabaseError } from '@/lib/errors'
import { isRateLimited } from '@/lib/rate-limit'
import { haversineMeters } from '@/lib/geo'
import {
  computeEventStart,
  computeControlWindow,
  deriveCheckinFlags,
  isDigitalCardEventType,
  isWithinCheckinAcceptanceWindow,
  type CheckinFlags,
} from '@/lib/brevet-card'
import type { ActionResult } from '@/types/actions'
import type { CheckinMethod, ControlCheckinInsert } from '@/types/queries'

// Rate limit: generous enough for a rider re-tapping through a 1200 km event,
// tight enough to stop scripted abuse of a leaked token.
const CHECKIN_MAX_ATTEMPTS = 30
const CHECKIN_WINDOW_MS = 15 * 60 * 1000

// Device clocks can drift; a tap "from the future" beyond this is rejected.
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

// ============================================================================
// Types
// ============================================================================

export interface CardControl {
  id: string
  position: number
  name: string
  distanceKm: number
  lat: number | null
  lng: number | null
  radiusM: number
  notes: string | null
  /** ISO timestamps, computed from distance + event start (never stored). */
  opensAt: string
  closesAt: string
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
    /** ISO timestamp of the event start in real time. */
    startsAt: string
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
  events: {
    id: string
    slug: string
    name: string
    status: string | null
    event_type: string | null
    event_date: string
    start_time: string | null
    distance_km: number
    chapters: { name: string } | null
  }
  riders: { first_name: string; last_name: string }
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
      id, status,
      events!inner (
        id, slug, name, status, event_type, event_date, start_time, distance_km,
        chapters (name)
      ),
      riders!inner (first_name, last_name)
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

  const { data: controlRows, error: controlsError } = await supabase
    .from('event_controls')
    .select('id, position, name, distance_km, lat, lng, radius_m, notes')
    .eq('event_id', event.id)
    .order('position', { ascending: true })

  if (controlsError) {
    return null
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
  }[]

  const { data: checkinRows } = await supabase
    .from('control_checkins')
    .select('control_id, checked_in_at, received_at, method, distance_to_control_m')
    .eq('registration_id', reg.id)

  const checkins = (checkinRows || []) as {
    control_id: string
    checked_in_at: string
    received_at: string
    method: string
    distance_to_control_m: number | null
  }[]

  const eventStart = computeEventStart(event.event_date, event.start_time)
  const controlById = new Map(controls.map((c) => [c.id, c]))

  return {
    registration: {
      id: reg.id,
      status: reg.status,
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
    },
    rider: {
      firstName: reg.riders.first_name,
      lastName: reg.riders.last_name,
    },
    controls: controls.map((control) => {
      const window = computeControlWindow(eventStart, control.distance_km, event.distance_km)
      return {
        id: control.id,
        position: control.position,
        name: control.name,
        distanceKm: control.distance_km,
        lat: control.lat,
        lng: control.lng,
        radiusM: control.radius_m,
        notes: control.notes,
        opensAt: window.openAt.toISOString(),
        closesAt: window.closeAt.toISOString(),
      }
    }),
    checkins: checkins.flatMap((checkin) => {
      const control = controlById.get(checkin.control_id)
      // A check-in for a deleted/replaced control has nothing to render.
      if (!control) return []
      const window = computeControlWindow(eventStart, control.distance_km, event.distance_km)
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

export interface CheckinInput {
  controlId: string
  /** ISO timestamp from the device clock at tap time. */
  checkedInAt: string
  lat?: number
  lng?: number
  accuracyM?: number
}

export interface CheckinOutcome {
  checkin: CardCheckin
  /** True when this rider had already checked in at this control. */
  alreadyExisted: boolean
}

export async function checkInAtControl(
  token: string,
  input: CheckinInput
): Promise<ActionResult<CheckinOutcome>> {
  try {
    if (!token) {
      return { success: false, error: 'Invalid card link' }
    }

    if (isRateLimited('checkin', token, CHECKIN_MAX_ATTEMPTS, CHECKIN_WINDOW_MS)) {
      return { success: false, error: 'Too many check-in attempts. Please wait a few minutes.' }
    }

    const checkedInAt = new Date(input.checkedInAt || '')
    if (Number.isNaN(checkedInAt.getTime())) {
      return { success: false, error: 'Invalid check-in time' }
    }

    const hasCoords = typeof input.lat === 'number' && typeof input.lng === 'number'
    if (hasCoords) {
      if (input.lat! < -90 || input.lat! > 90 || input.lng! < -180 || input.lng! > 180) {
        return { success: false, error: 'Invalid GPS coordinates' }
      }
      if (typeof input.accuracyM === 'number' && input.accuracyM < 0) {
        return { success: false, error: 'Invalid GPS accuracy' }
      }
    }

    const supabase = getSupabaseAdmin()

    const { data: registration, error: fetchError } = await supabase
      .from('registrations')
      .select(
        `
        id, status,
        events!inner (id, slug, name, status, event_type, event_date, start_time, distance_km, chapters (name)),
        riders!inner (first_name, last_name)
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

    const eventStart = computeEventStart(event.event_date, event.start_time)

    if (!isWithinCheckinAcceptanceWindow(eventStart, event.distance_km)) {
      return {
        success: false,
        error:
          'Check-ins are only accepted around the event (from 2 hours before the start until the time limit expires)',
      }
    }

    // Reject taps claiming to be from the future beyond plausible clock skew.
    if (checkedInAt.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) {
      return { success: false, error: 'Check-in time is in the future' }
    }

    // Verify the control belongs to this registration's event.
    const { data: controlRow, error: controlError } = await supabase
      .from('event_controls')
      .select('id, event_id, name, distance_km, lat, lng, radius_m')
      .eq('id', input.controlId)
      .single()

    if (controlError || !controlRow) {
      return { success: false, error: 'Control not found' }
    }

    const control = controlRow as {
      id: string
      event_id: string
      name: string
      distance_km: number
      lat: number | null
      lng: number | null
      radius_m: number
    }

    if (control.event_id !== event.id) {
      return { success: false, error: 'Control not found' }
    }

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
      checked_in_at: checkedInAt.toISOString(),
      method,
      lat: hasCoords ? input.lat : null,
      lng: hasCoords ? input.lng : null,
      accuracy_m: hasCoords && typeof input.accuracyM === 'number' ? input.accuracyM : null,
      distance_to_control_m: distanceToControl,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('control_checkins')
      .insert(insertData)
      .select('control_id, checked_in_at, received_at, method, distance_to_control_m')
      .single()

    let row = inserted as {
      control_id: string
      checked_in_at: string
      received_at: string
      method: string
      distance_to_control_m: number | null
    } | null
    let alreadyExisted = false

    if (insertError) {
      // Unique violation (registration_id, control_id) — the offline outbox
      // retried a check-in that already landed. Return the existing row.
      if (insertError.code === '23505') {
        const { data: existing, error: existingError } = await supabase
          .from('control_checkins')
          .select('control_id, checked_in_at, received_at, method, distance_to_control_m')
          .eq('registration_id', reg.id)
          .eq('control_id', control.id)
          .single()

        if (existingError || !existing) {
          return handleSupabaseError(
            existingError,
            { operation: 'checkInAtControl.fetchExisting', context: { controlId: control.id } },
            'Failed to record check-in'
          )
        }
        row = existing as typeof row
        alreadyExisted = true
      } else {
        return handleSupabaseError(
          insertError,
          { operation: 'checkInAtControl', context: { controlId: control.id } },
          'Failed to record check-in'
        )
      }
    }

    if (!row) {
      return { success: false, error: 'Failed to record check-in' }
    }

    const window = computeControlWindow(eventStart, control.distance_km, event.distance_km)

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
    })
  } catch (error) {
    return handleActionError(error, { operation: 'checkInAtControl' }, 'Failed to record check-in')
  }
}
