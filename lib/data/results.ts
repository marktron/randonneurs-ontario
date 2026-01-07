import { supabase } from '@/lib/supabase'

export interface RiderResult {
  name: string
  time: string | 'DNF' | 'DNS' | 'OTL'
}

export interface EventResult {
  date: string
  name: string
  distance: string
  riders: RiderResult[]
}

export interface ChapterMeta {
  name: string
  slug: string
  description: string
  coverImage: string
}

// Chapter metadata with URL slugs
const chapterMeta: Record<string, ChapterMeta> = {
  toronto: {
    name: 'Toronto',
    slug: 'toronto',
    description: 'Results from brevets and populaires in the Greater Toronto Area.',
    coverImage: '/toronto.jpg',
  },
  ottawa: {
    name: 'Ottawa',
    slug: 'ottawa',
    description: 'Results from brevets and populaires in the Ottawa Valley region.',
    coverImage: '/ottawa.jpg',
  },
  'simcoe-muskoka': {
    name: 'Simcoe-Muskoka',
    slug: 'simcoe',
    description: 'Results from brevets and populaires in Simcoe County and Muskoka.',
    coverImage: '/simcoe.jpg',
  },
  huron: {
    name: 'Huron',
    slug: 'huron',
    description: 'Results from brevets and populaires along Lake Huron and Bruce County.',
    coverImage: '/huron.jpg',
  },
  niagara: {
    name: 'Niagara',
    slug: 'niagara',
    description: 'Historical results from the Niagara chapter.',
    coverImage: '/toronto.jpg', // Fallback image
  },
  other: {
    name: 'Other',
    slug: 'other',
    description: 'Results from miscellaneous events.',
    coverImage: '/toronto.jpg',
  },
  permanent: {
    name: 'Permanents',
    slug: 'permanent',
    description: 'Routes ridden outside of the normal Brevet schedule.',
    coverImage: '/toronto.jpg',
  },
  pbp: {
    name: 'Paris-Brest-Paris',
    slug: 'pbp',
    description: 'Ontario randonneurs who have completed Paris-Brest-Paris.',
    coverImage: '/toronto.jpg',
  },
  'granite-anvil': {
    name: 'Granite Anvil',
    slug: 'granite-anvil',
    description: 'Results from the Granite Anvil 1000km+ series.',
    coverImage: '/toronto.jpg',
  },
}

// URL slug to database slug mapping (null means filter by collection instead)
const urlToDbSlug: Record<string, string | null> = {
  'toronto': 'toronto',
  'ottawa': 'ottawa',
  'simcoe-muskoka': 'simcoe',
  'huron': 'huron',
  'niagara': 'niagara',
  'other': 'other',
  'permanent': 'permanent',
  'pbp': 'other', // PBP events are stored in the 'other' chapter
  'granite-anvil': null, // Uses collection field instead of chapter
}

export function getChapterMeta(urlSlug: string): ChapterMeta | null {
  return chapterMeta[urlSlug] || null
}

export function getAllChapterSlugs(): string[] {
  return Object.keys(chapterMeta)
}

// Format interval to HH:MM string
function formatFinishTime(interval: string | null): string {
  if (!interval) return ''

  // Parse PostgreSQL interval format like "10:30:00" or "1 day 02:30:00"
  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (!match) return interval

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + (days * 24)
  const minutes = match[3]

  return `${hours}:${minutes}`
}

// Map database status to display string (returns null for 'finished' to use time instead)
function formatStatus(status: string): string | null {
  const statusMap: Record<string, string> = {
    'dnf': 'DNF',
    'dns': 'DNS',
    'otl': 'OTL',
    'dq': 'DQ',
  }
  if (status === 'finished') return null
  return statusMap[status] || status.toUpperCase()
}

export async function getAvailableYears(urlSlug: string): Promise<number[]> {
  const dbSlug = urlToDbSlug[urlSlug]
  if (!(urlSlug in urlToDbSlug)) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsQuery: any

  // Collection-based query (e.g., granite-anvil)
  if (dbSlug === null) {
    eventsQuery = (supabase.from('events') as any)
      .select('id, season, results(season)')
      .eq('collection', urlSlug)
  } else {
    // Chapter-based query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: chapter } = await (supabase.from('chapters') as any)
      .select('id')
      .eq('slug', dbSlug)
      .single()

    if (!chapter) return []

    eventsQuery = (supabase.from('events') as any)
      .select('id, season, results(season)')
      .eq('chapter_id', chapter.id)

    // Filter for PBP events if requested
    if (urlSlug === 'pbp') {
      eventsQuery = eventsQuery.eq('name', 'Paris-Brest-Paris')
    }
  }

  const { data: events } = await eventsQuery.limit(2000)

  if (!events || events.length === 0) return []

  // Extract unique seasons from:
  // 1. Events with results (historical data)
  // 2. Scheduled events (current/future seasons without results yet)
  const allSeasons = new Set<number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const event of events as any[]) {
    // Add the event's season (for scheduled events without results)
    if (event.season) {
      allSeasons.add(event.season)
    }
    // Add seasons from results
    if (event.results && Array.isArray(event.results)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const result of event.results as any[]) {
        if (result.season) {
          allSeasons.add(result.season)
        }
      }
    }
  }

  // Sort descending
  return [...allSeasons].sort((a, b) => b - a)
}

interface PublicResultRow {
  event_id: string
  finish_time: string | null
  status: string
  team_name: string | null
  first_name: string
  last_name: string
}

export async function getChapterResults(urlSlug: string, year: number): Promise<EventResult[]> {
  const dbSlug = urlToDbSlug[urlSlug]
  if (!(urlSlug in urlToDbSlug)) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsQuery: any

  // Collection-based query (e.g., granite-anvil)
  if (dbSlug === null) {
    eventsQuery = (supabase.from('events') as any)
      .select(`
        id, name, event_date, distance_km,
        public_results (
          finish_time, status, team_name, first_name, last_name
        )
      `)
      .eq('collection', urlSlug)
      .gte('event_date', `${year}-01-01`)
      .lte('event_date', `${year}-12-31`)
  } else {
    // Chapter-based query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: chapter } = await (supabase.from('chapters') as any)
      .select('id')
      .eq('slug', dbSlug)
      .single()

    if (!chapter) return []

    eventsQuery = (supabase.from('events') as any)
      .select(`
        id, name, event_date, distance_km,
        public_results (
          finish_time, status, team_name, first_name, last_name
        )
      `)
      .eq('chapter_id', chapter.id)
      .gte('event_date', `${year}-01-01`)
      .lte('event_date', `${year}-12-31`)

    // Filter for PBP events if requested
    if (urlSlug === 'pbp') {
      eventsQuery = eventsQuery.eq('name', 'Paris-Brest-Paris')
    }
  }

  const { data: events, error: eventsError } = await eventsQuery.order('event_date', { ascending: true })

  if (eventsError || !events) {
    console.error('Error fetching events:', eventsError)
    return []
  }

  // Transform to EventResult format
  const eventResults: EventResult[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const event of events as any[]) {
    const eventResultsList = event.public_results as PublicResultRow[] | null

    // Skip events with no results
    if (!eventResultsList || eventResultsList.length === 0) continue

    const riders: RiderResult[] = eventResultsList.map((result) => {
      const name = `${result.first_name} ${result.last_name}`.trim() || 'Unknown'
      const statusStr = formatStatus(result.status)
      // Show status (DNF/DNS/OTL/DQ) if not finished, otherwise show finish time
      const time = statusStr ?? formatFinishTime(result.finish_time) ?? ''

      return { name, time }
    })

    // Sort riders by last name A→Z
    riders.sort((a, b) => {
      const aLastName = a.name.split(' ').pop() || a.name
      const bLastName = b.name.split(' ').pop() || b.name
      return aLastName.localeCompare(bLastName)
    })

    eventResults.push({
      date: event.event_date,
      name: event.name,
      distance: event.distance_km.toString(),
      riders,
    })
  }

  return eventResults
}

export async function getAllChaptersWithYears(): Promise<Array<{ slug: string; name: string; years: number[] }>> {
  const chapters = getAllChapterSlugs()
  const result: Array<{ slug: string; name: string; years: number[] }> = []

  for (const slug of chapters) {
    const meta = getChapterMeta(slug)
    const years = await getAvailableYears(slug)

    if (meta && years.length > 0) {
      result.push({
        slug,
        name: meta.name,
        years,
      })
    }
  }

  return result
}
