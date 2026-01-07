import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Use local Supabase
const supabase = createClient(
  'http://127.0.0.1:54321',
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
)

interface ScheduleEvent {
  Sched_Id: string
  Chapter: string
  Event: string
  Distance: string
  Date: string
  Route: string
  StartLoc: string
  Stime: string
  Organizer: string
  Contact: string
  RWGPS: string
  Unixtime: number
}

interface ScheduleData {
  status: string
  schedule: ScheduleEvent[]
}

// Map chapter names to slugs
const chapterMap: Record<string, string> = {
  'Toronto': 'toronto',
  'Ottawa': 'ottawa',
  'Huron': 'huron',
  'Simcoe': 'simcoe',
  'Club': 'toronto', // Club events default to Toronto
}

// Map event types to our schema
function normalizeEventType(eventType: string): 'brevet' | 'populaire' | 'fleche' | 'permanent' {
  const lower = eventType.toLowerCase()
  if (lower.includes('fleche')) return 'fleche'
  if (lower.includes('populaire')) return 'populaire'
  return 'brevet' // Default to brevet for all brevet variants
}

// Create a URL-friendly slug
function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Create event slug from route name, distance, and date
function createEventSlug(route: string, distance: string, date: string): string {
  return `${createSlug(route)}-${distance}km-${date}`
}

// Extract RWGPS ID from URL
function extractRwgpsId(url: string): string | null {
  if (!url) return null
  const match = url.match(/routes\/(\d+)/)
  return match ? match[1] : null
}

// Create a unique route key (chapter + name + distance)
function createRouteKey(chapterSlug: string, name: string, distance: string): string {
  return `${chapterSlug}:${createSlug(name)}:${distance}`
}

async function importSchedule() {
  // Read the schedule file
  const filePath = join(process.cwd(), 'docs', 'schedule.json')
  const fileContent = readFileSync(filePath, 'utf-8')
  const data: ScheduleData = JSON.parse(fileContent)

  console.log(`Found ${data.schedule.length} events to import`)

  // Get chapter IDs
  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select('id, slug')

  if (chaptersError) {
    console.error('Error fetching chapters:', chaptersError)
    process.exit(1)
  }

  const chapterIds = new Map(chapters.map(c => [c.slug, c.id]))
  console.log('Chapter IDs:', Object.fromEntries(chapterIds))

  // Filter to 2026 events only
  const events2026 = data.schedule.filter(e => e.Date.startsWith('2026'))
  console.log(`Filtering to ${events2026.length} events in 2026`)

  // ============================================
  // Step 1: Extract unique routes
  // ============================================
  const routeMap = new Map<string, {
    slug: string
    name: string
    chapter_id: string
    distance_km: number
    rwgps_id: string | null
  }>()

  for (const event of events2026) {
    const chapterSlug = chapterMap[event.Chapter]
    const chapterId = chapterIds.get(chapterSlug)
    if (!chapterId) continue

    const rwgpsId = extractRwgpsId(event.RWGPS)
    const routeKey = createRouteKey(chapterSlug, event.Route, event.Distance)

    // Only add if we haven't seen this route yet
    if (!routeMap.has(routeKey)) {
      routeMap.set(routeKey, {
        slug: `${createSlug(event.Route)}-${event.Distance}km`,
        name: event.Route,
        chapter_id: chapterId,
        distance_km: parseInt(event.Distance, 10),
        rwgps_id: rwgpsId,
      })
    } else if (rwgpsId && !routeMap.get(routeKey)!.rwgps_id) {
      // Update with RWGPS ID if we didn't have one
      routeMap.get(routeKey)!.rwgps_id = rwgpsId
    }
  }

  console.log(`Found ${routeMap.size} unique routes`)

  // Insert routes
  const routesToInsert = Array.from(routeMap.values())
  const { data: insertedRoutes, error: routesError } = await supabase
    .from('routes')
    .insert(routesToInsert)
    .select('id, slug, chapter_id, distance_km')

  if (routesError) {
    console.error('Error inserting routes:', routesError)
    process.exit(1)
  }

  console.log(`Inserted ${insertedRoutes.length} routes`)

  // Create a lookup map for route IDs
  const routeIdMap = new Map<string, string>()
  for (const route of insertedRoutes) {
    // Key by chapter_id + slug
    routeIdMap.set(`${route.chapter_id}:${route.slug}`, route.id)
  }

  // ============================================
  // Step 2: Insert events with route references
  // ============================================
  const eventsToInsert = events2026.map(event => {
    const chapterSlug = chapterMap[event.Chapter]
    const chapterId = chapterIds.get(chapterSlug)
    if (!chapterId) return null

    // Find the route ID
    const routeSlug = `${createSlug(event.Route)}-${event.Distance}km`
    const routeId = routeIdMap.get(`${chapterId}:${routeSlug}`)

    return {
      slug: createEventSlug(event.Route, event.Distance, event.Date),
      chapter_id: chapterId,
      route_id: routeId || null,
      name: event.Route,
      event_type: normalizeEventType(event.Event),
      distance_km: parseInt(event.Distance, 10),
      event_date: event.Date,
      start_time: event.Stime.substring(0, 5), // HH:MM format
      start_location: event.StartLoc,
      status: 'scheduled' as const,
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null)

  console.log(`Inserting ${eventsToInsert.length} events...`)

  // Insert in batches of 50
  const batchSize = 50
  let inserted = 0

  for (let i = 0; i < eventsToInsert.length; i += batchSize) {
    const batch = eventsToInsert.slice(i, i + batchSize)
    const { error } = await supabase.from('events').insert(batch)

    if (error) {
      console.error(`Error inserting batch ${i / batchSize + 1}:`, error)
      console.error('Batch data:', JSON.stringify(batch, null, 2))
    } else {
      inserted += batch.length
      console.log(`Inserted ${inserted}/${eventsToInsert.length} events`)
    }
  }

  console.log('\nImport complete!')

  // Verify counts
  const { count: routeCount } = await supabase
    .from('routes')
    .select('*', { count: 'exact', head: true })

  const { count: eventCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })

  const { count: linkedCount } = await supabase
    .from('events')
    .select('*', { count: 'exact', head: true })
    .not('route_id', 'is', null)

  console.log(`Total routes in database: ${routeCount}`)
  console.log(`Total events in database: ${eventCount}`)
  console.log(`Events with route links: ${linkedCount}`)
}

importSchedule().catch(console.error)
