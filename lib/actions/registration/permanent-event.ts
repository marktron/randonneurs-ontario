/**
 * Find or create the event row for a permanent ride.
 *
 * One ride exists per route, date and direction (the slug). The first
 * registrant sets its start time and start point; later registrants must
 * match them, unless nobody is on the ride any more (see
 * `isRideReclaimable`), in which case the new registrant takes it over.
 * Plain module (no `'use server'`), like its siblings here.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logError } from '@/lib/errors'
import {
  permanentStartMismatch,
  sameStartOffset,
  type StoredRideStart,
} from '@/lib/permanent-start'
import type { EventInsert } from '@/types/queries'

export type PermanentEventRow = StoredRideStart & { id: string; created_at: string | null }

/** The unique key of an `events` row: UNIQUE (chapter_id, slug, event_date). */
export interface PermanentRideKey {
  chapter_id: string
  slug: string
  event_date: string
}

const SELECT = 'id, start_time, start_location, start_offset_km, direction, created_at'
const UNIQUE_VIOLATION = '23505'

/** Registration statuses that hold a place on a ride ('cancelled' does not). */
const ACTIVE_REGISTRATION_STATUSES = ['registered', 'incomplete: membership']

/**
 * How long a ride with no registrations at all stays locked to its start.
 * The event row is created before the first registrant's rider, membership
 * (an external API call) and registration steps, so a newer ride with no
 * registrations may still have its first rider in flight.
 */
export const RECLAIM_GRACE_MS = 15 * 60 * 1000

type Result = { ok: true; event: PermanentEventRow } | { ok: false; error: string; cause?: unknown }
type Requested = { startTime: string; offsetKm: number | null }

/**
 * A ride nobody is on can be taken over by a registrant with a different
 * start: no active registrations, and either someone cancelled (so the
 * first registration finished) or the ride is past the grace period.
 */
export function isRideReclaimable(
  ride: { createdAt: string | null; statuses: string[] },
  now: number = Date.now()
): boolean {
  if (ride.statuses.some((s) => ACTIVE_REGISTRATION_STATUSES.includes(s))) return false
  if (ride.statuses.includes('cancelled')) return true
  return ride.createdAt != null && now - Date.parse(ride.createdAt) > RECLAIM_GRACE_MS
}

/** `isRideReclaimable` for a stored ride. False when the lookup fails. */
export async function isPermanentRideReclaimable(
  ride: Pick<PermanentEventRow, 'id' | 'created_at'>
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('registrations')
    .select('status')
    .eq('event_id', ride.id)
  if (error || !data) return false
  return isRideReclaimable({
    createdAt: ride.created_at,
    statuses: (data as { status: string }[]).map((r) => r.status),
  })
}

export async function findPermanentRide(key: PermanentRideKey): Promise<PermanentEventRow | null> {
  const { data } = await getSupabaseAdmin()
    .from('events')
    .select(SELECT)
    .eq('chapter_id', key.chapter_id)
    .eq('slug', key.slug)
    .eq('event_date', key.event_date)
    .maybeSingle()
  return (data as PermanentEventRow | null) ?? null
}

function join(event: PermanentEventRow, requested: Requested): Result {
  const mismatch = permanentStartMismatch(event, requested)
  return mismatch ? { ok: false, error: mismatch } : { ok: true, event }
}

/**
 * State of the ride's saved controls: none, saved but nobody has checked in
 * at them, or ridden (some check-in, or the lookup failed).
 */
async function savedControlsState(eventId: string): Promise<'none' | 'unridden' | 'ridden'> {
  const supabase = getSupabaseAdmin()
  const { data: controls, error } = await supabase
    .from('event_controls')
    .select('id')
    .eq('event_id', eventId)
  if (error || !controls) return 'ridden'
  if (controls.length === 0) return 'none'
  const { count, error: checkinError } = await supabase
    .from('control_checkins')
    .select('id', { count: 'exact', head: true })
    .in(
      'control_id',
      (controls as { id: string }[]).map((c) => c.id)
    )
  if (checkinError || count == null) return 'ridden'
  return count > 0 ? 'ridden' : 'unridden'
}

/**
 * Join the ride, or take it over when nobody is on it. At most one takeover
 * is attempted: if another registrant changes the start first, the request
 * is compared against theirs.
 */
async function joinOrReclaim(
  ride: PermanentEventRow,
  insertEvent: EventInsert,
  key: PermanentRideKey,
  requested: Requested
): Promise<Result> {
  const mismatch = permanentStartMismatch(ride, requested)
  if (!mismatch) return { ok: true, event: ride }
  if (!(await isPermanentRideReclaimable(ride))) return { ok: false, error: mismatch }

  // Saved controls were derived for the old start point. Drop them so the
  // admin re-imports, unless someone has already checked in at them.
  let dropControls = false
  if (!sameStartOffset(ride.start_offset_km, requested.offsetKm)) {
    const controls = await savedControlsState(ride.id)
    if (controls === 'ridden') return { ok: false, error: mismatch }
    dropControls = controls === 'unridden'
  }

  // Optimistic guard: only update if the start is still the one we read.
  let update = getSupabaseAdmin()
    .from('events')
    .update({
      start_time: insertEvent.start_time ?? null,
      start_location: insertEvent.start_location ?? null,
      start_offset_km: insertEvent.start_offset_km ?? null,
      start_lat: insertEvent.start_lat ?? null,
      start_lng: insertEvent.start_lng ?? null,
    })
    .eq('id', ride.id)
  update =
    ride.start_time == null
      ? update.is('start_time', null)
      : update.eq('start_time', ride.start_time)
  update =
    ride.start_offset_km == null
      ? update.is('start_offset_km', null)
      : update.eq('start_offset_km', ride.start_offset_km)
  const { data: taken } = await update.select(SELECT).maybeSingle()

  if (!taken) {
    const current = await findPermanentRide(key)
    return current
      ? join(current, requested)
      : { ok: false, error: 'Failed to create permanent ride event' }
  }

  if (dropControls) {
    const { error } = await getSupabaseAdmin()
      .from('event_controls')
      .delete()
      .eq('event_id', ride.id)
    if (error) {
      logError(error, {
        operation: 'createOrJoinPermanentEvent.dropControls',
        context: { eventId: ride.id, supabaseCode: error.code },
      })
    }
  }
  return { ok: true, event: taken as PermanentEventRow }
}

export async function createOrJoinPermanentEvent(
  insertEvent: EventInsert,
  requested: Requested
): Promise<Result> {
  const key: PermanentRideKey = {
    chapter_id: insertEvent.chapter_id,
    slug: insertEvent.slug,
    event_date: insertEvent.event_date,
  }
  const existing = await findPermanentRide(key)
  if (existing) return joinOrReclaim(existing, insertEvent, key, requested)

  const { data: created, error } = await getSupabaseAdmin()
    .from('events')
    .insert(insertEvent)
    .select(SELECT)
    .single()

  if (created) return { ok: true, event: created as PermanentEventRow }

  // Another rider created the same ride between our lookup and insert.
  if (error?.code === UNIQUE_VIOLATION) {
    const winner = await findPermanentRide(key)
    if (winner) return joinOrReclaim(winner, insertEvent, key, requested)
  }
  return { ok: false, error: 'Failed to create permanent ride event', cause: error }
}
