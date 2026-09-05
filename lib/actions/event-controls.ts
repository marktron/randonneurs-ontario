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
import { fetchRwgpsControlsWithCoords, fetchRwgpsCollection } from '@/lib/rwgps'
import { isReversedEvent } from '@/lib/controlPoints'
import { handleActionError, handleSupabaseError, createActionResult } from '@/lib/errors'
import { isValidLatitude, isValidLongitude } from '@/lib/location-diagnostics'
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
  /** RWGPS route id of the collection leg this control belongs to; null = single-route. */
  legRwgpsId: string | null
  /** Display heading for the leg (e.g. "Leg 3: CCE 200 - Gravenhurst"); null = single-route. */
  legName: string | null
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
  legRwgpsId?: string | null // optional so existing callers compile unchanged
  legName?: string | null
}

export interface ImportedControl {
  name: string
  distanceKm: number
  lat: number | null
  lng: number | null
  /** POI description from RWGPS, pre-filled into the control's notes. */
  notes: string | null
  /** RWGPS route id of the collection leg this control came from; null on single-route imports. */
  legRwgpsId: string | null
  /** Display heading for the leg (e.g. "Leg 3: CCE 200 - Gravenhurst"); null on single-route imports. */
  legName: string | null
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
      .select('id, position, name, distance_km, lat, lng, radius_m, notes, leg_rwgps_id, leg_name')
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
      leg_rwgps_id: string | null
      leg_name: string | null
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
        legRwgpsId: row.leg_rwgps_id,
        legName: row.leg_name,
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
      if (hasLat && !isValidLatitude(control.lat)) {
        return { success: false, error: `Invalid latitude for "${control.name}"` }
      }
      if (hasLng && !isValidLongitude(control.lng)) {
        return { success: false, error: `Invalid longitude for "${control.name}"` }
      }
      const hasLegId = control.legRwgpsId != null && control.legRwgpsId !== ''
      const hasLegName = control.legName != null && control.legName.trim() !== ''
      if (hasLegId !== hasLegName) {
        return {
          success: false,
          error: `Control "${control.name}" needs both a leg and a leg name (or neither)`,
        }
      }
    }

    // buildCardLegsFromRows (print page) and groupControlsByLeg (admin form)
    // are both all-or-nothing: a list that mixes leg-tagged and untagged
    // rows silently falls back to the single-route path with wrong per-leg
    // print windows. Enforce "all tagged or none" as a write-time invariant
    // so that state can never be persisted.
    const isLegTagged = (c: EventControlInput) => c.legRwgpsId != null && c.legRwgpsId !== ''
    if (controls.some(isLegTagged) && controls.some((c) => !isLegTagged(c))) {
      return { success: false, error: 'Controls must all belong to route legs or none — not a mix' }
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
    // Group rows by leg (null = the single-route group) in first-appearance
    // order, sort within each leg by distance, then assign positions
    // sequentially across legs — `position` keeps ordering controls globally.
    // For untagged rows this is exactly the old global distance sort.
    const legOrder: (string | null)[] = []
    const rowsByLeg = new Map<string | null, EventControlInput[]>()
    for (const control of controls) {
      const key = control.legRwgpsId || null
      if (!rowsByLeg.has(key)) {
        rowsByLeg.set(key, [])
        legOrder.push(key)
      }
      rowsByLeg.get(key)!.push(control)
    }
    const ordered = legOrder.flatMap((key) =>
      [...rowsByLeg.get(key)!].sort((a, b) => a.distanceKm - b.distanceKm)
    )
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
        leg_rwgps_id: control.legRwgpsId || null,
        leg_name: control.legName?.trim() || null,
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
      actorLabel: admin.name,
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
      legRwgpsId: null,
      legName: null,
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

// ============================================================================
// Collection import (per-leg control cards; see docs/rwgps-collections.md)
// ============================================================================

export interface CollectionLeg {
  /** Member route's RWGPS route id, as text (matches event_controls.leg_rwgps_id). */
  legRwgpsId: string
  name: string
  distanceKm: number
}

/** Load the event's collection reference, or an error result. */
async function getEventCollectionId(
  eventId: string
): Promise<{ collectionId: string } | { error: string }> {
  const supabase = getSupabaseAdmin()
  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, routes (rwgps_collection_id)')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    return { error: 'Event not found' }
  }
  const collectionId = (event as { routes: { rwgps_collection_id: string | null } | null }).routes
    ?.rwgps_collection_id
  if (!collectionId) {
    return { error: "This event's route has no RideWithGPS collection" }
  }
  return { collectionId }
}

/**
 * Member routes ("legs") of the event's RWGPS collection, natural-sorted by
 * name (fetchRwgpsCollection guarantees the order). Drives the leg-selection
 * checkboxes in the Event Controls manager.
 */
export async function getEventCollectionLegs(
  eventId: string
): Promise<ActionResult<CollectionLeg[]>> {
  try {
    await requireAdmin()

    const ref = await getEventCollectionId(eventId)
    if ('error' in ref) {
      return { success: false, error: ref.error }
    }

    const collection = await fetchRwgpsCollection(ref.collectionId)
    if (!collection) {
      return {
        success: false,
        error: 'Failed to load the RWGPS collection. Check RWGPS credentials and try again.',
      }
    }

    return createActionResult(
      collection.routes.map((route) => ({
        legRwgpsId: String(route.id),
        name: route.name,
        distanceKm: Math.round(route.distanceKm * 10) / 10,
      }))
    )
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'getEventCollectionLegs' },
      'Failed to load the RWGPS collection'
    )
  }
}

/**
 * Fetch controls for every selected leg of the event's collection and return
 * them leg-major (collection natural-sort order restricted to the selection),
 * tagged `legRwgpsId` + `legName` (the member route's name verbatim — RWGPS
 * route names already carry the organizer's numbering, e.g.
 * "Leg 3: CCE 200 - Gravenhurst"). All-or-nothing: any leg that fails to
 * fetch or parses zero controls aborts the whole import with a leg-specific
 * message. Nothing is saved here — like the single-route import, the admin
 * reviews and hits Save.
 */
export async function importEventControlsFromRwgpsCollection(
  eventId: string,
  selectedLegIds: string[]
): Promise<ActionResult<ImportedControl[]>> {
  try {
    await requireAdmin()

    if (selectedLegIds.length === 0) {
      return { success: false, error: 'Select at least one leg to import' }
    }

    const ref = await getEventCollectionId(eventId)
    if ('error' in ref) {
      return { success: false, error: ref.error }
    }

    // getEventCollectionLegs (called moments earlier to populate the leg
    // picker) already fetched this same collection URL. Not a double
    // network hit in practice: fetchRwgpsCollection sets
    // `next: { revalidate: 3600 }`, so Next's fetch cache serves this call
    // from cache for the rest of that hour. The only repeated work is this
    // small event-route DB lookup.
    const collection = await fetchRwgpsCollection(ref.collectionId)
    if (!collection) {
      return {
        success: false,
        error: 'Failed to load the RWGPS collection. Check RWGPS credentials and try again.',
      }
    }

    // Selected legs in the collection's natural-sorted order — never the
    // order the ids arrived in.
    const selected = new Set(selectedLegIds)
    const legs = collection.routes.filter((route) => selected.has(String(route.id)))
    if (legs.length !== selected.size) {
      return {
        success: false,
        error: 'Some selected legs are no longer in the collection — reload and try again',
      }
    }

    const controls: ImportedControl[] = []
    for (const leg of legs) {
      const legName = leg.name
      let parsed
      try {
        parsed = await fetchRwgpsControlsWithCoords(String(leg.id))
      } catch (error) {
        // All-or-nothing: surface the leg that failed and write nothing.
        const message = error instanceof Error ? error.message : 'Failed to fetch route'
        return { success: false, error: `${legName} — ${message}` }
      }
      for (const c of parsed) {
        controls.push({
          name: c.name,
          distanceKm: parseFloat(c.distance),
          lat: c.lat,
          lng: c.lng,
          notes: c.notes,
          legRwgpsId: String(leg.id),
          legName,
        })
      }
    }

    return createActionResult(controls)
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'importEventControlsFromRwgpsCollection' },
      'Failed to import controls from the RWGPS collection'
    )
  }
}
