import { supabase } from '@/lib/supabase'
import {
  getResultsChapterInfo,
  getAllResultsChapterSlugs,
  getDbSlug,
  getResultsDescription,
  getUrlSlugFromDbSlug,
  type ChapterInfo,
} from '@/lib/chapter-config'

export interface RiderResult {
  name: string
  slug: string
  time: string | 'DNF' | 'DNS' | 'OTL'
}

export interface EventResult {
  date: string
  name: string
  distance: string
  riders: RiderResult[]
}

// Re-export ChapterMeta as alias for backwards compatibility
export type ChapterMeta = ChapterInfo

export function getChapterMeta(urlSlug: string): ChapterMeta | null {
  const info = getResultsChapterInfo(urlSlug)
  if (!info) return null
  // Return with results-specific description
  return {
    ...info,
    description: getResultsDescription(urlSlug),
  }
}

export function getAllChapterSlugs(): string[] {
  return getAllResultsChapterSlugs()
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
  if (!getResultsChapterInfo(urlSlug)) return []
  const dbSlug = getDbSlug(urlSlug)

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
  rider_slug: string
  first_name: string
  last_name: string
}

export async function getChapterResults(urlSlug: string, year: number): Promise<EventResult[]> {
  if (!getResultsChapterInfo(urlSlug)) return []
  const dbSlug = getDbSlug(urlSlug)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let eventsQuery: any

  // Collection-based query (e.g., granite-anvil)
  if (dbSlug === null) {
    eventsQuery = (supabase.from('events') as any)
      .select(`
        id, name, event_date, distance_km,
        public_results (
          finish_time, status, team_name, rider_slug, first_name, last_name
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
          finish_time, status, team_name, rider_slug, first_name, last_name
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
      const slug = result.rider_slug
      const statusStr = formatStatus(result.status)
      // Show status (DNF/DNS/OTL/DQ) if not finished, otherwise show finish time
      const time = statusStr ?? formatFinishTime(result.finish_time) ?? ''

      return { name, slug, time }
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

export interface RiderInfo {
  slug: string
  firstName: string
  lastName: string
}

export interface RiderEventResult {
  date: string
  eventName: string
  distanceKm: number
  time: string | null
  status: string
  note: string | null
  chapterSlug: string | null
}

export interface RiderYearResults {
  year: number
  completedCount: number
  totalDistanceKm: number
  results: RiderEventResult[]
}

export async function getRiderBySlug(slug: string): Promise<RiderInfo | null> {
  // Use public_riders view (riders table is restricted to protect emails)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('public_riders') as any)
    .select('slug, first_name, last_name')
    .eq('slug', slug)
    .single()

  if (error || !data) return null

  return {
    slug: data.slug,
    firstName: data.first_name,
    lastName: data.last_name,
  }
}

export async function getRiderResults(slug: string): Promise<RiderYearResults[]> {
  // Get rider ID from slug (use public_riders view)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rider } = await (supabase.from('public_riders') as any)
    .select('id')
    .eq('slug', slug)
    .single()

  if (!rider) return []

  // Get all results for this rider with event info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results, error } = await (supabase.from('results') as any)
    .select(`
      finish_time,
      status,
      note,
      season,
      events (
        name,
        event_date,
        distance_km,
        chapters (
          slug
        )
      )
    `)
    .eq('rider_id', rider.id)
    .order('season', { ascending: false })

  if (error || !results) return []

  // Group by year
  const yearMap = new Map<number, RiderEventResult[]>()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const result of results as any[]) {
    const year = result.season
    const event = result.events

    if (!event) continue

    // Get chapter URL slug from the database chapter slug
    const dbChapterSlug = event.chapters?.slug
    const chapterSlug = dbChapterSlug ? getUrlSlugFromDbSlug(dbChapterSlug) : null

    const eventResult: RiderEventResult = {
      date: event.event_date,
      eventName: event.name,
      distanceKm: event.distance_km,
      time: formatFinishTime(result.finish_time),
      status: result.status,
      note: result.note,
      chapterSlug,
    }

    if (!yearMap.has(year)) {
      yearMap.set(year, [])
    }
    yearMap.get(year)!.push(eventResult)
  }

  // Convert to array, sort each year's results by date ascending
  const yearResults: RiderYearResults[] = []

  for (const [year, events] of yearMap) {
    // Sort by date ascending within year
    events.sort((a, b) => a.date.localeCompare(b.date))

    // Calculate stats (only count finished rides)
    const completedCount = events.filter(e => e.status === 'finished').length
    const totalDistanceKm = events
      .filter(e => e.status === 'finished')
      .reduce((sum, e) => sum + e.distanceKm, 0)

    yearResults.push({
      year,
      completedCount,
      totalDistanceKm,
      results: events,
    })
  }

  // Sort years descending (most recent first)
  yearResults.sort((a, b) => b.year - a.year)

  return yearResults
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
