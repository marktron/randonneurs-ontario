import { NextResponse } from 'next/server'
import { createEvents, type EventAttributes } from 'ics'
import { getSupabase } from '@/lib/supabase'
import { getDbSlug, getChapterInfo, getAllChapterSlugs } from '@/lib/chapter-config'
import { formatEventType } from '@/lib/utils'

// Revalidate the calendar feed every hour
export const revalidate = 3600

/**
 * BRM time limits for brevets (in hours).
 * These are the official Audax Club Parisien time limits.
 */
const BRM_TIME_LIMITS: Record<number, number> = {
  200: 13.5,
  300: 20,
  400: 27,
  600: 40,
  1000: 75,
  1200: 90,
}

/**
 * Get event duration in hours.
 * - Brevets 200km+: Use BRM time limits
 * - Fleche: 24 hours
 * - Populaires: Use distance / 20 km/h
 */
function getEventDurationHours(distanceKm: number, eventType: string): number {
  // Fleche is always 24 hours
  if (eventType === 'fleche') {
    return 24
  }

  // For brevets, use BRM time limits if we have an exact match
  if (eventType === 'brevet' && BRM_TIME_LIMITS[distanceKm]) {
    return BRM_TIME_LIMITS[distanceKm]
  }

  // For brevets without exact match, interpolate or use closest
  if (eventType === 'brevet' && distanceKm >= 200) {
    const distances = Object.keys(BRM_TIME_LIMITS).map(Number).sort((a, b) => a - b)

    // Find the bracket this distance falls into
    for (let i = 0; i < distances.length - 1; i++) {
      if (distanceKm >= distances[i] && distanceKm < distances[i + 1]) {
        // Use the time limit for the lower bracket
        return BRM_TIME_LIMITS[distances[i]]
      }
    }

    // If longer than 1200km, extrapolate at ~15 km/h
    if (distanceKm > 1200) {
      return Math.ceil(distanceKm / 15)
    }
  }

  // For populaires and other events, use ~20 km/h average
  return Math.ceil(distanceKm / 20)
}

interface RouteParams {
  params: Promise<{ chapter: string }>
}

/**
 * Generate an iCal feed for a chapter's events.
 *
 * Usage:
 * - /api/calendar/toronto.ics -> Toronto chapter events
 * - /api/calendar/simcoe-muskoka.ics -> Simcoe-Muskoka chapter events
 *
 * Subscribe URL for Google Calendar:
 * https://calendar.google.com/calendar/r?cid=webcal://randonneurs.to/api/calendar/toronto.ics
 */
export async function GET(request: Request, { params }: RouteParams) {
  const { chapter: chapterParam } = await params

  // Strip .ics extension if present
  const chapter = chapterParam.replace(/\.ics$/, '')

  // Validate chapter
  const chapterInfo = getChapterInfo(chapter)
  if (!chapterInfo) {
    return NextResponse.json(
      { error: 'Invalid chapter. Valid chapters: ' + getAllChapterSlugs().join(', ') },
      { status: 404 }
    )
  }

  const dbSlug = getDbSlug(chapter)
  if (!dbSlug) {
    return NextResponse.json(
      { error: 'Chapter not found' },
      { status: 404 }
    )
  }

  // Get chapter ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chapterData, error: chapterError } = await (getSupabase().from('chapters') as any)
    .select('id')
    .eq('slug', dbSlug)
    .single()

  if (chapterError || !chapterData) {
    return NextResponse.json(
      { error: 'Chapter not found in database' },
      { status: 404 }
    )
  }

  // Fetch upcoming events for this chapter
  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error: eventsError } = await (getSupabase().from('events') as any)
    .select('id, slug, name, event_date, start_time, start_location, distance_km, event_type, description')
    .eq('chapter_id', chapterData.id)
    .eq('status', 'scheduled')
    .neq('event_type', 'permanent')
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }

  // Convert events to iCal format
  const icsEvents: EventAttributes[] = (events || []).map((event: {
    id: string
    slug: string
    name: string
    event_date: string
    start_time: string | null
    start_location: string | null
    distance_km: number
    event_type: string
    description: string | null
  }) => {
    // Parse date and time
    const [year, month, day] = event.event_date.split('-').map(Number)
    const [hour, minute] = (event.start_time || '08:00').split(':').map(Number)

    // Calculate duration based on event type and distance
    const durationHours = getEventDurationHours(event.distance_km, event.event_type)

    const eventType = formatEventType(event.event_type)
    const title = `${event.name} (${event.distance_km}km ${eventType})`

    // Build description
    const descriptionParts = [
      `${event.distance_km}km ${eventType}`,
      event.description || '',
      '',
      `Register: https://randonneurs.to/register/${event.slug}`,
      `Details: https://randonneurs.to/event/${event.slug}`,
    ].filter(Boolean)

    return {
      uid: `${event.id}@randonneurs.to`,
      title,
      start: [year, month, day, hour, minute] as [number, number, number, number, number],
      duration: { hours: durationHours },
      location: event.start_location || undefined,
      description: descriptionParts.join('\n'),
      url: `https://randonneurs.to/event/${event.slug}`,
      categories: [eventType, 'Cycling', 'Randonneuring'],
      status: 'CONFIRMED' as const,
      busyStatus: 'BUSY' as const,
      organizer: { name: `Randonneurs Ontario - ${chapterInfo.name}`, email: 'info@randonneurs.to' },
    }
  })

  // Generate iCal content
  const { error: icsError, value: icsContent } = createEvents(icsEvents, {
    calName: `Randonneurs Ontario - ${chapterInfo.name}`,
    productId: '-//Randonneurs Ontario//Calendar//EN',
  })

  if (icsError || !icsContent) {
    console.error('Error generating iCal:', icsError)
    return NextResponse.json(
      { error: 'Failed to generate calendar' },
      { status: 500 }
    )
  }

  // Return iCal file with appropriate headers
  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${chapter}-calendar.ics"`,
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
