/**
 * Find or create the event row for a permanent ride.
 *
 * One ride exists per route, date and direction (the slug). The first
 * registrant sets its start time and start point; later registrants must
 * match them, unless nobody is on the ride any more (see
 * `isRideReclaimable`), in which case the new registrant takes it over.
 * Joining compares the stored start only; placing a start on the route
 * (track, loop and place-name checks) happens only when creating a ride or
 * taking one over. Plain module (no `'use server'`), like its siblings here.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logError } from '@/lib/errors'
import {
  permanentStartMismatch,
  sameStartOffset,
  type StoredRideStart,
} from '@/lib/permanent-start'
import type { EventInsert } from '@/types/queries'

export type PermanentEventRow = StoredRideStart & {
  id: string
  created_at: string | null
  updated_at: string | null
}

/** Where the ride starts on the route, as stored on the event. */
export type RideStartFields = Required<
  Pick<EventInsert, 'start_location' | 'start_offset_km' | 'start_lat' | 'start_lng'>
>

/** Places the requested start on the route, or says why it cannot. */
export type ResolveRideStart = () => Promise<
  { ok: true; start: RideStartFields } | { ok: false; error: string }
>

/** The unique key of an `events` row: UNIQUE (chapter_id, slug, event_date). */
export interface PermanentRideKey {
  chapter_id: string
  slug: string
  event_date: string
}

const SELECT = 'id, start_time, start_location, start_offset_km, direction, created_at, updated_at'
const UNIQUE_VIOLATION = '23505'

/** Registration statuses that hold a place on a ride ('cancelled' does not). */
const ACTIVE_REGISTRATION_STATUSES = ['registered', 'incomplete: membership']

/**
 * How long a ride nobody is on stays locked to its start after it was
 * created or last changed (a takeover). The event row is written before the
 * registrant's rider, membership (an external API call) and registration
 * steps, and a rider can pause in the rider-match dialog in between, so a
 * recently written ride may still have its rider in flight.
 */
export const RECLAIM_GRACE_MS = 15 * 60 * 1000

type Result = { ok: true; event: PermanentEventRow } | { ok: false; error: string; cause?: unknown }
type Requested = { startTime: string; offsetKm: number | null }

/**
 * A ride nobody is on can be taken over by a registrant with a different
 * start: no active registrations, and either a rider cancelled after the
 * ride was last written (so that registrant is done) or the grace period
 * has passed since then. A cancellation with no `cancelled_at` falls back
 * to the grace period.
 */
export function isRideReclaimable(
  ride: {
    createdAt: string | null
    updatedAt: string | null
    registrations: { status: string; cancelledAt: string | null }[]
  },
  now: number = Date.now()
): boolean {
  if (ride.registrations.some((r) => ACTIVE_REGISTRATION_STATUSES.includes(r.status))) {
    return false
  }
  const writtenAt = ride.updatedAt ?? ride.createdAt
  const since = writtenAt == null ? null : Date.parse(writtenAt)
  const cancelledSince = ride.registrations.some(
    (r) =>
      r.status === 'cancelled' &&
      r.cancelledAt != null &&
      (since == null || Date.parse(r.cancelledAt) > since)
  )
  if (cancelledSince) return true
  return since != null && now - since > RECLAIM_GRACE_MS
}

/** `isRideReclaimable` for a stored ride. False when the lookup fails. */
export async function isPermanentRideReclaimable(
  ride: Pick<PermanentEventRow, 'id' | 'created_at' | 'updated_at'>
): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('registrations')
    .select('status, cancelled_at')
    .eq('event_id', ride.id)
  if (error || !data) return false
  return isRideReclaimable({
    createdAt: ride.created_at,
    updatedAt: ride.updated_at,
    registrations: (data as { status: string; cancelled_at: string | null }[]).map((r) => ({
      status: r.status,
      cancelledAt: r.cancelled_at,
    })),
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
 * Join the ride, or take it over when nobody is on it. The start is placed
 * on the route only for a takeover. At most one takeover is attempted: if
 * another registrant writes the ride first, the request is compared against
 * theirs.
 */
async function joinOrReclaim(
  ride: PermanentEventRow,
  key: PermanentRideKey,
  requested: Requested,
  resolveStart: ResolveRideStart
): Promise<Result> {
  const mismatch = permanentStartMismatch(ride, requested)
  if (!mismatch) return { ok: true, event: ride }
  if (!(await isPermanentRideReclaimable(ride))) return { ok: false, error: mismatch }

  const resolved = await resolveStart()
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const { start } = resolved
  const placed = { startTime: requested.startTime, offsetKm: start.start_offset_km }
  if (!permanentStartMismatch(ride, placed)) return { ok: true, event: ride }

  // Saved controls were derived for the old start point. Drop them so the
  // admin re-imports, unless someone has already checked in at them.
  let dropControls = false
  if (!sameStartOffset(ride.start_offset_km, placed.offsetKm)) {
    const controls = await savedControlsState(ride.id)
    if (controls === 'ridden') return { ok: false, error: mismatch }
    dropControls = controls === 'unridden'
  }

  // Optimistic guard: only update if the ride is still as we read it.
  let update = getSupabaseAdmin()
    .from('events')
    .update({ start_time: requested.startTime, ...start })
    .eq('id', ride.id)
  update =
    ride.start_time == null
      ? update.is('start_time', null)
      : update.eq('start_time', ride.start_time)
  update =
    ride.start_offset_km == null
      ? update.is('start_offset_km', null)
      : update.eq('start_offset_km', ride.start_offset_km)
  update =
    ride.updated_at == null
      ? update.is('updated_at', null)
      : update.eq('updated_at', ride.updated_at)
  const { data: taken } = await update.select(SELECT).maybeSingle()

  if (!taken) {
    const current = await findPermanentRide(key)
    return current
      ? join(current, placed)
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

/**
 * @param baseEvent the ride to create, without its start point
 * @param requested start time and offset as the registrant sent them
 * @param resolveStart places the start on the route; run at most once, and
 *   only when creating the ride or taking it over
 */
export async function createOrJoinPermanentEvent(
  baseEvent: EventInsert,
  requested: Requested,
  resolveStart: ResolveRideStart
): Promise<Result> {
  let resolving: ReturnType<ResolveRideStart> | null = null
  const resolveOnce: ResolveRideStart = () => (resolving ??= resolveStart())

  const key: PermanentRideKey = {
    chapter_id: baseEvent.chapter_id,
    slug: baseEvent.slug,
    event_date: baseEvent.event_date,
  }
  const existing = await findPermanentRide(key)
  if (existing) return joinOrReclaim(existing, key, requested, resolveOnce)

  const resolved = await resolveOnce()
  if (!resolved.ok) return { ok: false, error: resolved.error }

  const { data: created, error } = await getSupabaseAdmin()
    .from('events')
    .insert({ ...baseEvent, start_time: requested.startTime, ...resolved.start })
    .select(SELECT)
    .single()

  if (created) return { ok: true, event: created as PermanentEventRow }

  // Another rider created the same ride between our lookup and insert.
  if (error?.code === UNIQUE_VIOLATION) {
    const winner = await findPermanentRide(key)
    if (winner) return joinOrReclaim(winner, key, requested, resolveOnce)
  }
  return { ok: false, error: 'Failed to create permanent ride event', cause: error }
}
