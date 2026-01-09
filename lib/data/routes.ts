import { supabase } from '@/lib/supabase'
import type { RouteCollection } from '@/components/routes-page'
import { getChapterInfo, getAllChapterSlugs, getDbSlug, getUrlSlugFromDbSlug } from '@/lib/chapter-config'

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
  slug: string
  time: string
}

export interface RouteResultEvent {
  date: string
  eventName: string
  riders: RouteResultRider[]
}

// Format interval to HH:MM string
function formatFinishTime(interval: string | null): string {
  if (!interval) return ''
  // Parse PostgreSQL interval format like "10:30:00", "105:30:00", or "4 days 09:30:00"
  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d+):(\d{2})(?::\d{2})?/)
  if (!match) return interval
  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + (days * 24)
  const minutes = match[3]
  return `${hours}:${minutes}`
}

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

export async function getRouteBySlug(slug: string): Promise<RouteDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: route, error } = await (supabase.from('routes') as any)
    .select(`
      slug, name, distance_km, description, rwgps_id,
      chapters (slug, name)
    `)
    .eq('slug', slug)
    .single()

  if (error || !route) return null

  const chapterDbSlug = route.chapters?.slug
  return {
    slug: route.slug,
    name: route.name,
    distanceKm: route.distance_km,
    description: route.description,
    rwgpsId: route.rwgps_id,
    chapterSlug: chapterDbSlug ? getUrlSlugFromDbSlug(chapterDbSlug) : '',
    chapterName: route.chapters?.name ?? '',
  }
}

export async function getRouteResults(routeSlug: string): Promise<RouteResultEvent[]> {
  // Get the route ID first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: route } = await (supabase.from('routes') as any)
    .select('id')
    .eq('slug', routeSlug)
    .single()

  if (!route) return []

  // Get all events that used this route, with their results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: events, error } = await (supabase.from('events') as any)
    .select(`
      name, event_date,
      public_results (
        finish_time, status, rider_slug, first_name, last_name
      )
    `)
    .eq('route_id', route.id)
    .order('event_date', { ascending: false })

  if (error || !events) return []

  const results: RouteResultEvent[] = []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const event of events as any[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventResults = event.public_results as any[] | null
    if (!eventResults || eventResults.length === 0) continue

    const riders: RouteResultRider[] = eventResults
      .filter(r => r.status !== 'dns') // Exclude DNS
      .map(r => ({
        name: `${r.first_name} ${r.last_name}`.trim() || 'Unknown',
        slug: r.rider_slug,
        time: formatStatus(r.status) ?? formatFinishTime(r.finish_time) ?? '',
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
}

interface DbRoute {
  name: string
  distance_km: number | null
  rwgps_id: string | null
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
  const category = DISTANCE_CATEGORIES.find(
    cat => distance >= cat.min && distance <= cat.max
  )
  return category?.name ?? 'Populaires'
}

function buildRwgpsUrl(rwgpsId: string): string {
  return `https://ridewithgps.com/routes/${rwgpsId}`
}

export async function getRoutesByChapter(urlSlug: string): Promise<RouteCollection[]> {
  // Map URL slug to database slug
  const dbSlug = getDbSlug(urlSlug)
  if (!dbSlug) return []

  // Get the chapter ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chapter, error: chapterError } = await (supabase.from('chapters') as any)
    .select('id')
    .eq('slug', dbSlug)
    .single()

  if (chapterError || !chapter) {
    console.error('Error fetching chapter:', chapterError)
    return []
  }

  // Fetch routes for this chapter that have rwgps_id and are active
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: routes, error: routesError } = await (supabase.from('routes') as any)
    .select('name, distance_km, rwgps_id')
    .eq('chapter_id', chapter.id)
    .eq('is_active', true)
    .not('rwgps_id', 'is', null)

  if (routesError) {
    console.error('Error fetching routes:', routesError)
    return []
  }

  // Group routes by distance category
  const groupedRoutes: Record<string, DbRoute[]> = {}

  for (const route of routes as DbRoute[]) {
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
        routes: categoryRoutes.map(route => ({
          name: route.name,
          distance: route.distance_km!.toString(),
          url: buildRwgpsUrl(route.rwgps_id!),
        })),
      })
    }
  }

  return collections
}

export interface ActiveRoute {
  id: string
  name: string
  slug: string
  distanceKm: number | null
  chapterId: string | null
  chapterName: string | null
}

export async function getActiveRoutes(): Promise<ActiveRoute[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: routes, error } = await (supabase.from('routes') as any)
    .select(`
      id,
      name,
      slug,
      distance_km,
      chapter_id,
      chapters (name)
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (error || !routes) {
    console.error('Error fetching active routes:', error)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (routes as any[]).map((route) => ({
    id: route.id,
    name: route.name,
    slug: route.slug,
    distanceKm: route.distance_km,
    chapterId: route.chapter_id,
    chapterName: route.chapters?.name ?? null,
  }))
}
