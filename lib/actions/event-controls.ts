'use server'

/**
 * Admin management of per-event controls for the digital brevet card
 * (see docs/digital-brevet-card.md). Controls are copied per event — not
 * attached to routes — because events run routes reversed, organizers
 * adjust controls per running, and permanents self-schedule.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { assertEventMutable } from '@/lib/actions/event-mutability'
import { logAuditEvent } from '@/lib/audit-log'
import { fetchRwgpsControlsWithCoords } from '@/lib/rwgps'
import { isReversedEvent } from '@/lib/controlPoints'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type { EventControlInsert } from '@/types/queries'

// ============================================================================
// Types
// ============================================================================

export interface AdminEventControl {
  id: string
  position: number
  name: string
  distanceKm: number
  lat: number | null
  lng: number | null
  radiusM: number
  notes: string | null
  /** Number of rider check-ins recorded against this control. */
  checkinCount: number
}

/** A control row as edited in the admin form. `id` is absent for new rows. */
export interface EventControlInput {
  id?: string
  name: string
  distanceKm: number
  lat: number | null
  lng: number | null
  radiusM: number
  notes?: string | null
}

export interface ImportedControl {
  name: string
  distanceKm: number
  lat: number | null
  lng: number | null
  /** POI description from RWGPS, pre-filled into the control's notes. */
  notes: string | null
}

// ============================================================================
// Read
// ============================================================================

export async function getEventControlsForAdmin(
  eventId: string
): Promise<ActionResult<AdminEventControl[]>> {
  try {
    await requireAdmin()
    const supabase = getSupabaseAdmin()

    const { data: controls, error } = await supabase
      .from('event_controls')
      .select('id, position, name, distance_km, lat, lng, radius_m, notes')
      .eq('event_id', eventId)
      .order('position', { ascending: true })

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'getEventControlsForAdmin', context: { eventId } },
        'Failed to load controls'
      )
    }

    const rows = (controls || []) as {
      id: string
      position: number
      name: string
      distance_km: number
      lat: number | null
      lng: number | null
      radius_m: number
      notes: string | null
    }[]

    // Check-in counts per control (drives the "this will delete check-ins"
    // warning in the form).
    const counts = new Map<string, number>()
    if (rows.length > 0) {
      const { data: checkins } = await supabase
        .from('control_checkins')
        .select('control_id')
        .in(
          'control_id',
          rows.map((r) => r.id)
        )
      for (const c of (checkins || []) as { control_id: string }[]) {
        counts.set(c.control_id, (counts.get(c.control_id) || 0) + 1)
      }
    }

    return createActionResult(
      rows.map((row) => ({
        id: row.id,
        position: row.position,
        name: row.name,
        distanceKm: row.distance_km,
        lat: row.lat,
        lng: row.lng,
        radiusM: row.radius_m,
        notes: row.notes,
        checkinCount: counts.get(row.id) || 0,
      }))
    )
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'getEventControlsForAdmin' },
      'Failed to load controls'
    )
  }
}

// ============================================================================
// Save (diff-based: update kept rows, insert new, delete removed)
// ============================================================================

export async function saveEventControls(
  eventId: string,
  controls: EventControlInput[]
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()
    const supabase = getSupabaseAdmin()

    // Validate inputs before touching the DB.
    for (const control of controls) {
      if (!control.name?.trim()) {
        return { success: false, error: 'Every control needs a name' }
      }
      if (!Number.isFinite(control.distanceKm) || control.distanceKm < 0) {
        return { success: false, error: `Invalid distance for "${control.name}"` }
      }
      if (!Number.isFinite(control.radiusM) || control.radiusM <= 0) {
        return { success: false, error: `Invalid radius for "${control.name}"` }
      }
      const hasLat = control.lat !== null
      const hasLng = control.lng !== null
      if (hasLat !== hasLng) {
        return {
          success: false,
          error: `Control "${control.name}" needs both latitude and longitude (or neither)`,
        }
      }
      if (hasLat && (control.lat! < -90 || control.lat! > 90)) {
        return { success: false, error: `Invalid latitude for "${control.name}"` }
      }
      if (hasLng && (control.lng! < -180 || control.lng! > 180)) {
        return { success: false, error: `Invalid longitude for "${control.name}"` }
      }
    }

    // Once results are submitted, controls are frozen too: deleting a
    // control cascade-deletes its check-ins (FK ON DELETE CASCADE).
    const mutable = await assertEventMutable(eventId)
    if (!mutable.ok) {
      return { success: false, error: mutable.error }
    }

    // Verify the event exists (and get its name for the audit log).
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { success: false, error: 'Event not found' }
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('event_controls')
      .select('id')
      .eq('event_id', eventId)

    if (existingError) {
      return handleSupabaseError(
        existingError,
        { operation: 'saveEventControls', context: { eventId } },
        'Failed to save controls'
      )
    }

    const existingIds = new Set(((existingRows || []) as { id: string }[]).map((r) => r.id))
    const keptIds = new Set(controls.filter((c) => c.id).map((c) => c.id!))
    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))

    // Sort by distance so position always reflects route order, then split
    // into kept rows (upserted by id) and new rows (inserted without id).
    // Only ids that belong to this event (existingIds) go down the upsert
    // path, so a stray id can never overwrite another event's control.
    const ordered = [...controls].sort((a, b) => a.distanceKm - b.distanceKm)
    const keptRows: EventControlInsert[] = []
    const newRows: EventControlInsert[] = []
    for (const [i, control] of ordered.entries()) {
      const row: EventControlInsert = {
        event_id: eventId,
        position: i + 1,
        name: control.name.trim(),
        distance_km: control.distanceKm,
        lat: control.lat,
        lng: control.lng,
        radius_m: Math.round(control.radiusM),
        notes: control.notes?.trim() || null,
      }
      if (control.id && existingIds.has(control.id)) {
        keptRows.push({ ...row, id: control.id })
      } else {
        newRows.push(row)
      }
    }

    // Deleting a control cascades to its check-ins — the form warns first.
    if (toDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('event_controls')
        .delete()
        .in('id', toDelete)
      if (deleteError) {
        return handleSupabaseError(
          deleteError,
          { operation: 'saveEventControls.delete', context: { eventId } },
          'Failed to save controls'
        )
      }
    }

    // Two-pass position update, one batched statement per pass: shift kept
    // rows to unique negative positions first so the non-deferrable UNIQUE
    // (event_id, position) constraint can't collide while final positions
    // are written (Postgres checks it per row, not per statement).
    if (keptRows.length > 0) {
      const shiftRows = keptRows.map((row, i) => ({ ...row, position: -(i + 1) }))
      const { error: shiftError } = await supabase
        .from('event_controls')
        .upsert(shiftRows, { onConflict: 'id' })
      if (shiftError) {
        return handleSupabaseError(
          shiftError,
          { operation: 'saveEventControls.shift', context: { eventId } },
          'Failed to save controls'
        )
      }

      const { error: updateError } = await supabase
        .from('event_controls')
        .upsert(keptRows, { onConflict: 'id' })
      if (updateError) {
        return handleSupabaseError(
          updateError,
          { operation: 'saveEventControls.update', context: { eventId } },
          'Failed to save controls'
        )
      }
    }

    // New rows go in a separate batched insert: PostgREST requires every row
    // in a statement to share the same columns, and new rows must omit `id`.
    if (newRows.length > 0) {
      const { error: insertError } = await supabase.from('event_controls').insert(newRows)
      if (insertError) {
        return handleSupabaseError(
          insertError,
          { operation: 'saveEventControls.insert', context: { eventId } },
          'Failed to save controls'
        )
      }
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: eventId,
      description: `Saved ${ordered.length} brevet card controls for event: ${(event as { name: string }).name}${toDelete.length > 0 ? ` (removed ${toDelete.length})` : ''}`,
    })

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'saveEventControls' }, 'Failed to save controls')
  }
}

// ============================================================================
// Import from RWGPS (returns parsed controls; nothing is saved until the
// admin reviews and hits Save)
// ============================================================================

export async function importEventControlsFromRwgps(
  eventId: string
): Promise<ActionResult<ImportedControl[]>> {
  try {
    await requireAdmin()
    const supabase = getSupabaseAdmin()

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, name, distance_km, routes (rwgps_id)')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { success: false, error: 'Event not found' }
    }

    const typedEvent = event as {
      id: string
      name: string
      distance_km: number
      routes: { rwgps_id: string | null } | null
    }

    const rwgpsId = typedEvent.routes?.rwgps_id
    if (!rwgpsId) {
      return { success: false, error: "This event's route has no RideWithGPS ID" }
    }

    const parsed = await fetchRwgpsControlsWithCoords(rwgpsId)

    let controls: ImportedControl[] = parsed.map((c) => ({
      name: c.name,
      distanceKm: parseFloat(c.distance),
      lat: c.lat,
      lng: c.lng,
      notes: c.notes,
    }))

    // Reversed permanents ride the route backwards: reverse the order and
    // flip distances, keeping each control's physical coordinates
    // (mirrors reverseControls() in the printed-card flow).
    if (isReversedEvent(typedEvent.name)) {
      controls = [...controls].reverse().map((c) => ({
        ...c,
        distanceKm: Math.round((typedEvent.distance_km - c.distanceKm) * 10) / 10,
      }))
    }

    return createActionResult(controls)
  } catch (error) {
    // fetchRwgpsControlsWithCoords throws user-facing messages worth
    // surfacing verbatim (e.g. "No control points found in the RWGPS
    // route…"). Auth failures still go through the standard handler.
    if (error instanceof Error && error.message && error.message !== 'Unauthorized') {
      return { success: false, error: error.message }
    }
    return handleActionError(
      error,
      { operation: 'importEventControlsFromRwgps' },
      'Failed to import controls from RideWithGPS'
    )
  }
}
