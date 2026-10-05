'use server'

/**
 * Read-only lookups for the permanent registration form: the route's track
 * for the start picker, and whether a ride already exists for a route, date
 * and direction (the first registrant sets the start; see
 * docs/control-cards.md, "Direction and alternate start").
 *
 * Neither is rate limited: the registration limiter is keyed by email, which
 * the form does not have yet. The track is cached per route for a day and
 * the ride lookup is a single indexed read.
 */

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { loadRouteTrack } from '@/lib/data/route-track'
import { permanentEventSlug, toHHMM } from '@/lib/permanent-start'
import type { RouteTrack } from '@/lib/routeTrack'

export type PermanentRouteTrackResult =
  { available: false } | { available: true; track: RouteTrack }

export async function getPermanentRouteTrack(routeId: string): Promise<PermanentRouteTrackResult> {
  if (!routeId) return { available: false }
  const { data } = await getSupabaseAdmin()
    .from('routes')
    .select('id, rwgps_id')
    .eq('id', routeId)
    .eq('is_active', true)
    .maybeSingle()
  const rwgpsId = (data as { rwgps_id: string | null } | null)?.rwgps_id
  if (!rwgpsId) return { available: false }
  const track = await loadRouteTrack(rwgpsId)
  return track ? { available: true, track } : { available: false }
}

export interface ExistingPermanentRide {
  /** HH:MM */
  startTime: string
  startLocation: string | null
  startOffsetKm: number | null
}

export async function getExistingPermanentRide(
  routeId: string,
  eventDate: string,
  direction: 'as_posted' | 'reversed'
): Promise<ExistingPermanentRide | null> {
  if (!routeId || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null
  const supabase = getSupabaseAdmin()
  const { data: route } = await supabase
    .from('routes')
    .select('slug')
    .eq('id', routeId)
    .maybeSingle()
  const routeSlug = (route as { slug: string } | null)?.slug
  if (!routeSlug) return null

  const { data: event } = await supabase
    .from('events')
    .select('start_time, start_location, start_offset_km')
    .eq(
      'slug',
      permanentEventSlug(routeSlug, eventDate, direction === 'reversed' ? 'reversed' : 'as_posted')
    )
    .maybeSingle()
  if (!event) return null

  const row = event as {
    start_time: string | null
    start_location: string | null
    start_offset_km: number | null
  }
  return {
    startTime: toHHMM(row.start_time) ?? '08:00',
    startLocation: row.start_location,
    startOffsetKm: row.start_offset_km == null ? null : Number(row.start_offset_km),
  }
}
