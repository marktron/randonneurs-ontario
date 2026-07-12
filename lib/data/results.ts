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
import { logError } from '@/lib/errors'
import { queryWithRetry } from '@/lib/data/with-retry'
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
  isCompletedDevilWeek: boolean
}

export interface TeamResult {
  teamName: string
  distance: string
  riders: RiderResult[]
}

export interface EventResult {
  id?: string
  date: string
  name: string
  distance: string
  riders: RiderResult[]
  routeSlug: string | null
  routeChapterSlug?: string | null
  eventType?: string
  startLocation?: string | null
  teams?: TeamResult[]
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
  let eventsError: { message?: string; code?: string } | null = null

  // Collection-based query (e.g., granite-anvil)
  if (dbSlug === null) {
    const result = await queryWithRetry(() =>
      getSupabase()
        .from('events')
        .select('id, season, results(season)')
        .eq('collection', urlSlug)
        .limit(2000)
    )
    events = result.data
    eventsError = result.error
  } else if (urlSlug === 'permanent' || urlSlug === 'fleche') {
    // Permanent/Fleche results: query by event_type instead of chapter
    const result = await queryWithRetry(() =>
      getSupabase()
        .from('events')
        .select('id, season, results(season)')
        .eq('event_type', urlSlug)
        .limit(2000)
    )
    events = result.data
    eventsError = result.error
  } else {
    // Chapter-based query using a join. Rebuilt inside the thunk so a retry
    // doesn't append filters to a reused builder.
    const result = await queryWithRetry(() => {
      let query = getSupabase()
        .from('events')
        .select('id, season, results(season), chapters!inner(slug)')
        .eq('chapters.slug', dbSlug)

      // Filter for PBP events if requested
      if (urlSlug === 'pbp') {
        query = query.eq('name', 'Paris-Brest-Paris')
      }

      return query.limit(2000)
    })
    events = result.data
    eventsError = result.error
  }

  if (eventsError) {
    // Don't cache an empty fallback on failure — unstable_cache would persist
    // it and hide a chapter's years until revalidation (see getChapterResults
    // / JAVASCRIPT-NEXTJS-25). Retries are exhausted, so throw.
    logError(eventsError, {
      operation: 'getAvailableYears',
      context: { urlSlug },
      skipSentry: true,
    })
    throw new Error(
      `getAvailableYears failed for ${urlSlug}: ${eventsError.message ?? 'query error'}`
    )
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
    if (!Number.isInteger(year)) return []
    const dbSlug = getDbSlug(urlSlug)

    let events: EventWithPublicResults[] | null = null
    let eventsError: { message?: string; code?: string } | null = null

    // Collection-based query (e.g., granite-anvil)
    if (dbSlug === null) {
      const result = await queryWithRetry(() =>
        getSupabase()
          .from('events')
          .select(
            `
        id, name, event_date, distance_km, event_type, start_location,
        routes (slug),
        public_results (
          id, finish_time, status, team_name, distance_km, rider_slug, first_name, last_name
        )
      `
          )
          .eq('collection', urlSlug)
          .gte('event_date', `${year}-01-01`)
          .lte('event_date', `${year}-12-31`)
          .order('event_date', { ascending: false })
      )
      events = result.data
      eventsError = result.error
    } else if (urlSlug === 'permanent' || urlSlug === 'fleche') {
      // Permanent/Fleche results: query by event_type instead of chapter
      const result = await queryWithRetry(() =>
        getSupabase()
          .from('events')
          .select(
            `
        id, name, event_date, distance_km, event_type, start_location,
        routes (slug, chapters (slug)),
        public_results (
          id, finish_time, status, team_name, distance_km, rider_slug, first_name, last_name
        )
      `
          )
          .eq('event_type', urlSlug)
          .gte('event_date', `${year}-01-01`)
          .lte('event_date', `${year}-12-31`)
          .order('event_date', { ascending: false })
      )
      events = result.data
      eventsError = result.error
    } else {
      // Chapter-based query using a join. Rebuilt fresh inside the thunk so a
      // retry doesn't append filters/order to a reused builder.
      const result = await queryWithRetry(() => {
        let query = getSupabase()
          .from('events')
          .select(
            `
        id, name, event_date, distance_km, event_type, start_location,
        routes (slug),
        chapters!inner(slug),
        public_results (
          id, finish_time, status, team_name, distance_km, rider_slug, first_name, last_name
        )
      `
          )
          .eq('chapters.slug', dbSlug)
          .neq('event_type', 'permanent')
          .neq('event_type', 'fleche')
          .gte('event_date', `${year}-01-01`)
          .lte('event_date', `${year}-12-31`)

        // Filter for PBP events if requested
        if (urlSlug === 'pbp') {
          query = query.eq('name', 'Paris-Brest-Paris')
        }

        return query.order('event_date', { ascending: false })
      })
      events = result.data
      eventsError = result.error
    }

    if (eventsError || !events) {
      // Do NOT return an empty fallback here. This function is wrapped in
      // unstable_cache (see getChapterResults), which would persist the empty
      // array and leave the chapter/year page showing no results until the next
      // tag-based revalidation — turning a transient Supabase 5xx into durable
      // bad data (Sentry JAVASCRIPT-NEXTJS-25). queryWithRetry has already
      // retried transient failures, so a remaining error is treated as fatal:
      // throw so the cache isn't poisoned and ISR keeps serving the last good
      // page. Log (skipSentry) for context; the throw is reported to Sentry via
      // captureRequestError in instrumentation.ts.
      logError(eventsError ?? new Error('No events returned'), {
        operation: 'getChapterResults',
        context: { urlSlug, year },
        skipSentry: true,
      })
      throw new Error(
        `getChapterResults failed for ${urlSlug}/${year}: ${eventsError?.message ?? 'no events returned'}`
      )
    }

    // DNS results are internal bookkeeping — hide them from public pages
    // (they remain visible in the admin, which queries results directly).
    for (const event of events) {
      if (event.public_results) {
        event.public_results = event.public_results.filter((r) => r.status !== 'dns')
      }
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

    // Query for Completed Devil Week awards
    const completedDevilWeekResultIds = new Set<string>()
    if (allResultIds.length > 0) {
      const { data: devilWeekAwardData } = await getSupabase()
        .from('result_awards')
        .select('result_id, awards!inner(title)')
        .in('result_id', allResultIds)
        .eq('awards.title', 'Completed Devil Week')

      if (devilWeekAwardData) {
        for (const award of devilWeekAwardData) {
          completedDevilWeekResultIds.add(award.result_id)
        }
      }
    }

    // Transform to EventResult format
    const eventResults: EventResult[] = []

    for (const event of events) {
      const eventResultsList = event.public_results

      // Skip events with no results
      if (!eventResultsList || eventResultsList.length === 0) continue

      const isFleche = event.event_type === 'fleche'

      const riders: RiderResult[] = eventResultsList.map((result) => {
        const name = `${result.first_name} ${result.last_name}`.trim() || 'Unknown'
        const slug = result.rider_slug
        const statusStr = formatStatus(result.status ?? 'pending')
        // Show status (DNF/DNS/OTL/DQ) if not finished, otherwise show finish time
        const time = statusStr ?? formatFinishTime(result.finish_time as string | null) ?? ''
        const isFirstBrevet = result.id ? firstBrevetResultIds.has(result.id) : false
        const isCompletedDevilWeek = result.id ? completedDevilWeekResultIds.has(result.id) : false

        return { name, slug, time, isFirstBrevet, isCompletedDevilWeek }
      })

      // Sort riders by last name A→Z
      riders.sort((a, b) => {
        const aLastName = a.name.split(' ').pop() || a.name
        const bLastName = b.name.split(' ').pop() || b.name
        return aLastName.localeCompare(bLastName)
      })

      // Build team grouping for fleche events
      let teams: TeamResult[] | undefined
      if (isFleche) {
        const teamMap = new Map<string, { distance: string; riders: RiderResult[] }>()

        for (const result of eventResultsList) {
          const teamName = result.team_name || 'Unknown Team'
          const name = `${result.first_name} ${result.last_name}`.trim() || 'Unknown'
          const slug = result.rider_slug
          const statusStr = formatStatus(result.status ?? 'pending')
          const time = statusStr ?? formatFinishTime(result.finish_time as string | null) ?? ''
          const isFirstBrevet = result.id ? firstBrevetResultIds.has(result.id) : false
          const isCompletedDevilWeek = result.id
            ? completedDevilWeekResultIds.has(result.id)
            : false
          const distance = result.distance_km?.toString() ?? event.distance_km.toString()

          if (!teamMap.has(teamName)) {
            teamMap.set(teamName, { distance, riders: [] })
          }
          teamMap
            .get(teamName)!
            .riders.push({ name, slug, time, isFirstBrevet, isCompletedDevilWeek })
        }

        // Sort riders within each team by last name
        for (const team of teamMap.values()) {
          team.riders.sort((a, b) => {
            const aLastName = a.name.split(' ').pop() || a.name
            const bLastName = b.name.split(' ').pop() || b.name
            return aLastName.localeCompare(bLastName)
          })
        }

        // Sort teams: by distance descending, "Unknown Team" last
        teams = Array.from(teamMap.entries())
          .sort(([nameA, a], [nameB, b]) => {
            if (nameA === 'Unknown Team') return 1
            if (nameB === 'Unknown Team') return -1
            return parseFloat(b.distance) - parseFloat(a.distance)
          })
          .map(([teamName, data]) => ({
            teamName,
            distance: data.distance,
            riders: data.riders,
          }))
      }

      eventResults.push({
        id: event.id,
        date: event.event_date,
        name: event.name,
        distance: event.distance_km.toString(),
        riders,
        routeSlug: event.routes?.slug ?? null,
        routeChapterSlug: event.routes?.chapters?.slug
          ? getUrlSlugFromDbSlug(event.routes.chapters.slug)
          : null,
        eventType: event.event_type,
        startLocation: event.start_location,
        teams,
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
  riderNumber: number | null
}

export interface RiderEventAward {
  id?: string
  title: string
  description: string | null
}

export interface RiderEventResult {
  id?: string
  date: string
  eventName: string
  distanceKm: number
  time: string | null
  status: string | null
  note: string | null
  chapterSlug: string | null
  eventType: string
  teamName: string | null
  awards: RiderEventAward[]
}

export interface RiderYearResults {
  year: number
  completedCount: number
  totalDistanceKm: number
  results: RiderEventResult[]
  seasonAwards: RiderEventAward[]
}

const getRiderBySlugInner = cache(async (slug: string): Promise<RiderInfo | null> => {
  // Use public_riders view (riders table is restricted to protect emails)
  const result = await queryWithRetry(() =>
    getSupabase()
      .from('public_riders')
      .select('slug, first_name, last_name, rider_number')
      .eq('slug', slug)
      .maybeSingle()
  )

  if (result.error) {
    // Throw rather than cache a bogus "not found" (null) on a transient error —
    // that would 404 the rider page until revalidation (see JAVASCRIPT-NEXTJS-25).
    logError(result.error, { operation: 'getRiderBySlug', context: { slug }, skipSentry: true })
    throw new Error(`getRiderBySlug failed for ${slug}: ${result.error.message ?? 'query error'}`)
  }

  if (!result.data) return null

  const typedRider = result.data as Pick<
    PublicRider,
    'slug' | 'first_name' | 'last_name' | 'rider_number'
  >

  return {
    slug: typedRider.slug ?? '',
    firstName: typedRider.first_name ?? '',
    lastName: typedRider.last_name ?? '',
    riderNumber: typedRider.rider_number ?? null,
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
  const riderLookup = await queryWithRetry(() =>
    getSupabase().from('public_riders').select('id').eq('slug', slug).maybeSingle()
  )

  if (riderLookup.error) {
    // Throw rather than cache [] on a transient error (see JAVASCRIPT-NEXTJS-25).
    logError(riderLookup.error, {
      operation: 'getRiderResults',
      context: { slug },
      skipSentry: true,
    })
    throw new Error(
      `getRiderResults failed for ${slug}: ${riderLookup.error.message ?? 'query error'}`
    )
  }

  const rider = riderLookup.data
  if (!rider || !rider.id) {
    return []
  }
  // Capture as a non-null const so the narrowing survives inside the query
  // thunk closures below (TS widens property narrowing across closures).
  const riderId = rider.id

  // Get all results for this rider with event info and awards in a single query
  const resultsQuery = await queryWithRetry(() =>
    getSupabase()
      .from('results')
      .select(
        `
      id,
      finish_time,
      status,
      note,
      team_name,
      season,
      distance_km,
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
          id,
          title,
          description
        )
      )
    `
      )
      .eq('rider_id', riderId)
      .order('season', { ascending: false })
  )

  if (resultsQuery.error) {
    // Throw rather than cache [] on a transient error (see JAVASCRIPT-NEXTJS-25).
    logError(resultsQuery.error, {
      operation: 'getRiderResults.results',
      context: { riderId },
      skipSentry: true,
    })
    throw new Error(
      `getRiderResults.results failed for rider ${riderId}: ${resultsQuery.error.message ?? 'query error'}`
    )
  }

  const results = resultsQuery.data
  if (!results) return []

  // Query season-scoped awards (e.g., Super Randonneur) from rider_awards
  const { data: seasonAwardsData } = await getSupabase()
    .from('rider_awards')
    .select('season, awards(id, title, description)')
    .eq('rider_id', riderId)

  // Group season awards by year
  const seasonAwardsByYear = new Map<number, RiderEventAward[]>()
  if (seasonAwardsData) {
    for (const sa of seasonAwardsData) {
      if (!sa.awards) continue
      const award: RiderEventAward = {
        id: sa.awards.id,
        title: sa.awards.title,
        description: sa.awards.description,
      }
      if (!seasonAwardsByYear.has(sa.season)) {
        seasonAwardsByYear.set(sa.season, [])
      }
      seasonAwardsByYear.get(sa.season)!.push(award)
    }
  }

  // Type for the query result with awards
  type ResultWithAwards = ResultWithEvent & {
    id: string
    team_name: string | null
    distance_km: number | null
    result_awards: Array<{
      awards: { id: string; title: string; description: string | null } | null
    }> | null
  }

  // Group by year
  const yearMap = new Map<number, RiderEventResult[]>()

  for (const result of results as ResultWithAwards[]) {
    const year = result.season
    const event = result.events

    if (!event) continue

    // DNS results are internal bookkeeping — hide them from the public rider page
    if (result.status === 'dns') continue

    // Get chapter URL slug from the database chapter slug
    const dbChapterSlug = event.chapters?.slug
    const chapterSlug = dbChapterSlug ? getUrlSlugFromDbSlug(dbChapterSlug) : null

    // Extract awards from result_awards join
    const awards: RiderEventAward[] = (result.result_awards ?? [])
      .filter((ra) => ra.awards !== null)
      .map((ra) => ({
        id: ra.awards!.id,
        title: ra.awards!.title,
        description: ra.awards!.description,
      }))

    // For fleche events, use the result's distance (each team rides a different distance)
    const distanceKm =
      event.event_type === 'fleche' && result.distance_km ? result.distance_km : event.distance_km

    const eventResult: RiderEventResult = {
      id: result.id,
      date: event.event_date,
      eventName: event.name,
      distanceKm,
      time: formatFinishTime(result.finish_time),
      status: result.status,
      note: result.note,
      chapterSlug,
      eventType: event.event_type,
      teamName: result.team_name ?? null,
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
      seasonAwards: seasonAwardsByYear.get(year) ?? [],
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
