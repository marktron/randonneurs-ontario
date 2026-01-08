import { supabase } from '@/lib/supabase'
import type { RouteCollection } from '@/components/routes-page'
import { getChapterInfo, getAllChapterSlugs, getDbSlug } from '@/lib/chapter-config'

// Re-export chapter utilities for convenience
export { getChapterInfo, getAllChapterSlugs }

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
