'use server'

/**
 * Admin view and corrections for digital brevet card check-ins
 * (see docs/digital-brevet-card.md). Mirrors the results-manager rules:
 * once an event's status is 'submitted', check-ins are frozen.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { logAuditEvent } from '@/lib/audit-log'
import {
  resolveRiderStart,
  computeControlWindow,
  deriveCheckinFlags,
  type CheckinFlags,
} from '@/lib/brevet-card'
import { assertEventMutable } from '@/lib/actions/event-mutability'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type { ControlCheckinInsert } from '@/types/queries'
import type {
  LocationContext,
  LocationFailureReason,
  LocationFailureStage,
} from '@/lib/location-diagnostics'

// ============================================================================
// Types
// ============================================================================

export interface AdminCheckin {
  id: string
  controlId: string
  registrationId: string
  checkedInAt: string
  receivedAt: string
  method: string
  lat: number | null
  lng: number | null
  accuracyM: number | null
  distanceToControlM: number | null
  /** Bounded, privacy-conscious diagnostic recorded when GPS acquisition failed. */
  locationFailureReason: LocationFailureReason | null
  locationFailureStage: LocationFailureStage | null
  locationElapsedMs: number | null
  locationContext: LocationContext | null
  note: string | null
  flags: CheckinFlags
}

export interface AdminCheckinGridRider {
  registrationId: string
  riderId: string
  riderName: string
  /** Capability token for the rider-facing digital card (/card/[token]); null if unset. */
  managementToken: string | null
  /** Approved pre-ride start override, if any (YYYY-MM-DD / HH:MM:SS). */
  preRideDate: string | null
  preRideStartTime: string | null
  checkins: AdminCheckin[]
}

// ============================================================================
// Read: check-in grid for an event
// ============================================================================

export async function getEventCheckinsForAdmin(
  eventId: string
): Promise<ActionResult<AdminCheckinGridRider[]>> {
  try {
    await requireAdmin()
    const supabase = getSupabaseAdmin()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, event_date, start_time, distance_km')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { success: false, error: 'Event not found' }
    }

    const typedEvent = event as {
      id: string
      event_date: string
      start_time: string | null
      distance_km: number
    }

    const [
      { data: controlRows, error: controlsError },
      { data: registrationRows, error: registrationsError },
    ] = await Promise.all([
      supabase
        .from('event_controls')
        .select('id, distance_km, radius_m, leg_name')
        .eq('event_id', eventId),
      supabase
        .from('registrations')
        .select(
          'id, rider_id, management_token, pre_ride_date, pre_ride_start_time, riders (first_name, last_name)'
        )
        .eq('event_id', eventId)
        .eq('status', 'registered')
        .order('registered_at', { ascending: true }),
    ])

    if (controlsError) {
      return handleSupabaseError(
        controlsError,
        { operation: 'getEventCheckinsForAdmin.controls', context: { eventId } },
        'Failed to load controls'
      )
    }
    if (registrationsError) {
      return handleSupabaseError(
        registrationsError,
        { operation: 'getEventCheckinsForAdmin.registrations', context: { eventId } },
        'Failed to load registrations'
      )
    }

    const controls = (controlRows || []) as {
      id: string
      distance_km: number
      radius_m: number
      leg_name: string | null
    }[]
    const registrations = (registrationRows || []) as {
      id: string
      rider_id: string
      management_token: string | null
      pre_ride_date: string | null
      pre_ride_start_time: string | null
      riders: { first_name: string; last_name: string } | null
    }[]

    // Nothing to show without controls or registered riders — skip the
    // check-ins query (and avoid an unbounded/empty `.in()` filter).
    if (controls.length === 0 || registrations.length === 0) {
      return createActionResult(
        registrations.map((reg) => ({
          registrationId: reg.id,
          riderId: reg.rider_id,
          riderName: reg.riders ? `${reg.riders.first_name} ${reg.riders.last_name}` : 'Unknown',
          managementToken: reg.management_token,
          preRideDate: reg.pre_ride_date,
          preRideStartTime: reg.pre_ride_start_time,
          checkins: [],
        }))
      )
    }

    const { data: checkinRows, error: checkinError } = await supabase
      .from('control_checkins')
      .select(
        'id, control_id, registration_id, checked_in_at, received_at, method, lat, lng, accuracy_m, distance_to_control_m, location_failure_reason, location_failure_stage, location_failure_elapsed_ms, location_failure_context, note'
      )
      .in(
        'control_id',
        controls.map((c) => c.id)
      )

    if (checkinError) {
      return handleSupabaseError(
        checkinError,
        { operation: 'getEventCheckinsForAdmin', context: { eventId } },
        'Failed to load check-ins'
      )
    }

    const checkins = (checkinRows || []) as {
      id: string
      control_id: string
      registration_id: string
      checked_in_at: string
      received_at: string
      method: string
      lat: number | null
      lng: number | null
      accuracy_m: number | null
      distance_to_control_m: number | null
      location_failure_reason: LocationFailureReason | null
      location_failure_stage: LocationFailureStage | null
      location_failure_elapsed_ms: number | null
      location_failure_context: LocationContext | null
      note: string | null
    }[]

    const startByRegistration = new Map(
      registrations.map((reg) => [reg.id, resolveRiderStart(typedEvent, reg)])
    )
    const controlById = new Map(controls.map((c) => [c.id, c]))
    const byRegistration = new Map<string, AdminCheckin[]>()

    for (const checkin of checkins) {
      const control = controlById.get(checkin.control_id)
      if (!control) continue
      // Check-ins from registrations outside the grid (e.g. cancelled) have no
      // entry in startByRegistration — the registrations query above only
      // selects `status = 'registered'` rows, so their check-ins are skipped
      // here too.
      const riderStart = startByRegistration.get(checkin.registration_id)
      if (!riderStart) continue
      // Leg-tagged controls have no per-control window (per-leg distances
      // restart at 0) — early/late flags are never derived for them.
      const window =
        control.leg_name !== null
          ? null
          : computeControlWindow(riderStart, control.distance_km, typedEvent.distance_km)
      const entry: AdminCheckin = {
        id: checkin.id,
        controlId: checkin.control_id,
        registrationId: checkin.registration_id,
        checkedInAt: checkin.checked_in_at,
        receivedAt: checkin.received_at,
        method: checkin.method,
        lat: checkin.lat,
        lng: checkin.lng,
        accuracyM: checkin.accuracy_m,
        distanceToControlM: checkin.distance_to_control_m,
        locationFailureReason: checkin.location_failure_reason ?? null,
        locationFailureStage: checkin.location_failure_stage ?? null,
        locationElapsedMs: checkin.location_failure_elapsed_ms ?? null,
        locationContext: checkin.location_failure_context ?? null,
        note: checkin.note,
        flags: deriveCheckinFlags(checkin, control, window),
      }
      const list = byRegistration.get(checkin.registration_id) || []
      list.push(entry)
      byRegistration.set(checkin.registration_id, list)
    }

    return createActionResult(
      registrations.map((reg) => ({
        registrationId: reg.id,
        riderId: reg.rider_id,
        riderName: reg.riders ? `${reg.riders.first_name} ${reg.riders.last_name}` : 'Unknown',
        managementToken: reg.management_token,
        preRideDate: reg.pre_ride_date,
        preRideStartTime: reg.pre_ride_start_time,
        checkins: byRegistration.get(reg.id) || [],
      }))
    )
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'getEventCheckinsForAdmin' },
      'Failed to load check-ins'
    )
  }
}

// ============================================================================
// Write: add/correct/delete (method = 'admin')
// ============================================================================

/**
 * Set (insert or overwrite) a rider's check-in at a control. Admin
 * corrections always record method='admin' and require a note explaining
 * the change.
 */
export async function adminSetCheckin(input: {
  eventId: string
  registrationId: string
  controlId: string
  /** ISO timestamp of the corrected check-in time. */
  checkedInAt: string
  note: string
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    if (!input.note?.trim()) {
      return { success: false, error: 'A note explaining the correction is required' }
    }
    const checkedInAt = new Date(input.checkedInAt || '')
    if (Number.isNaN(checkedInAt.getTime())) {
      return { success: false, error: 'Invalid check-in time' }
    }

    const mutable = await assertEventMutable(input.eventId)
    if (!mutable.ok) {
      return { success: false, error: mutable.error }
    }

    const supabase = getSupabaseAdmin()

    // Verify the control and registration belong to this event.
    const [{ data: control }, { data: registration }] = await Promise.all([
      supabase
        .from('event_controls')
        .select('id, event_id, name')
        .eq('id', input.controlId)
        .single(),
      supabase.from('registrations').select('id, event_id').eq('id', input.registrationId).single(),
    ])

    if (!control || (control as { event_id: string }).event_id !== input.eventId) {
      return { success: false, error: 'Control not found' }
    }
    if (!registration || (registration as { event_id: string }).event_id !== input.eventId) {
      return { success: false, error: 'Registration not found' }
    }

    const { data: existing } = await supabase
      .from('control_checkins')
      .select('id')
      .eq('registration_id', input.registrationId)
      .eq('control_id', input.controlId)
      .maybeSingle()

    if (existing) {
      // Preserve the rider's original coordinates and location-failure
      // diagnostic as evidence. An admin correction changes the adjudicated
      // time/method/note, but should not erase what the phone reported.
      const { error: updateError } = await supabase
        .from('control_checkins')
        .update({
          checked_in_at: checkedInAt.toISOString(),
          method: 'admin',
          note: input.note.trim(),
        })
        .eq('id', (existing as { id: string }).id)
      if (updateError) {
        return handleSupabaseError(
          updateError,
          { operation: 'adminSetCheckin.update', context: { checkinId: existing.id } },
          'Failed to save check-in'
        )
      }
    } else {
      const insertData: ControlCheckinInsert = {
        control_id: input.controlId,
        registration_id: input.registrationId,
        checked_in_at: checkedInAt.toISOString(),
        method: 'admin',
        note: input.note.trim(),
      }
      const { error: insertError } = await supabase.from('control_checkins').insert(insertData)
      if (insertError) {
        return handleSupabaseError(
          insertError,
          { operation: 'adminSetCheckin.insert', context: { controlId: input.controlId } },
          'Failed to save check-in'
        )
      }
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: input.eventId,
      description: `Set brevet card check-in at "${(control as { name: string }).name}" for registration ${input.registrationId}: ${input.note.trim()}`,
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'adminSetCheckin' }, 'Failed to save check-in')
  }
}

export async function adminDeleteCheckin(input: {
  eventId: string
  checkinId: string
  note: string
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    if (!input.note?.trim()) {
      return { success: false, error: 'A note explaining the deletion is required' }
    }

    const mutable = await assertEventMutable(input.eventId)
    if (!mutable.ok) {
      return { success: false, error: mutable.error }
    }

    const supabase = getSupabaseAdmin()

    // Verify the check-in belongs to this event before deleting.
    const { data: checkin } = await supabase
      .from('control_checkins')
      .select('id, control_id, event_controls!inner (event_id, name)')
      .eq('id', input.checkinId)
      .single()

    const typedCheckin = checkin as {
      id: string
      event_controls: { event_id: string; name: string }
    } | null

    if (!typedCheckin || typedCheckin.event_controls.event_id !== input.eventId) {
      return { success: false, error: 'Check-in not found' }
    }

    const { error: deleteError } = await supabase
      .from('control_checkins')
      .delete()
      .eq('id', input.checkinId)

    if (deleteError) {
      return handleSupabaseError(
        deleteError,
        { operation: 'adminDeleteCheckin', context: { checkinId: input.checkinId } },
        'Failed to delete check-in'
      )
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'delete',
      entityType: 'event',
      entityId: input.eventId,
      description: `Deleted brevet card check-in at "${typedCheckin.event_controls.name}": ${input.note.trim()}`,
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'adminDeleteCheckin' },
      'Failed to delete check-in'
    )
  }
}
