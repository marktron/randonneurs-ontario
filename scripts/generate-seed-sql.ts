import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

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
  'Club': 'toronto',
}

function normalizeEventType(eventType: string): string {
  const lower = eventType.toLowerCase()
  if (lower.includes('fleche')) return 'fleche'
  if (lower.includes('populaire')) return 'populaire'
  return 'brevet'
}

function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractRwgpsId(url: string): string | null {
  if (!url) return null
  const match = url.match(/routes\/(\d+)/)
  return match ? match[1] : null
}

function escapeSQL(str: string | null): string {
  if (str === null) return 'NULL'
  return `'${str.replace(/'/g, "''")}'`
}

function generateSeedSQL() {
  const filePath = join(process.cwd(), 'docs', 'schedule.json')
  const fileContent = readFileSync(filePath, 'utf-8')
  const data: ScheduleData = JSON.parse(fileContent)

  // Filter to 2026 events
  const events2026 = data.schedule.filter(e => e.Date.startsWith('2026'))
  console.log(`Processing ${events2026.length} events for 2026`)

  const sql: string[] = []
  sql.push('-- Seed data: Routes and Events for 2026 season')
  sql.push('-- Generated from docs/schedule.json')
  sql.push('')

  // Extract unique routes
  const routeMap = new Map<string, {
    slug: string
    name: string
    chapterSlug: string
    distance_km: number
    rwgps_id: string | null
  }>()

  for (const event of events2026) {
    const chapterSlug = chapterMap[event.Chapter]
    if (!chapterSlug) continue

    const routeSlug = `${createSlug(event.Route)}-${event.Distance}km`
    const routeKey = `${chapterSlug}:${routeSlug}`

    if (!routeMap.has(routeKey)) {
      routeMap.set(routeKey, {
        slug: routeSlug,
        name: event.Route,
        chapterSlug,
        distance_km: parseInt(event.Distance, 10),
        rwgps_id: extractRwgpsId(event.RWGPS),
      })
    } else if (!routeMap.get(routeKey)!.rwgps_id) {
      const rwgpsId = extractRwgpsId(event.RWGPS)
      if (rwgpsId) routeMap.get(routeKey)!.rwgps_id = rwgpsId
    }
  }

  console.log(`Found ${routeMap.size} unique routes`)

  // Generate routes INSERT
  sql.push('-- ============================================')
  sql.push('-- Routes')
  sql.push('-- ============================================')
  sql.push('INSERT INTO routes (slug, name, chapter_id, distance_km, rwgps_id) VALUES')

  const routeValues: string[] = []
  for (const route of routeMap.values()) {
    routeValues.push(
      `  (${escapeSQL(route.slug)}, ${escapeSQL(route.name)}, ` +
      `(SELECT id FROM chapters WHERE slug = ${escapeSQL(route.chapterSlug)}), ` +
      `${route.distance_km}, ${escapeSQL(route.rwgps_id)})`
    )
  }
  sql.push(routeValues.join(',\n') + ';')
  sql.push('')

  // Generate events INSERT
  sql.push('-- ============================================')
  sql.push('-- Events')
  sql.push('-- ============================================')
  sql.push('INSERT INTO events (slug, chapter_id, route_id, name, event_type, distance_km, event_date, start_time, start_location, status) VALUES')

  const eventValues: string[] = []
  for (const event of events2026) {
    const chapterSlug = chapterMap[event.Chapter]
    if (!chapterSlug) continue

    const eventSlug = `${createSlug(event.Route)}-${event.Distance}km-${event.Date}`
    const routeSlug = `${createSlug(event.Route)}-${event.Distance}km`
    const startTime = event.Stime.substring(0, 5)

    eventValues.push(
      `  (${escapeSQL(eventSlug)}, ` +
      `(SELECT id FROM chapters WHERE slug = ${escapeSQL(chapterSlug)}), ` +
      `(SELECT id FROM routes WHERE slug = ${escapeSQL(routeSlug)} AND chapter_id = (SELECT id FROM chapters WHERE slug = ${escapeSQL(chapterSlug)})), ` +
      `${escapeSQL(event.Route)}, ${escapeSQL(normalizeEventType(event.Event))}, ` +
      `${parseInt(event.Distance, 10)}, ${escapeSQL(event.Date)}, ${escapeSQL(startTime)}, ` +
      `${escapeSQL(event.StartLoc)}, 'scheduled')`
    )
  }
  sql.push(eventValues.join(',\n') + ';')

  // Write to seed.sql
  const outputPath = join(process.cwd(), 'supabase', 'seed.sql')
  writeFileSync(outputPath, sql.join('\n'))
  console.log(`Generated ${outputPath}`)
  console.log(`  - ${routeMap.size} routes`)
  console.log(`  - ${eventValues.length} events`)
}

generateSeedSQL()
