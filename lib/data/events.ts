import { supabase } from '@/lib/supabase'
import type { Event } from '@/components/event-card'

export interface ChapterInfo {
  slug: string
  name: string
  description: string
  coverImage: string
}

// URL slug to database slug mapping
const slugMap: Record<string, string> = {
  'toronto': 'toronto',
  'ottawa': 'ottawa',
  'simcoe-muskoka': 'simcoe',
  'huron': 'huron',
}

// Chapter metadata (keyed by URL slug)
const chapterMeta: Record<string, Omit<ChapterInfo, 'slug'> & { dbSlug: string }> = {
  toronto: {
    name: 'Toronto',
    description: 'Brevets and populaires through the Greater Toronto Area, Niagara Peninsula, and the rolling hills beyond.',
    coverImage: '/toronto.jpg',
    dbSlug: 'toronto',
  },
  ottawa: {
    name: 'Ottawa',
    description: 'Explore the scenic routes of Eastern Ontario, from the Ottawa Valley to the St. Lawrence.',
    coverImage: '/ottawa.jpg',
    dbSlug: 'ottawa',
  },
  'simcoe-muskoka': {
    name: 'Simcoe-Muskoka',
    description: 'Brevets and populaires through the lakes and forests of Muskoka, Georgian Bay, and the Kawarthas.',
    coverImage: '/simcoe.jpg',
    dbSlug: 'simcoe',
  },
  huron: {
    name: 'Huron',
    description: 'Discover the shores of Lake Huron and the rolling farmland of Southwestern Ontario.',
    coverImage: '/huron.jpg',
    dbSlug: 'huron',
  },
}

// Map database event_type to display type
function formatEventType(eventType: string): Event['type'] {
  const typeMap: Record<string, Event['type']> = {
    brevet: 'Brevet',
    populaire: 'Populaire',
    fleche: 'Fleche',
    permanent: 'Permanent',
  }
  return typeMap[eventType] || 'Brevet'
}

export function getChapterInfo(slug: string): ChapterInfo | null {
  const meta = chapterMeta[slug]
  if (!meta) return null
  return { slug, ...meta }
}

export function getAllChapterSlugs(): string[] {
  return Object.keys(chapterMeta)
}

export async function getEventsByChapter(urlSlug: string): Promise<Event[]> {
  // Map URL slug to database slug
  const dbSlug = chapterMeta[urlSlug]?.dbSlug
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

  // Fetch events for this chapter, ordered by date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error: eventsError } = await (supabase.from('events') as any)
    .select('*')
    .eq('chapter_id', chapter.id)
    .eq('status', 'scheduled')
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
    startLocation: event.start_location || 'TBD',
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
  rwgpsId: string | null
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
      chapters (name),
      routes (rwgps_id)
    `)
    .eq('slug', slug)
    .single()

  if (error || !event) {
    console.error('Error fetching event:', error)
    return null
  }

  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    date: event.event_date,
    startTime: event.start_time || '08:00',
    startLocation: event.start_location || 'TBD',
    distance: event.distance_km,
    type: formatEventType(event.event_type),
    chapterName: event.chapters?.name || '',
    rwgpsId: event.routes?.rwgps_id || null,
  }
}
