import { supabase } from '@/lib/supabase'
import { formatEventType } from '@/lib/utils'
import type { Event } from '@/components/event-card'
import {
  getChapterInfo,
  getAllChapterSlugs,
  getDbSlug,
  getUrlSlugFromDbSlug,
  type ChapterInfo,
} from '@/lib/chapter-config'

// Re-export for convenience
export { getChapterInfo, getAllChapterSlugs, type ChapterInfo }

export async function getEventsByChapter(urlSlug: string): Promise<Event[]> {
  // Map URL slug to database slug
  const dbSlug = getDbSlug(urlSlug)
  if (!dbSlug) return []

  // First get the chapter ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chapter, error: chapterError } = await (supabase.from('chapters') as any)
    .select('id')
    .eq('slug', dbSlug)
    .single()

  if (chapterError || !chapter) {
    console.error('Error fetching chapter:', chapterError)
    return []
  }

  // Fetch upcoming events for this chapter, ordered by date
  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error: eventsError } = await (supabase.from('events') as any)
    .select('*')
    .eq('chapter_id', chapter.id)
    .eq('status', 'scheduled')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (eventsError) {
    console.error('Error fetching events:', eventsError)
    return []
  }

  // Transform to Event type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (events as any[]).map((event: any) => ({
    slug: event.slug,
    date: event.event_date,
    name: event.name,
    type: formatEventType(event.event_type),
    distance: event.distance_km.toString(),
    startLocation: event.start_location || '',
    startTime: event.start_time || '08:00',
  }))
}

export async function getPermanentEvents(): Promise<Event[]> {
  // Fetch upcoming permanent events, ordered by date
  const today = new Date().toISOString().split('T')[0]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (supabase.from('events') as any)
    .select('*')
    .eq('event_type', 'permanent')
    .eq('status', 'scheduled')
    .gte('event_date', today)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('Error fetching permanent events:', error)
    return []
  }

  // Transform to Event type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (events as any[]).map((event: any) => ({
    slug: event.slug,
    date: event.event_date,
    name: event.name,
    type: formatEventType(event.event_type),
    distance: event.distance_km.toString(),
    startLocation: event.start_location || '',
    startTime: event.start_time || '08:00',
  }))
}

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
  rwgpsId: string | null
  routeSlug: string | null
  cueSheetUrl: string | null
}

export interface RegisteredRider {
  name: string
}

export async function getRegisteredRiders(eventId: string): Promise<RegisteredRider[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: riders, error } = await (supabase as any)
    .rpc('get_registered_riders', { p_event_id: eventId })

  if (error) {
    console.error('Error fetching registered riders:', error)
    return []
  }

  return (riders || []).map((rider: { first_name: string; last_name: string; share_registration: boolean }) => {
    if (!rider.share_registration) {
      return { name: 'Anonymous' }
    }
    const firstName = rider.first_name || ''
    const lastInitial = rider.last_name ? `${rider.last_name.charAt(0)}.` : ''
    return {
      name: `${firstName} ${lastInitial}`.trim()
    }
  })
}

export async function getAllEventSlugs(): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (supabase.from('events') as any)
    .select('slug')
    .eq('status', 'scheduled')

  if (error) {
    console.error('Error fetching event slugs:', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (events as any[]).map((e: any) => e.slug)
}

export async function getEventBySlug(slug: string): Promise<EventDetails | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event, error } = await (supabase.from('events') as any)
    .select(`
      id,
      slug,
      name,
      event_date,
      start_time,
      start_location,
      distance_km,
      event_type,
      chapters (name, slug),
      routes (slug, rwgps_id, cue_sheet_url)
    `)
    .eq('slug', slug)
    .single()

  if (error || !event) {
    console.error('Error fetching event:', error)
    return null
  }

  const dbChapterSlug = event.chapters?.slug
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    date: event.event_date,
    startTime: event.start_time || '08:00',
    startLocation: event.start_location || '',
    distance: event.distance_km,
    type: formatEventType(event.event_type),
    chapterName: event.chapters?.name || '',
    chapterSlug: dbChapterSlug ? getUrlSlugFromDbSlug(dbChapterSlug) : '',
    rwgpsId: event.routes?.rwgps_id || null,
    routeSlug: event.routes?.slug || null,
    cueSheetUrl: event.routes?.cue_sheet_url || null,
  }
}
