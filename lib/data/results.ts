/**
 * Results Data Fetching Module
 *
 * This module contains all READ operations for results. Functions here
 * fetch data from Supabase and transform it for use in React components.
 *
 * KEY CONCEPTS:
 * - All functions use the public Supabase client (respects RLS)
 * - Request deduplication: Uses React cache() to deduplicate parallel calls
 *   within the same request
 * - Cross-request caching: Uses unstable_cache() for caching across requests
 */
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { formatFinishTime, formatStatus } from '@/lib/utils'
import { handleDataError } from '@/lib/errors'
import {
  getResultsChapterInfo,
  getAllResultsChapterSlugs,
  getDbSlug,
  getResultsDescription,
  getUrlSlugFromDbSlug,
  type ChapterInfo,
} from '@/lib/chapter-config'
import type {
  EventWithSeasonAndResults,
  EventWithPublicResults,
  PublicRider,
  ResultWithEvent,
} from '@/types/queries'

export interface RiderResult {
  name: string
  slug: string | null
  time: string | 'DNF' | 'DNS' | 'OTL'
  isFirstBrevet: boolean
}

export interface EventResult {
  date: string
  name: string
  distance: string
  riders: RiderResult[]
  routeSlug: string | null
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

const getAvailableYearsInner = cache(async (urlSlug: string): Promise<number[]> => {
  if (!getResultsChapterInfo(urlSlug)) return []
  const dbSlug = getDbSlug(urlSlug)

  let events: EventWithSeasonAndResults[] | null = null

  // Collection-based query (e.g., granite-anvil)
  if (dbSlug === null) {
    const { data } = await getSupabase()
      .from('events')
      .select('id, season, results(season)')
      .eq('collection', urlSlug)
      .limit(2000)
    events = data
  } else if (urlSlug === 'permanent') {
    // Permanent results: query by event_type instead of chapter
    const { data } = await getSupabase()
      .from('events')
      .select('id, season, results(season)')
      .eq('event_type', 'permanent')
      .limit(2000)
    events = data
  } else {
    // Chapter-based query using a join
    let query = getSupabase()
      .from('events')
      .select('id, season, results(season), chapters!inner(slug)')
      .eq('chapters.slug', dbSlug)

    // Filter for PBP events if requested
    if (urlSlug === 'pbp') {
      query = query.eq('name', 'Paris-Brest-Paris')
    }

    const { data, error } = await query.limit(2000)
    if (error) {
      console.error('🚨 Error fetching available years:', error)
      return []
    }
    events = data
  }

  if (!events || events.length === 0) return []

  // Extract unique seasons from:
  // 1. Events with results (historical data)
  // 2. Scheduled events (current/future seasons without results yet)
  const allSeasons = new Set<number>()
  for (const event of events) {
    // Add the event's season (for scheduled events without results)
    if (event.season) {
      allSeasons.add(event.season)
    }
    // Add seasons from results
    if (event.results && Array.isArray(event.results)) {
      for (const result of event.results) {
        if (result.season) {
          allSeasons.add(result.season)
        }
      }
    }
  }

  // Sort descending
  return [...allSeasons].sort((a, b) => b - a)
})

export async function getAvailableYears(urlSlug: string): Promise<number[]> {
  return unstable_cache(
    async () => getAvailableYearsInner(urlSlug),
    [`available-years-${urlSlug}`],
    {
      tags: ['results', `chapter-${urlSlug}`],
    }
  )()
}

const getChapterResultsInner = cache(
  async (urlSlug: string, year: number): Promise<EventResult[]> => {
    if (!getResultsChapterInfo(urlSlug)) return []
    const dbSlug = getDbSlug(urlSlug)

    let events: EventWithPublicResults[] | null = null
    let eventsError: Error | null = null

    // Collection-based query (e.g., granite-anvil)
    if (dbSlug === null) {
      const result = await getSupabase()
        .from('events')
        .select(
          `
        id, name, event_date, distance_km,
        routes (slug),
        public_results (
          id, finish_time, status, team_name, rider_slug, first_name, last_name
        )
      `
        )
        .eq('collection', urlSlug)
        .gte('event_date', `${year}-01-01`)
        .lte('event_date', `${year}-12-31`)
        .order('event_date', { ascending: true })
      events = result.data
      eventsError = result.error
    } else if (urlSlug === 'permanent') {
      // Permanent results: query by event_type instead of chapter
      const result = await getSupabase()
        .from('events')
        .select(
          `
        id, name, event_date, distance_km,
        routes (slug),
        public_results (
          id, finish_time, status, team_name, rider_slug, first_name, last_name
        )
      `
        )
        .eq('event_type', 'permanent')
        .gte('event_date', `${year}-01-01`)
        .lte('event_date', `${year}-12-31`)
        .order('event_date', { ascending: true })
      events = result.data
      eventsError = result.error
    } else {
      // Chapter-based query using a join
      let query = getSupabase()
        .from('events')
        .select(
          `
        id, name, event_date, distance_km,
        routes (slug),
        chapters!inner(slug),
        public_results (
          id, finish_time, status, team_name, rider_slug, first_name, last_name
        )
      `
        )
        .eq('chapters.slug', dbSlug)
        .neq('event_type', 'permanent')
        .gte('event_date', `${year}-01-01`)
        .lte('event_date', `${year}-12-31`)

      // Filter for PBP events if requested
      if (urlSlug === 'pbp') {
        query = query.eq('name', 'Paris-Brest-Paris')
      }

      const result = await query.order('event_date', { ascending: true })
      events = result.data
      eventsError = result.error
    }

    if (eventsError || !events) {
      return handleDataError(
        eventsError || new Error('No events returned'),
        { operation: 'getChapterResults', context: { urlSlug, year } },
        []
      )
    }

    // Collect all result IDs to check for First Brevet awards
    const allResultIds: string[] = []
    for (const event of events) {
      if (event.public_results) {
        for (const result of event.public_results) {
          if (result.id) allResultIds.push(result.id)
        }
      }
    }

    // Query for First Brevet awards
    const firstBrevetResultIds = new Set<string>()
    if (allResultIds.length > 0) {
      const { data: awardData } = await getSupabase()
        .from('result_awards')
        .select('result_id, awards!inner(title)')
        .in('result_id', allResultIds)
        .eq('awards.title', 'First Brevet')

      if (awardData) {
        for (const award of awardData) {
          firstBrevetResultIds.add(award.result_id)
        }
      }
    }

    // Transform to EventResult format
    const eventResults: EventResult[] = []

    for (const event of events) {
      const eventResultsList = event.public_results

      // Skip events with no results
      if (!eventResultsList || eventResultsList.length === 0) continue

      const riders: RiderResult[] = eventResultsList.map((result) => {
        const name = `${result.first_name} ${result.last_name}`.trim() || 'Unknown'
        const slug = result.rider_slug
        const statusStr = formatStatus(result.status ?? 'pending')
        // Show status (DNF/DNS/OTL/DQ) if not finished, otherwise show finish time
        const time = statusStr ?? formatFinishTime(result.finish_time as string | null) ?? ''
        const isFirstBrevet = result.id ? firstBrevetResultIds.has(result.id) : false

        return { name, slug, time, isFirstBrevet }
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
        routeSlug: event.routes?.slug ?? null,
      })
    }

    return eventResults
  }
)

export async function getChapterResults(urlSlug: string, year: number): Promise<EventResult[]> {
  return unstable_cache(
    async () => getChapterResultsInner(urlSlug, year),
    [`chapter-results-${urlSlug}-${year}`],
    {
      tags: ['results', `chapter-${urlSlug}`, `year-${year}`],
    }
  )()
}

export interface RiderInfo {
  slug: string
  firstName: string
  lastName: string
}

export interface RiderEventAward {
  title: string
  description: string | null
}

export interface RiderEventResult {
  date: string
  eventName: string
  distanceKm: number
  time: string | null
  status: string | null
  note: string | null
  chapterSlug: string | null
  eventType: string
  awards: RiderEventAward[]
}

export interface RiderYearResults {
  year: number
  completedCount: number
  totalDistanceKm: number
  results: RiderEventResult[]
}

const getRiderBySlugInner = cache(async (slug: string): Promise<RiderInfo | null> => {
  // Use public_riders view (riders table is restricted to protect emails)
  const { data, error } = await getSupabase()
    .from('public_riders')
    .select('slug, first_name, last_name')
    .eq('slug', slug)
    .single()

  if (error || !data) return null

  const typedRider = data as Pick<PublicRider, 'slug' | 'first_name' | 'last_name'>

  return {
    slug: typedRider.slug ?? '',
    firstName: typedRider.first_name ?? '',
    lastName: typedRider.last_name ?? '',
  }
})

export async function getRiderBySlug(slug: string): Promise<RiderInfo | null> {
  return unstable_cache(async () => getRiderBySlugInner(slug), [`rider-by-slug-${slug}`], {
    tags: ['riders', `rider-${slug}`],
  })()
}

const getRiderResultsInner = cache(async (slug: string): Promise<RiderYearResults[]> => {
  // Get rider ID first (using public_riders view for RLS safety)
  // Note: We can't join through views, so we need this lookup first
  const { data: rider, error: riderError } = await getSupabase()
    .from('public_riders')
    .select('id')
    .eq('slug', slug)
    .single()

  if (riderError || !rider || !rider.id) {
    return handleDataError(
      riderError || new Error('Rider not found'),
      { operation: 'getRiderResults', context: { slug } },
      []
    )
  }

  // Get all results for this rider with event info and awards in a single query
  const { data: results, error: resultsError } = await getSupabase()
    .from('results')
    .select(
      `
      finish_time,
      status,
      note,
      season,
      events (
        name,
        event_date,
        distance_km,
        event_type,
        chapters (
          slug
        )
      ),
      result_awards (
        awards (
          title,
          description
        )
      )
    `
    )
    .eq('rider_id', rider.id)
    .order('season', { ascending: false })

  if (resultsError) {
    return handleDataError(
      resultsError,
      { operation: 'getRiderResults.results', context: { riderId: rider.id } },
      []
    )
  }

  if (!results) return []

  // Type for the query result with awards
  type ResultWithAwards = ResultWithEvent & {
    result_awards: Array<{
      awards: { title: string; description: string | null } | null
    }> | null
  }

  // Group by year
  const yearMap = new Map<number, RiderEventResult[]>()

  for (const result of results as ResultWithAwards[]) {
    const year = result.season
    const event = result.events

    if (!event) continue

    // Get chapter URL slug from the database chapter slug
    const dbChapterSlug = event.chapters?.slug
    const chapterSlug = dbChapterSlug ? getUrlSlugFromDbSlug(dbChapterSlug) : null

    // Extract awards from result_awards join
    const awards: RiderEventAward[] = (result.result_awards ?? [])
      .filter((ra) => ra.awards !== null)
      .map((ra) => ({
        title: ra.awards!.title,
        description: ra.awards!.description,
      }))

    const eventResult: RiderEventResult = {
      date: event.event_date,
      eventName: event.name,
      distanceKm: event.distance_km,
      time: formatFinishTime(result.finish_time),
      status: result.status,
      note: result.note,
      chapterSlug,
      eventType: event.event_type,
      awards,
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
    const completedCount = events.filter((e) => e.status === 'finished').length
    const totalDistanceKm = events
      .filter((e) => e.status === 'finished')
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
})

export async function getRiderResults(slug: string): Promise<RiderYearResults[]> {
  return unstable_cache(async () => getRiderResultsInner(slug), [`rider-results-${slug}`], {
    tags: ['results', 'riders', `rider-${slug}`],
  })()
}

const getAllChaptersWithYearsInner = cache(
  async (): Promise<Array<{ slug: string; name: string; years: number[] }>> => {
    const chapters = getAllChapterSlugs()

    // Parallelize all async calls instead of sequential await in loop
    const chapterData = await Promise.all(
      chapters.map(async (slug) => {
        const meta = getChapterMeta(slug)
        const years = await getAvailableYears(slug)

        if (meta && years.length > 0) {
          return {
            slug,
            name: meta.name,
            years,
          }
        }
        return null
      })
    )

    // Filter out null entries and return
    return chapterData.filter(
      (item): item is { slug: string; name: string; years: number[] } => item !== null
    )
  }
)

export async function getAllChaptersWithYears(): Promise<
  Array<{ slug: string; name: string; years: number[] }>
> {
  return unstable_cache(async () => getAllChaptersWithYearsInner(), ['all-chapters-with-years'], {
    revalidate: 3600, // Cache for 1 hour
    tags: ['results', 'chapters'],
  })()
}
