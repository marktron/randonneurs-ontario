// Read-only: counts for 2026 Devil Week.
//   1) distinct riders who participated in >= 1 tagged event
//   2) distinct riders who completed ALL tagged events
// Writes nothing.
//
// Usage:
//   npx tsx scripts/devil-week-2026-counts.ts --env-file=.env.production.local
import './load-env'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws as unknown as WebSocketLikeConstructor },
})

const SEASON = 2026

interface EventRow {
  id: string
  name: string
  distance_km: number
  event_date: string
}
interface ResultRow {
  rider_id: string
  status: string
  finish_time: string | null
  event_id: string
}

async function main() {
  const { data: eventsRaw, error: eErr } = await supabase
    .from('events')
    .select('id, name, distance_km, event_date')
    .eq('collection', 'devil-week')
    .eq('season', SEASON)
  if (eErr) throw new Error(`events: ${eErr.message}`)
  const events = (eventsRaw ?? []) as EventRow[]
  const eventIds = events.map((e) => e.id)

  console.log(`${SEASON} Devil Week — ${eventIds.length} tagged events (collection='devil-week'):`)
  for (const e of events) console.log(`  - ${e.event_date}  ${e.distance_km}km  ${e.name}`)

  const { data: resultsRaw, error: rErr } = await supabase
    .from('results')
    .select('rider_id, status, finish_time, event_id')
    .in('event_id', eventIds)
  if (rErr) throw new Error(`results: ${rErr.message}`)
  const results = (resultsRaw ?? []) as ResultRow[]

  // Participation interpretations
  const anyResult = new Set<string>() // has a result row of any status
  const rodeNotDns = new Set<string>() // status != 'dns' (actually started)
  const finishedAtLeastOne = new Set<string>() // finished >= 1
  const finishedCountByRider = new Map<string, number>()

  for (const r of results) {
    anyResult.add(r.rider_id)
    if (r.status !== 'dns') rodeNotDns.add(r.rider_id)
    if (r.status === 'finished' && r.finish_time != null) {
      finishedAtLeastOne.add(r.rider_id)
      finishedCountByRider.set(r.rider_id, (finishedCountByRider.get(r.rider_id) ?? 0) + 1)
    }
  }

  let completedAll = 0
  for (const c of finishedCountByRider.values()) if (c === eventIds.length) completedAll++

  console.log('\n=== Participation (distinct riders) ===')
  console.log(`  has a result row of any status (incl. DNF/DNS): ${anyResult.size}`)
  console.log(`  actually started (status != DNS):              ${rodeNotDns.size}`)
  console.log(`  finished at least one:                         ${finishedAtLeastOne.size}`)
  console.log(`\n=== Completed ALL ${eventIds.length} events (finished w/ finish_time) ===`)
  console.log(`  ${completedAll}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
