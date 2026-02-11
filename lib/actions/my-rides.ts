'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { handleSupabaseError } from '@/lib/errors'
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

/**
 * Get upcoming registered rides for a rider by email.
 * Returns [] for unknown emails — no enumeration possible.
 */
export async function getMyUpcomingRides(email: string): Promise<ActionResult<MyUpcomingRide[]>> {
  const normalizedEmail = email?.toLowerCase().trim()
  if (!normalizedEmail) {
    return { success: true, data: [] }
  }

  const supabase = getSupabaseAdmin()

  // Find rider by email
  const { data: rider, error: riderError } = await supabase
    .from('riders')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  if (riderError || !rider) {
    // Unknown email — return empty array (no enumeration)
    return { success: true, data: [] }
  }

  const today = new Date().toISOString().split('T')[0]

  // Get registrations for future events
  const { data: registrations, error } = await supabase
    .from('registrations')
    .select(
      `
      events (
        slug,
        name,
        event_date,
        distance_km,
        start_time,
        start_location,
        status,
        chapters (
          name
        )
      )
    `
    )
    .eq('rider_id', rider.id)
    .eq('status', 'registered')

  if (error) {
    return handleSupabaseError(
      error,
      { operation: 'getMyUpcomingRides' },
      'Failed to fetch upcoming rides'
    )
  }

  // Filter to only future scheduled events and transform
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

  // Sort by date ascending
  upcomingRides.sort((a, b) => a.date.localeCompare(b.date))

  return { success: true, data: upcomingRides }
}
