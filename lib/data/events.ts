/**
 * Event Data Fetching Module
 *
 * This module contains all READ operations for events. Functions here
 * fetch data from Supabase and transform it for use in React components.
 *
 * KEY CONCEPTS:
 * - All functions use the public Supabase client (respects RLS)
 * - Results are automatically cached by Next.js (server components)
 * - Functions return empty arrays/null on errors (graceful degradation)
 *
 * SLUG MAPPING:
 * URL slugs (user-facing) may differ from database slugs. For example:
 * - URL: "simcoe-muskoka" → DB: "simcoe"
 * Use getDbSlug() and getUrlSlugFromDbSlug() for conversions.
 *
 * @see lib/chapter-config.ts for chapter slug mappings
 * @see docs/DATA_LAYER.md for data layer documentation
 */
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { formatEventType } from '@/lib/utils'
import { handleDataError } from '@/lib/errors'
import type { Event } from '@/components/event-card'
import {
  getChapterInfo,
  getAllChapterSlugs,
  getDbSlug,
  getUrlSlugFromDbSlug,
  type ChapterInfo,
} from '@/lib/chapter-config'
import type {
  ChapterId,
  EventWithRegistrationCount,
  EventWithRelations,
  EventSlug,
  GetRegisteredRidersResult,
} from '@/types/queries'

// Re-export chapter utilities for convenience (avoids extra imports)
export { getChapterInfo, getAllChapterSlugs, type ChapterInfo }

// ============================================================================
// EVENT QUERIES
// ============================================================================

/**
 * Get upcoming events for a specific chapter.
 * Returns events that are scheduled and have a date >= today.
 *
 * @param urlSlug - The URL slug (e.g., "toronto", "simcoe-muskoka")
 * @returns Array of events, sorted by date and time
 *
 * @example
 * const events = await getEventsByChapter('toronto')
 * // Returns upcoming Toronto chapter events
 */
export async function getEventsByChapter(urlSlug: string): Promise<Event[]> {
  return unstable_cache(
    async () => {
      // Map URL slug to database slug
      const dbSlug = getDbSlug(urlSlug)
      if (!dbSlug) return []

      // Fetch upcoming events for this chapter using a join, ordered by date
      const today = new Date().toISOString().split('T')[0]
      const { data: events, error: eventsError } = await getSupabase()
        .from('events')
        .select('*, registrations(count), chapters!inner(slug)')
        .eq('chapters.slug', dbSlug)
        .eq('status', 'scheduled')
        .neq('event_type', 'permanent')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('distance_km', { ascending: false })

      if (eventsError) {
        return handleDataError(
          eventsError,
          { operation: 'getEventsByChapter', context: { urlSlug } },
          []
        )
      }

      // Transform to Event type
      return (events as EventWithRegistrationCount[]).map((event) => ({
        slug: event.slug,
        date: event.event_date,
        name: event.name,
        type: formatEventType(event.event_type),
        distance: event.distance_km.toString(),
        startLocation: event.start_location || '',
        startTime: event.start_time || '08:00',
        registeredCount: event.registrations?.[0]?.count ?? 0,
      }))
    },
    [`events-by-chapter-${urlSlug}`],
    {
      tags: ['events', `chapter-${urlSlug}`],
    }
  )()
}

/**
 * Get all upcoming permanent ride events.
 * Permanent rides are self-scheduled year-round events.
 *
 * @returns Array of permanent events, sorted by date
 */
export async function getPermanentEvents(): Promise<Event[]> {
  return unstable_cache(
    async () => {
      // Fetch upcoming permanent events, ordered by date
      const today = new Date().toISOString().split('T')[0]
      const { data: events, error } = await getSupabase()
        .from('events')
        .select('*, registrations(count)')
        .eq('event_type', 'permanent')
        .eq('status', 'scheduled')
        .gte('event_date', today)
        .order('event_date', { ascending: true })
        .order('distance_km', { ascending: false })

      if (error) {
        return handleDataError(
          error,
          { operation: 'getPermanentEvents' },
          []
        )
      }

      // Transform to Event type
      return (events as EventWithRegistrationCount[]).map((event) => ({
        slug: event.slug,
        date: event.event_date,
        name: event.name,
        type: formatEventType(event.event_type),
        distance: event.distance_km.toString(),
        startLocation: event.start_location || '',
        startTime: event.start_time || '08:00',
        registeredCount: event.registrations?.[0]?.count ?? 0,
      }))
    },
    ['permanent-events'],
    {
      tags: ['events', 'permanents'],
    }
  )()
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Detailed event information for the registration page.
 * Includes related data (chapter, route) that isn't in the basic Event type.
 */
export interface EventDetails {
  id: string
  slug: string
  name: string
  date: string
  startTime: string
  startLocation: string
  distance: number
  type: 'Brevet' | 'Populaire' | 'Fleche' | 'Permanent'
  chapterName: string
  chapterSlug: string
  rwgpsId: string | null      // RideWithGPS route ID for map embed
  routeSlug: string | null    // For linking to route details page
  cueSheetUrl: string | null  // PDF cue sheet download URL
  description: string | null  // Optional markdown event description
  imageUrl: string | null     // Optional event image URL
}

/**
 * Registered rider info for display on event pages.
 * Privacy-respecting: only shows first name and last initial.
 */
export interface RegisteredRider {
  name: string  // "John D." or "Anonymous" if share_registration is false
}

// ============================================================================
// REGISTRATION QUERIES
// ============================================================================

/**
 * Get the list of registered riders for an event.
 * Respects the share_registration preference - riders who opted out
 * are shown as "Anonymous".
 *
 * Uses an RPC function to handle the privacy logic server-side.
 *
 * @param eventId - The UUID of the event
 * @returns Array of rider display names
 */
export async function getRegisteredRiders(eventId: string): Promise<RegisteredRider[]> {
  return unstable_cache(
    async () => {
      const { data: riders, error } = await getSupabase()
        .rpc('get_registered_riders', { p_event_id: eventId })

      if (error) {
        console.error('Error fetching registered riders:', error)
        return []
      }

      return (riders || []).map((rider: GetRegisteredRidersResult) => {
        if (!rider.share_registration) {
          return { name: 'Anonymous' }
        }
        const firstName = rider.first_name || ''
        const lastInitial = rider.last_name ? `${rider.last_name.charAt(0)}.` : ''
        return {
          name: `${firstName} ${lastInitial}`.trim()
        }
      })
    },
    [`registered-riders-${eventId}`],
    {
      tags: ['registrations', `event-${eventId}`],
    }
  )()
}

/**
 * Get all event slugs for static page generation.
 * Used by Next.js generateStaticParams() to pre-render event pages.
 *
 * @returns Array of event slug strings
 */
export async function getAllEventSlugs(): Promise<string[]> {
  return unstable_cache(
    async () => {
      const { data: events, error } = await getSupabase()
        .from('events')
        .select('slug')
        .eq('status', 'scheduled')

      if (error) {
        console.error('Error fetching event slugs:', error)
        return []
      }

      return (events as EventSlug[]).map((e) => e.slug)
    },
    ['all-event-slugs'],
    {
      tags: ['events', 'slugs'],
    }
  )()
}

/**
 * Get detailed event information by its URL slug.
 * Includes related chapter and route data for the registration page.
 *
 * @param slug - The event's URL slug (e.g., "spring-200-2025")
 * @returns Event details or null if not found
 *
 * @example
 * const event = await getEventBySlug('spring-200-2025')
 * if (event) {
 *   console.log(event.name, event.distance, event.chapterName)
 * }
 */
export async function getEventBySlug(slug: string): Promise<EventDetails | null> {
  return unstable_cache(
    async () => {
      // Fetch event with joined chapter and route data
      const { data: event, error } = await getSupabase()
        .from('events')
        .select(`
          id,
          slug,
          name,
          event_date,
          start_time,
          start_location,
          distance_km,
          event_type,
          description,
          image_url,
          chapters (name, slug),
          routes (slug, rwgps_id, cue_sheet_url)
        `)
        .eq('slug', slug)
        .single()

      if (error || !event) {
        console.error('Error fetching event:', error)
        return null
      }

      // Type assertion for the query result with joins
      const typedEvent = event as EventWithRelations
      const dbChapterSlug = typedEvent.chapters?.slug
      return {
        id: typedEvent.id,
        slug: typedEvent.slug,
        name: typedEvent.name,
        date: typedEvent.event_date,
        startTime: typedEvent.start_time || '08:00',
        startLocation: typedEvent.start_location || '',
        distance: typedEvent.distance_km,
        type: formatEventType(typedEvent.event_type),
        chapterName: typedEvent.chapters?.name || '',
        chapterSlug: dbChapterSlug ? getUrlSlugFromDbSlug(dbChapterSlug) : '',
        rwgpsId: typedEvent.routes?.rwgps_id || null,
        routeSlug: typedEvent.routes?.slug || null,
        cueSheetUrl: typedEvent.routes?.cue_sheet_url || null,
        description: typedEvent.description || null,
        imageUrl: typedEvent.image_url || null,
      }
    },
    [`event-by-slug-${slug}`],
    {
      tags: ['events', `event-${slug}`],
    }
  )()
}
