/**
 * Route Data Fetching Module
 *
 * This module contains all READ operations for routes. Functions here
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
import type { RouteCollection } from '@/components/routes-page'
import {
  getChapterInfo,
  getAllChapterSlugs,
  getDbSlug,
  getUrlSlugFromDbSlug,
} from '@/lib/chapter-config'
import { formatFinishTime, formatStatus, parseFinishTimeToMinutes } from '@/lib/utils'
import { handleDataError } from '@/lib/errors'
import type { RouteWithChapter, RouteWithChapterName, RouteBasic } from '@/types/queries'

// Re-export chapter utilities for convenience
export { getChapterInfo, getAllChapterSlugs }

export interface RouteDetail {
  slug: string
  name: string
  distanceKm: number | null
  description: string | null
  rwgpsId: string | null
  chapterSlug: string
  chapterName: string
}

export interface RouteResultRider {
  name: string
  slug: string | null
  time: string
  isFirstBrevet: boolean
  isCourseRecord: boolean
}

export interface RouteResultEvent {
  date: string
  eventName: string
  riders: RouteResultRider[]
}

const getRouteBySlugInner = cache(async (slug: string): Promise<RouteDetail | null> => {
  const { data: route, error } = await getSupabase()
    .from('routes')
    .select(
      `
      slug, name, distance_km, description, rwgps_id,
      chapters (slug, name)
    `
    )
    .eq('slug', slug)
    .single()

  if (error || !route) return null

  const typedRoute = route as RouteWithChapter
  const chapterDbSlug = typedRoute.chapters?.slug
  return {
    slug: typedRoute.slug,
    name: typedRoute.name,
    distanceKm: typedRoute.distance_km,
    description: typedRoute.description,
    rwgpsId: typedRoute.rwgps_id,
    chapterSlug: chapterDbSlug ? getUrlSlugFromDbSlug(chapterDbSlug) : '',
    chapterName: typedRoute.chapters?.name ?? '',
  }
})

export async function getRouteBySlug(slug: string): Promise<RouteDetail | null> {
  return unstable_cache(async () => getRouteBySlugInner(slug), [`route-by-slug-${slug}`], {
    tags: ['routes', `route-${slug}`],
  })()
}

const getRouteResultsInner = cache(async (routeSlug: string): Promise<RouteResultEvent[]> => {
  // Get all events that used this route, with their results, using a join
  const { data: events, error } = await getSupabase()
    .from('events')
    .select(
      `
      name, event_date,
      routes!inner(slug),
      public_results (
        id, finish_time, status, rider_slug, first_name, last_name
      )
    `
    )
    .eq('routes.slug', routeSlug)
    .order('event_date', { ascending: false })

  if (error) {
    return handleDataError(error, { operation: 'getRouteResults', context: { routeSlug } }, [])
  }

  if (!events) return []

  // Collect all result IDs to check for First Brevet awards
  type EventWithResults = (typeof events)[number]
  const allResultIds: string[] = []
  for (const event of events as EventWithResults[]) {
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

  // Find the course record (fastest finish time across all results)
  // Track all result IDs with the fastest time to handle ties
  const courseRecordResultIds = new Set<string>()
  let fastestTimeMinutes: number | null = null

  for (const event of events as EventWithResults[]) {
    const eventResults = event.public_results
    if (!eventResults) continue

    for (const result of eventResults) {
      // Only consider finished results with valid times
      if (result.status !== 'finished' || !result.finish_time || !result.id) continue

      const timeInMinutes = parseFinishTimeToMinutes(result.finish_time as string)
      if (timeInMinutes === null) continue

      if (fastestTimeMinutes === null || timeInMinutes < fastestTimeMinutes) {
        // New fastest time - clear previous records and add this one
        fastestTimeMinutes = timeInMinutes
        courseRecordResultIds.clear()
        courseRecordResultIds.add(result.id)
      } else if (timeInMinutes === fastestTimeMinutes) {
        // Tie - add to existing records
        courseRecordResultIds.add(result.id)
      }
    }
  }

  const results: RouteResultEvent[] = []

  for (const event of events as EventWithResults[]) {
    const eventResults = event.public_results
    if (!eventResults || eventResults.length === 0) continue

    const riders: RouteResultRider[] = eventResults
      .filter((r) => r.status !== 'dns') // Exclude DNS
      .map((r) => ({
        name: `${r.first_name} ${r.last_name}`.trim() || 'Unknown',
        slug: r.rider_slug,
        time:
          formatStatus(r.status ?? 'pending') ??
          formatFinishTime(r.finish_time as string | null) ??
          '',
        isFirstBrevet: r.id ? firstBrevetResultIds.has(r.id) : false,
        isCourseRecord: r.id ? courseRecordResultIds.has(r.id) : false,
      }))

    // Sort by last name
    riders.sort((a, b) => {
      const aLast = a.name.split(' ').pop() || a.name
      const bLast = b.name.split(' ').pop() || b.name
      return aLast.localeCompare(bLast)
    })

    results.push({
      date: event.event_date,
      eventName: event.name,
      riders,
    })
  }

  return results
})

export async function getRouteResults(routeSlug: string): Promise<RouteResultEvent[]> {
  return unstable_cache(
    async () => getRouteResultsInner(routeSlug),
    [`route-results-${routeSlug}`],
    {
      tags: ['routes', 'results', `route-${routeSlug}`],
    }
  )()
}

// Distance categories in display order
const DISTANCE_CATEGORIES = [
  { name: 'Populaires', min: 0, max: 199 },
  { name: '200 km', min: 200, max: 299 },
  { name: '300 km', min: 300, max: 399 },
  { name: '400 km', min: 400, max: 599 },
  { name: '600 km', min: 600, max: 999 },
  { name: '1000+ km', min: 1000, max: Infinity },
] as const

function getCategoryForDistance(distance: number): string {
  const category = DISTANCE_CATEGORIES.find((cat) => distance >= cat.min && distance <= cat.max)
  return category?.name ?? 'Populaires'
}

function buildRwgpsUrl(rwgpsId: string): string {
  return `https://ridewithgps.com/routes/${rwgpsId}`
}

const getRoutesByChapterInner = cache(async (urlSlug: string): Promise<RouteCollection[]> => {
  // Map URL slug to database slug
  const dbSlug = getDbSlug(urlSlug)
  if (!dbSlug) return []

  // Fetch routes for this chapter using a join, that have rwgps_id and are active
  const { data: routes, error: routesError } = await getSupabase()
    .from('routes')
    .select('name, distance_km, rwgps_id, chapters!inner(slug)')
    .eq('chapters.slug', dbSlug)
    .eq('is_active', true)
    .not('rwgps_id', 'is', null)

  if (routesError) {
    console.error('Error fetching routes:', routesError)
    return []
  }

  // Group routes by distance category
  const groupedRoutes: Record<string, RouteBasic[]> = {}

  for (const route of routes as RouteBasic[]) {
    if (!route.distance_km || !route.rwgps_id) continue

    const category = getCategoryForDistance(route.distance_km)
    if (!groupedRoutes[category]) {
      groupedRoutes[category] = []
    }
    groupedRoutes[category].push(route)
  }

  // Sort routes alphabetically within each category
  for (const category of Object.keys(groupedRoutes)) {
    groupedRoutes[category].sort((a, b) => a.name.localeCompare(b.name))
  }

  // Build collections in the defined order
  const collections: RouteCollection[] = []

  for (const category of DISTANCE_CATEGORIES) {
    const categoryRoutes = groupedRoutes[category.name]
    if (categoryRoutes && categoryRoutes.length > 0) {
      collections.push({
        name: category.name,
        routes: categoryRoutes.map((route) => ({
          name: route.name,
          distance: route.distance_km!.toString(),
          url: buildRwgpsUrl(route.rwgps_id!),
        })),
      })
    }
  }

  return collections
})

export async function getRoutesByChapter(urlSlug: string): Promise<RouteCollection[]> {
  return unstable_cache(
    async () => getRoutesByChapterInner(urlSlug),
    [`routes-by-chapter-${urlSlug}`],
    {
      tags: ['routes', `chapter-${urlSlug}`],
    }
  )()
}

export interface ActiveRoute {
  id: string
  name: string
  slug: string
  distanceKm: number | null
  chapterId: string | null
  chapterName: string | null
}

const getActiveRoutesInner = cache(async (): Promise<ActiveRoute[]> => {
  const { data: routes, error } = await getSupabase()
    .from('routes')
    .select(
      `
      id,
      name,
      slug,
      distance_km,
      chapter_id,
      chapters (name)
    `
    )
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !routes) {
    return handleDataError(
      error || new Error('No routes returned'),
      { operation: 'getActiveRoutes' },
      []
    )
  }

  return (routes as RouteWithChapterName[]).map((route) => ({
    id: route.id,
    name: route.name,
    slug: route.slug,
    distanceKm: route.distance_km,
    chapterId: route.chapter_id,
    chapterName: route.chapters?.name ?? null,
  }))
})

export async function getActiveRoutes(): Promise<ActiveRoute[]> {
  return unstable_cache(async () => getActiveRoutesInner(), ['active-routes'], {
    tags: ['routes'],
  })()
}
