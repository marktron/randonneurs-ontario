import Database from 'better-sqlite3'
import { createClient } from '@supabase/supabase-js'
import { v5 as uuidv5 } from 'uuid'
import { join } from 'path'

// UUID namespace for deterministic ID generation
const UUID_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8' // URL namespace

// Local Supabase connection with service role key (bypasses RLS)
const supabase = createClient(
  'http://127.0.0.1:54321',
  'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'
)

// SQLite database
const dbPath = join(process.cwd(), 'docs', 'ro-stats.sqlite')
const sqlite = new Database(dbPath, { readonly: true })

// Chapter slug mapping
const chapterSlugMap: Record<string, string> = {
  'Toronto': 'toronto',
  'Ottawa': 'ottawa',
  'Huron': 'huron',
  'Simcoe-Muskoka': 'simcoe',
  'Niagara': 'niagara',
  'Other': 'other',
  'Permanent': 'permanent',
}

// Generate deterministic UUID from original ID
function generateUUID(originalId: string): string {
  return uuidv5(originalId, UUID_NAMESPACE)
}

// Parse time string "HH:MM" to PostgreSQL interval
function parseTime(time: string | null): string | null {
  if (!time || time === '') return null
  // Handle various time formats
  const match = time.match(/^(\d{1,2}):(\d{2})$/)
  if (match) {
    return `${match[1]} hours ${match[2]} minutes`
  }
  return null
}

// Map SQLite status to Supabase status
function mapStatus(status: string | null): 'finished' | 'dnf' | 'dns' | 'otl' | 'dq' {
  if (!status) return 'finished'
  const upper = status.toUpperCase()
  if (upper.includes('DNF')) return 'dnf'
  if (upper.includes('DNS')) return 'dns'
  if (upper.includes('OTL')) return 'otl'
  if (upper.includes('DQ')) return 'dq'
  return 'finished'
}

// Derive event type from chapter, distance, and title
function deriveEventType(chapter: string, distance: number | null, title: string): 'brevet' | 'populaire' | 'permanent' | 'fleche' {
  if (chapter === 'Permanent') return 'permanent'
  if (title.toLowerCase().includes('flèche') || title.toLowerCase().includes('fleche')) return 'fleche'
  if (!distance || distance < 200) return 'populaire'
  return 'brevet'
}

// Create URL-friendly slug
function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

interface ImportStats {
  chapters: { inserted: number; skipped: number }
  awards: { inserted: number; skipped: number }
  riders: { inserted: number; skipped: number }
  routes: { inserted: number; skipped: number }
  events: { inserted: number; skipped: number }
  results: { inserted: number; skipped: number }
  resultAwards: { inserted: number; skipped: number }
}

async function importChapters(chapterIds: Map<string, string>): Promise<void> {
  console.log('\n--- Importing Chapters ---')

  // Get existing chapters
  const { data: existing } = await supabase
    .from('chapters')
    .select('id, slug')

  const existingSlugs = new Set(existing?.map(c => c.slug) || [])
  existing?.forEach(c => chapterIds.set(c.slug, c.id))

  // Add all chapters (core + historical)
  const newChapters = [
    { slug: 'toronto', name: 'Toronto', description: 'Brevets and populaires in the Greater Toronto Area' },
    { slug: 'ottawa', name: 'Ottawa', description: 'Brevets and populaires in the Ottawa Valley region' },
    { slug: 'simcoe', name: 'Simcoe-Muskoka', description: 'Brevets and populaires in Simcoe County and Muskoka' },
    { slug: 'huron', name: 'Huron', description: 'Brevets and populaires along Lake Huron and Bruce County' },
    { slug: 'niagara', name: 'Niagara', description: 'Historical chapter (inactive)' },
    { slug: 'other', name: 'Other', description: 'Miscellaneous events' },
    { slug: 'permanent', name: 'Permanent', description: 'Permanent rides' },
  ].filter(c => !existingSlugs.has(c.slug))

  if (newChapters.length > 0) {
    const { data: inserted, error } = await supabase
      .from('chapters')
      .insert(newChapters)
      .select('id, slug')

    if (error) {
      console.error('Error inserting chapters:', error)
    } else {
      inserted?.forEach(c => chapterIds.set(c.slug, c.id))
      console.log(`Inserted ${inserted?.length || 0} new chapters`)
    }
  } else {
    console.log('No new chapters to insert')
  }

  console.log('Chapter IDs:', Object.fromEntries(chapterIds))
}

async function importAwards(awardIds: Map<string, string>): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Awards ---')

  const sqliteAwards = sqlite.prepare('SELECT * FROM awards').all() as Array<{
    id: string
    title: string
    description: string | null
  }>

  let inserted = 0
  let skipped = 0

  for (const award of sqliteAwards) {
    const uuid = generateUUID(award.id)
    awardIds.set(award.id, uuid)

    const { error } = await supabase
      .from('awards')
      .insert({
        id: uuid,
        slug: createSlug(award.title),
        title: award.title,
        description: award.description,
      })

    if (error) {
      if (error.code === '23505') { // Unique violation
        skipped++
      } else {
        console.error(`Error inserting award ${award.title}:`, error.message)
      }
    } else {
      inserted++
    }
  }

  console.log(`Awards: ${inserted} inserted, ${skipped} skipped`)
  return { inserted, skipped }
}

async function importRiders(riderIds: Map<string, string>): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Riders ---')

  const sqliteRiders = sqlite.prepare('SELECT * FROM riders').all() as Array<{
    id: string
    slug: string
    first_name: string | null
    last_name: string | null
  }>

  let inserted = 0
  let skipped = 0
  const batchSize = 100

  for (let i = 0; i < sqliteRiders.length; i += batchSize) {
    const batch = sqliteRiders.slice(i, i + batchSize)
    const ridersToInsert = batch.map(rider => {
      const uuid = generateUUID(rider.id)
      riderIds.set(rider.id, uuid)
      return {
        id: uuid,
        slug: rider.slug || createSlug(`${rider.first_name || ''}-${rider.last_name || ''}`),
        first_name: rider.first_name || '',
        last_name: rider.last_name || '',
        email: null,
        gender: null,
      }
    })

    const { data, error } = await supabase
      .from('riders')
      .upsert(ridersToInsert, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.error(`Error inserting riders batch:`, error.message)
      skipped += batch.length
    } else {
      inserted += data?.length || 0
      skipped += batch.length - (data?.length || 0)
    }
  }

  console.log(`Riders: ${inserted} inserted, ${skipped} skipped`)
  return { inserted, skipped }
}

async function importRoutes(
  routeIds: Map<string, string>,
  chapterIds: Map<string, string>
): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Routes ---')

  const sqliteRoutes = sqlite.prepare('SELECT * FROM routes').all() as Array<{
    id: string
    slug: string
    name: string
    chapter: string | null
    description: string | null
    notes: string | null
  }>

  let inserted = 0
  let skipped = 0

  for (const route of sqliteRoutes) {
    const uuid = generateUUID(route.id)
    routeIds.set(route.id, uuid)

    const chapterSlug = route.chapter ? chapterSlugMap[route.chapter] : null
    const chapterId = chapterSlug ? chapterIds.get(chapterSlug) : null

    const { error } = await supabase
      .from('routes')
      .insert({
        id: uuid,
        slug: route.slug,
        name: route.name,
        chapter_id: chapterId,
        description: route.description,
        notes: route.notes,
        rwgps_id: null,
        cue_sheet_url: null,
        collection: null,
        is_active: false, // Historical routes are inactive
      })

    if (error) {
      if (error.code === '23505') { // Unique violation
        skipped++
      } else {
        console.error(`Error inserting route ${route.name}:`, error.message)
      }
    } else {
      inserted++
    }
  }

  console.log(`Routes: ${inserted} inserted, ${skipped} skipped`)
  return { inserted, skipped }
}

async function importEvents(
  eventIds: Map<string, string>,
  chapterIds: Map<string, string>,
  routeIds: Map<string, string>,
  brevetDistances: Map<string, number>
): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Events (Brevets) ---')

  const sqliteBrevets = sqlite.prepare('SELECT * FROM brevets').all() as Array<{
    id: string
    slug: string
    title: string
    chapter: string
    distance: number | null
    event_date: string
    destination: string | null
    route_ref: string | null
  }>

  // Build distance map for results import (use 360 for flèche events)
  for (const brevet of sqliteBrevets) {
    const isFlèche = brevet.title.toLowerCase().includes('flèche') || brevet.title.toLowerCase().includes('fleche')
    const distance = brevet.distance || (isFlèche ? 360 : 0)
    brevetDistances.set(brevet.id, distance)
  }

  let inserted = 0
  let skipped = 0
  const batchSize = 50

  for (let i = 0; i < sqliteBrevets.length; i += batchSize) {
    const batch = sqliteBrevets.slice(i, i + batchSize)
    const eventsToInsert = batch.map(brevet => {
      const uuid = generateUUID(brevet.id)
      eventIds.set(brevet.id, uuid)

      const chapterSlug = chapterSlugMap[brevet.chapter] || 'other'
      const chapterId = chapterIds.get(chapterSlug)
      const routeId = brevet.route_ref ? routeIds.get(brevet.route_ref) : null

      // Use 360km for flèche events (minimum distance requirement)
      const isFlèche = brevet.title.toLowerCase().includes('flèche') || brevet.title.toLowerCase().includes('fleche')
      const distance = brevet.distance || (isFlèche ? 360 : 0)

      return {
        id: uuid,
        slug: brevet.slug,
        chapter_id: chapterId,
        route_id: routeId,
        name: brevet.title,
        event_type: deriveEventType(brevet.chapter, brevet.distance, brevet.title),
        distance_km: distance,
        event_date: brevet.event_date,
        start_time: null,
        start_location: brevet.destination,
        status: 'completed' as const,
      }
    })

    const { data, error } = await supabase
      .from('events')
      .upsert(eventsToInsert, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')

    if (error) {
      console.error(`Error inserting events batch:`, error.message)
      skipped += batch.length
    } else {
      inserted += data?.length || 0
      skipped += batch.length - (data?.length || 0)
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= sqliteBrevets.length) {
      console.log(`  Processed ${Math.min(i + batchSize, sqliteBrevets.length)}/${sqliteBrevets.length} events`)
    }
  }

  console.log(`Events: ${inserted} inserted, ${skipped} skipped`)
  return { inserted, skipped }
}

async function importResults(
  resultIds: Map<string, string>,
  eventIds: Map<string, string>,
  riderIds: Map<string, string>,
  brevetDistances: Map<string, number>
): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Results ---')

  const sqliteResults = sqlite.prepare("SELECT * FROM results WHERE id IS NOT NULL AND id != ''").all() as Array<{
    id: string
    brevet_ref: string
    rider_ref: string
    season: number
    time: string | null
    status: string | null
    note: string | null
    team_name: string | null
    distance: number | null
  }>

  // De-duplicate: keep only first result per (event_id, rider_id) pair
  const seenPairs = new Set<string>()
  const deduplicatedResults: typeof sqliteResults = []
  let duplicatesSkipped = 0

  for (const result of sqliteResults) {
    const eventId = eventIds.get(result.brevet_ref)
    const riderId = riderIds.get(result.rider_ref)

    if (!eventId || !riderId) continue

    const pairKey = `${eventId}:${riderId}`
    if (seenPairs.has(pairKey)) {
      duplicatesSkipped++
      continue
    }
    seenPairs.add(pairKey)
    deduplicatedResults.push(result)
  }

  console.log(`  De-duplicated: ${sqliteResults.length} → ${deduplicatedResults.length} (${duplicatesSkipped} duplicates removed)`)

  let inserted = 0
  let skipped = 0
  const batchSize = 100

  for (let i = 0; i < deduplicatedResults.length; i += batchSize) {
    const batch = deduplicatedResults.slice(i, i + batchSize)
    const resultsToInsert: Array<{
      id: string
      event_id: string
      rider_id: string
      finish_time: string | null
      status: 'finished' | 'dnf' | 'dns' | 'otl' | 'dq'
      note: string | null
      team_name: string | null
      season: number
      distance_km: number
    }> = []

    for (const result of batch) {
      const uuid = generateUUID(result.id)
      resultIds.set(result.id, uuid)

      const eventId = eventIds.get(result.brevet_ref)
      const riderId = riderIds.get(result.rider_ref)

      if (!eventId || !riderId) {
        skipped++
        continue
      }

      // Get distance from result, or fall back to brevet distance, or 0 for fleche
      const distance = result.distance || brevetDistances.get(result.brevet_ref) || 0

      resultsToInsert.push({
        id: uuid,
        event_id: eventId,
        rider_id: riderId,
        finish_time: parseTime(result.time),
        status: mapStatus(result.status),
        note: result.note,
        team_name: result.team_name,
        season: result.season,
        distance_km: distance,
      })
    }

    if (resultsToInsert.length > 0) {
      const { data, error } = await supabase
        .from('results')
        .insert(resultsToInsert)
        .select('id')

      if (error) {
        console.error(`Error inserting results batch:`, error.message)
        skipped += resultsToInsert.length
      } else {
        inserted += data?.length || 0
      }
    }

    if ((i + batchSize) % 1000 === 0 || i + batchSize >= deduplicatedResults.length) {
      console.log(`  Processed ${Math.min(i + batchSize, deduplicatedResults.length)}/${deduplicatedResults.length} results`)
    }
  }

  console.log(`Results: ${inserted} inserted, ${skipped} skipped, ${duplicatesSkipped} duplicates removed`)
  return { inserted, skipped }
}

async function importResultAwards(
  resultIds: Map<string, string>,
  awardIds: Map<string, string>
): Promise<{ inserted: number; skipped: number }> {
  console.log('\n--- Importing Result Awards ---')

  const sqliteResultAwards = sqlite.prepare('SELECT * FROM result_awards').all() as Array<{
    result_id: string
    award_ref: string
  }>

  let inserted = 0
  let skipped = 0
  const batchSize = 100

  for (let i = 0; i < sqliteResultAwards.length; i += batchSize) {
    const batch = sqliteResultAwards.slice(i, i + batchSize)
    const awardsToInsert: Array<{
      result_id: string
      award_id: string
    }> = []

    for (const ra of batch) {
      const resultId = resultIds.get(ra.result_id)
      const awardId = awardIds.get(ra.award_ref)

      if (!resultId || !awardId) {
        skipped++
        continue
      }

      awardsToInsert.push({
        result_id: resultId,
        award_id: awardId,
      })
    }

    if (awardsToInsert.length > 0) {
      const { error } = await supabase
        .from('result_awards')
        .upsert(awardsToInsert, { onConflict: 'result_id,award_id', ignoreDuplicates: true })

      if (error) {
        console.error(`Error inserting result_awards batch:`, error.message)
        skipped += awardsToInsert.length
      } else {
        inserted += awardsToInsert.length
      }
    }

    if ((i + batchSize) % 500 === 0 || i + batchSize >= sqliteResultAwards.length) {
      console.log(`  Processed ${Math.min(i + batchSize, sqliteResultAwards.length)}/${sqliteResultAwards.length} result_awards`)
    }
  }

  console.log(`Result Awards: ${inserted} inserted, ${skipped} skipped`)
  return { inserted, skipped }
}

async function main() {
  console.log('===========================================')
  console.log('SQLite to Supabase Import')
  console.log('===========================================')
  console.log(`Source: ${dbPath}`)

  // Verify SQLite connection
  const tableCount = sqlite.prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'").get() as { count: number }
  console.log(`Found ${tableCount.count} tables in SQLite database`)

  // ID mapping tables
  const chapterIds = new Map<string, string>()
  const awardIds = new Map<string, string>()
  const riderIds = new Map<string, string>()
  const routeIds = new Map<string, string>()
  const eventIds = new Map<string, string>()
  const resultIds = new Map<string, string>()
  const brevetDistances = new Map<string, number>()

  // Import in order (respecting foreign keys)
  await importChapters(chapterIds)
  await importAwards(awardIds)
  await importRiders(riderIds)
  await importRoutes(routeIds, chapterIds)
  await importEvents(eventIds, chapterIds, routeIds, brevetDistances)
  await importResults(resultIds, eventIds, riderIds, brevetDistances)
  await importResultAwards(resultIds, awardIds)

  // Final summary
  console.log('\n===========================================')
  console.log('Import Complete!')
  console.log('===========================================')

  // Verify final counts
  const { count: ridersCount } = await supabase.from('riders').select('*', { count: 'exact', head: true })
  const { count: routesCount } = await supabase.from('routes').select('*', { count: 'exact', head: true })
  const { count: eventsCount } = await supabase.from('events').select('*', { count: 'exact', head: true })
  const { count: resultsCount } = await supabase.from('results').select('*', { count: 'exact', head: true })
  const { count: awardsCount } = await supabase.from('awards').select('*', { count: 'exact', head: true })

  console.log('\nFinal database counts:')
  console.log(`  Riders: ${ridersCount}`)
  console.log(`  Routes: ${routesCount}`)
  console.log(`  Events: ${eventsCount}`)
  console.log(`  Results: ${resultsCount}`)
  console.log(`  Awards: ${awardsCount}`)

  sqlite.close()
}

main().catch(console.error)
