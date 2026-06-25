// Read-only preview of who would receive Completed Devil Week for the current
// season, based on already-submitted results. Mirrors the trigger's earning
// rule (>= 4 tagged `devil-week` events that season, all finished WITH a
// finish_time). Writes nothing.
//
// Usage:
//   npx tsx scripts/preview-devil-week-awards.ts
//   npx tsx scripts/preview-devil-week-awards.ts --env-file=.env.production.local
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
  // Node 20 has no global WebSocket; realtime-js needs one even REST-only.
  realtime: { transport: ws as unknown as WebSocketLikeConstructor },
})

const SEASON = new Date().getFullYear()

interface EventRow {
  id: string
  name: string
  distance_km: number
}
interface ResultRow {
  rider_id: string
  status: string
  finish_time: string | null
  event_id: string
}
interface RiderRow {
  id: string
  first_name: string
  last_name: string
}

async function main() {
  const { data: eventsRaw, error: eErr } = await supabase
    .from('events')
    .select('id, name, distance_km')
    .eq('collection', 'devil-week')
    .eq('season', SEASON)
  if (eErr) throw new Error(`events: ${eErr.message}`)
  const events = (eventsRaw ?? []) as EventRow[]
  const eventIds = events.map((e) => e.id)

  console.log(`${SEASON} Devil Week — ${eventIds.length} tagged events:`)
  for (const e of events) console.log(`  - ${e.distance_km}km  ${e.name}`)
  if (eventIds.length < 4) {
    console.log('\nFewer than 4 tagged events → no award is possible. Nothing to backfill.')
    return
  }

  const { data: resultsRaw, error: rErr } = await supabase
    .from('results')
    .select('rider_id, status, finish_time, event_id')
    .in('event_id', eventIds)
  if (rErr) throw new Error(`results: ${rErr.message}`)
  const results = (resultsRaw ?? []) as ResultRow[]

  const totalByRider = new Map<string, number>()
  const qualByRider = new Map<string, number>()
  for (const r of results) {
    totalByRider.set(r.rider_id, (totalByRider.get(r.rider_id) ?? 0) + 1)
    if (r.status === 'finished' && r.finish_time != null) {
      qualByRider.set(r.rider_id, (qualByRider.get(r.rider_id) ?? 0) + 1)
    }
  }

  const completed: string[] = []
  const partial: { id: string; q: number }[] = []
  for (const rid of totalByRider.keys()) {
    const q = qualByRider.get(rid) ?? 0
    if (q === eventIds.length) completed.push(rid)
    else partial.push({ id: rid, q })
  }

  const allIds = [...totalByRider.keys()]
  const { data: ridersRaw } = await supabase
    .from('riders')
    .select('id, first_name, last_name')
    .in('id', allIds)
  const riders = (ridersRaw ?? []) as RiderRow[]
  const nameOf = (id: string) => {
    const r = riders.find((x) => x.id === id)
    return r ? `${r.first_name} ${r.last_name}` : id
  }

  const { data: awardRaw, error: aErr } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'completed-devil-week')
    .single()
  if (aErr) throw new Error(`award: ${aErr.message}`)
  const awardId = (awardRaw as { id: string }).id

  const { data: existingRaw } = await supabase
    .from('result_awards')
    .select('result_id, results!inner(rider_id, season)')
    .eq('award_id', awardId)
    .eq('results.season', SEASON)
  const alreadyAwarded = new Set(
    ((existingRaw ?? []) as unknown as { results: { rider_id: string } }[]).map(
      (x) => x.results.rider_id
    )
  )

  console.log(`\n=== Would be awarded Completed Devil Week (${completed.length}) ===`)
  for (const id of completed.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
    console.log(`  ✓ ${nameOf(id)}${alreadyAwarded.has(id) ? '  (already recorded)' : ''}`)
  }
  console.log(`\n=== Partial — finished some, not all ${eventIds.length} (${partial.length}) ===`)
  for (const p of partial.sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)))) {
    console.log(`  – ${nameOf(p.id)}: ${p.q}/${eventIds.length} qualifying`)
  }
  console.log(`\nAlready recorded for ${SEASON}: ${alreadyAwarded.size}`)
  console.log(`Net new awards the backfill would create: ${completed.length - alreadyAwarded.size}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
