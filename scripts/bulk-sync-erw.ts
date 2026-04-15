/**
 * One-time script to bulk sync scheduled events to Epic Ride Weather.
 *
 * Reads from the production database, creates ERW events via their API,
 * and writes erw_event_id + erw_canonical_url back to the database.
 *
 * Usage:
 *   1. Pull production env vars: vercel env pull .env.production.local
 *   2. Run: npx tsx --env-file=.env.production.local scripts/bulk-sync-erw.ts
 *
 * Use --dry-run to preview without making changes:
 *   npx tsx --env-file=.env.production.local scripts/bulk-sync-erw.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import { createErwEvent } from '../lib/erw/client'

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

  // Fetch future scheduled events with RWGPS routes, without ERW sync (excluding permanents)
  const { data: events, error } = await supabase
    .from('events')
    .select(
      'id, slug, name, description, distance_km, event_date, start_time, event_type, route_id, routes!inner(rwgps_id)'
    )
    .eq('status', 'scheduled')
    .is('erw_event_id', null)
    .neq('event_type', 'permanent')
    .not('routes.rwgps_id', 'is', null)
    .gte('event_date', today)
    .order('event_date', { ascending: true })

  if (error) {
    console.error('Failed to fetch events:', error.message)
    process.exit(1)
  }

  if (!events || events.length === 0) {
    console.log('No events to sync.')
    process.exit(0)
  }

  console.log(`Found ${events.length} event(s) to sync:\n`)
  for (const event of events) {
    console.log(`  ${event.event_date}  ${event.name} (${event.distance_km}km ${event.event_type})`)
  }
  console.log()

  if (dryRun) {
    console.log('Dry run complete. Run without --dry-run to sync.')
    process.exit(0)
  }

  let synced = 0
  let failed = 0

  for (const event of events) {
    const routes = event.routes as unknown as { rwgps_id: string }
    const rwgpsId = routes.rwgps_id

    const erwResult = await createErwEvent({
      name: event.name,
      description: event.description || '',
      distanceKm: event.distance_km,
      eventDate: event.event_date,
      startTime: event.start_time || null,
      slug: event.slug,
      rwgpsId,
    })

    if (erwResult.success && erwResult.data) {
      await supabase
        .from('events')
        .update({
          erw_event_id: erwResult.data.erwEventId,
          erw_canonical_url: erwResult.data.canonicalUrl,
        })
        .eq('id', event.id)

      console.log(`  ✓ ${event.name} → ${erwResult.data.canonicalUrl}`)
      synced++
    } else {
      console.error(`  ✗ ${event.name}: ${erwResult.error}`)
      failed++
    }
  }

  console.log(`\nDone. Synced: ${synced}, Failed: ${failed}`)

  if (failed > 0) {
    process.exit(1)
  }
}

main()
