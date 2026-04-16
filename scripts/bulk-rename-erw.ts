/**
 * One-time script to rename synced ERW events by appending the event distance.
 *
 * For each event with an erw_event_id, updates the ERW event name to
 * "{name} {distance_km}" (e.g., "Gentle Start" → "Gentle Start 200").
 * Skips events whose name already ends with the distance.
 *
 * Usage:
 *   1. Pull production env vars: vercel env pull .env.production.local
 *   2. Run: npx tsx --env-file=.env.production.local scripts/bulk-rename-erw.ts
 *
 * Use --dry-run to preview without making changes:
 *   npx tsx --env-file=.env.production.local scripts/bulk-rename-erw.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { updateErwEvent } from '../lib/erw/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

if (!process.env.EPIC_RIDE_WEATHER_CLIENT_ID || !process.env.EPIC_RIDE_WEATHER_SECRET) {
  console.error('Missing EPIC_RIDE_WEATHER_CLIENT_ID or EPIC_RIDE_WEATHER_SECRET')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  if (dryRun) {
    console.log('=== DRY RUN — no changes will be made ===\n')
  }

  console.log(`Database: ${supabaseUrl}\n`)

  const today = new Date().toISOString().split('T')[0]

  // Fetch future scheduled events that have been synced to ERW
  const { data: events, error } = await supabase
    .from('events')
    .select(
      'id, slug, name, description, distance_km, event_date, start_time, event_type, erw_event_id, route_id, routes(rwgps_id)'
    )
    .eq('status', 'scheduled')
    .not('erw_event_id', 'is', null)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  if (error) {
    console.error('Failed to fetch events:', error.message)
    process.exit(1)
  }

  if (!events || events.length === 0) {
    console.log('No events to rename.')
    process.exit(0)
  }

  const renames = events
    .map((event) => {
      const suffix = ` ${event.distance_km}`
      const alreadyRenamed = event.name.endsWith(suffix)
      const newName = alreadyRenamed ? event.name : `${event.name}${suffix}`
      return { event, newName, alreadyRenamed }
    })
    .filter((r) => !r.alreadyRenamed)

  const skipped = events.length - renames.length

  console.log(`Found ${events.length} synced event(s) (${skipped} already renamed):\n`)
  for (const { event, newName } of renames) {
    console.log(`  ${event.event_date}  "${event.name}" → "${newName}"`)
  }
  console.log()

  if (renames.length === 0) {
    console.log('Nothing to do.')
    process.exit(0)
  }

  if (dryRun) {
    console.log('Dry run complete. Run without --dry-run to rename.')
    process.exit(0)
  }

  let renamed = 0
  let failed = 0

  for (const { event, newName } of renames) {
    const routes = event.routes as unknown as { rwgps_id: string | null } | null
    const rwgpsId = routes?.rwgps_id ?? null

    const result = await updateErwEvent(event.erw_event_id as string, {
      name: newName,
      description: event.description || '',
      distanceKm: event.distance_km,
      eventDate: event.event_date,
      startTime: event.start_time || null,
      slug: event.slug,
      rwgpsId,
    })

    if (result.success) {
      await supabase.from('events').update({ name: newName }).eq('id', event.id)
      console.log(`  ✓ ${newName}`)
      renamed++
    } else {
      console.error(`  ✗ ${event.name}: ${result.error}`)
      failed++
    }
  }

  console.log(`\nDone. Renamed: ${renamed}, Failed: ${failed}`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()
