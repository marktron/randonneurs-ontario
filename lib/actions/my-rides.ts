'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { handleSupabaseError } from '@/lib/errors'
import { emailIlikePattern } from '@/lib/utils/validation'
import { getAccount } from '@/lib/auth/get-rider'
import type { ActionResult } from '@/types/actions'

export interface MyUpcomingRide {
  slug: string
  name: string
  date: string
  distance: number
  startTime: string
  startLocation: string
  chapterName: string
}

async function fetchUpcomingRidesForRider(
  riderId: string
): Promise<ActionResult<MyUpcomingRide[]>> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().split('T')[0]

  const { data: registrations, error } = await supabase
    .from('registrations')
    .select(
      `
      events (
        slug, name, event_date, distance_km, start_time, start_location, status,
        chapters ( name )
      )
    `
    )
    .eq('rider_id', riderId)
    .eq('status', 'registered')

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'getMyUpcomingRides' },
      'Failed to fetch upcoming rides'
    )
  }

  const upcomingRides: MyUpcomingRide[] = []
  for (const reg of registrations || []) {
    const event = reg.events as {
      slug: string
      name: string
      event_date: string
      distance_km: number
      start_time: string | null
      start_location: string | null
      status: string
      chapters: { name: string } | null
    } | null
    if (event && event.status === 'scheduled' && event.event_date >= today) {
      upcomingRides.push({
        slug: event.slug,
        name: event.name,
        date: event.event_date,
        distance: event.distance_km,
        startTime: event.start_time || '08:00',
        startLocation: event.start_location || '',
        chapterName: event.chapters?.name || '',
      })
    }
  }
  upcomingRides.sort((a, b) => a.date.localeCompare(b.date))
  return { success: true, data: upcomingRides }
}

/**
 * Get upcoming registered rides for a rider by email (anonymous homepage widget).
 * Returns [] for unknown emails — no enumeration possible.
 */
export async function getMyUpcomingRides(email: string): Promise<ActionResult<MyUpcomingRide[]>> {
  const normalizedEmail = email?.toLowerCase().trim()
  if (!normalizedEmail) return { success: true, data: [] }

  const { data: rider, error: riderError } = await getSupabaseAdmin()
    .from('riders')
    .select('id')
    .ilike('email', emailIlikePattern(normalizedEmail))
    .maybeSingle()

  if (riderError || !rider) return { success: true, data: [] }
  return fetchUpcomingRidesForRider(rider.id)
}

/**
 * Upcoming rides for the signed-in account. `signedIn: false` means the
 * caller should fall back to the localStorage email.
 */
export async function getAccountUpcomingRides(): Promise<
  ActionResult<{ signedIn: boolean; firstName: string; rides: MyUpcomingRide[] }>
> {
  const account = await getAccount()
  if (!account) return { success: true, data: { signedIn: false, firstName: '', rides: [] } }
  if (!account.rider) return { success: true, data: { signedIn: true, firstName: '', rides: [] } }

  const result = await fetchUpcomingRidesForRider(account.rider.id)
  if (!result.success) return { success: false, error: result.error }
  return {
    success: true,
    data: { signedIn: true, firstName: account.rider.first_name, rides: result.data ?? [] },
  }
}
