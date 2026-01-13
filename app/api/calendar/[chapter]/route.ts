import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createEvents, type EventAttributes } from 'ics'
import { getSupabase } from '@/lib/supabase'
import { getDbSlug, getChapterInfo, getAllChapterSlugs } from '@/lib/chapter-config'
import { formatEventType } from '@/lib/utils'
import { logError } from '@/lib/errors'
import type { ChapterId, EventForCalendar } from '@/types/queries'

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
 * Get event duration as hours and minutes (for valid iCal DURATION format).
 * - Brevets 200km+: Use BRM time limits
 * - Fleche: 24 hours
 * - Populaires: Use distance / 15 km/h
 */
function getEventDuration(distanceKm: number, eventType: string): { hours: number; minutes: number } {
  let totalHours: number

  // Fleche is always 24 hours
  if (eventType === 'fleche') {
    totalHours = 24
  } else if (eventType === 'brevet' && BRM_TIME_LIMITS[distanceKm]) {
    // For brevets, use BRM time limits if we have an exact match
    totalHours = BRM_TIME_LIMITS[distanceKm]
  } else if (eventType === 'brevet' && distanceKm >= 200) {
    // For brevets without exact match, interpolate or use closest
    const distances = Object.keys(BRM_TIME_LIMITS).map(Number).sort((a, b) => a - b)
    totalHours = BRM_TIME_LIMITS[distances[0]] // Default to 200km limit

    for (let i = 0; i < distances.length - 1; i++) {
      if (distanceKm >= distances[i] && distanceKm < distances[i + 1]) {
        totalHours = BRM_TIME_LIMITS[distances[i]]
        break
      }
    }

    // If longer than 1200km, extrapolate at ~15 km/h
    if (distanceKm > 1200) {
      totalHours = Math.ceil(distanceKm / 15)
    }
  } else {
    // For populaires and other events, use ~15 km/h average
    totalHours = Math.ceil(distanceKm / 15)
  }

  // Convert decimal hours to hours and minutes
  const hours = Math.floor(totalHours)
  const minutes = Math.round((totalHours - hours) * 60)

  return { hours, minutes }
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
 * https://calendar.google.com/calendar/r?cid=webcal://[SITE_URL]/api/calendar/toronto.ics
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
  const { data: chapterData, error: chapterError } = await getSupabase()
    .from('chapters')
    .select('id')
    .eq('slug', dbSlug)
    .single()

  if (chapterError || !chapterData) {
    return NextResponse.json(
      { error: 'Chapter not found in database' },
      { status: 404 }
    )
  }

  const typedChapter = chapterData as ChapterId
  const chapterId = typedChapter.id

  // Fetch upcoming events for this chapter (with cache tags)
  const events = await unstable_cache(
    async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data: events, error: eventsError } = await getSupabase()
        .from('events')
        .select('id, slug, name, event_date, start_time, start_location, distance_km, event_type, description')
        .eq('chapter_id', chapterId)
        .eq('status', 'scheduled')
        .neq('event_type', 'permanent')
        .gte('event_date', today)
        .order('event_date', { ascending: true })

      if (eventsError) {
        logError(eventsError, { operation: 'calendar.fetchEvents', context: { chapter: urlSlug } })
        return null
      }

      return events
    },
    [`calendar-events-${chapter}`],
    {
      tags: ['events', `chapter-${chapter}`],
    }
  )()

  if (!events) {
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    )
  }

  // Convert events to iCal format
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
  const siteHostname = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')

  const typedEvents = (events || []) as EventForCalendar[]
  const icsEvents: EventAttributes[] = typedEvents.map((event) => {
    // Parse date and time in Toronto timezone, then convert to UTC
    const [year, month, day] = event.event_date.split('-').map(Number)
    const [hour, minute] = (event.start_time || '08:00').split(':').map(Number)

    // Get the UTC time by using Intl to find Toronto's offset on this date
    const torontoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
      hour12: false,
    })
    // At noon UTC, what hour is it in Toronto?
    const refDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
    const torontoHourAtNoonUTC = parseInt(torontoFormatter.format(refDate), 10)
    const offsetHours = 12 - torontoHourAtNoonUTC // Toronto's offset from UTC

    // Create the actual UTC date for this Toronto local time
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute))

    // Calculate duration based on event type and distance
    const duration = getEventDuration(event.distance_km, event.event_type)

    const eventType = formatEventType(event.event_type)
    const title = `${event.name} (${event.distance_km}km ${eventType})`

    // Build description
    const descriptionParts = [
      `${event.distance_km}km ${eventType}`,
      event.description || '',
      '',
      `Details & Registration: ${siteUrl}/register/${event.slug}`
    ].filter(Boolean)

    return {
      uid: `${event.id}@${siteHostname}`,
      title,
      start: [
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth() + 1,
        utcDate.getUTCDate(),
        utcDate.getUTCHours(),
        utcDate.getUTCMinutes(),
      ] as [number, number, number, number, number],
      startInputType: 'utc' as const,
      startOutputType: 'utc' as const,
      duration,
      location: event.start_location || undefined,
      description: descriptionParts.join('\n'),
      url: `${siteUrl}/event/${event.slug}`,
      categories: [eventType, 'Cycling', 'Randonneuring'],
      status: 'CONFIRMED' as const,
      busyStatus: 'BUSY' as const,
      organizer: { name: `Randonneurs Ontario - ${chapterInfo.name}`, email: `info@${siteHostname}` },
    }
  })

  // Generate iCal content
  const { error: icsError, value: icsContent } = createEvents(icsEvents, {
    calName: `Randonneurs Ontario - ${chapterInfo.name}`,
    productId: '-//Randonneurs Ontario//Calendar//EN',
  })

  if (icsError || !icsContent) {
    logError(icsError || new Error('iCal generation returned no content'), { operation: 'calendar.generateICS', context: { chapter: urlSlug } })
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
