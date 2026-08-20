// Read-only pre-deploy check for the Super Randonneur trigger.
//
// Run this BEFORE deploying 20260820120000 + 20260820120100. Writes nothing.
//
// Why it exists: the reconciler manages only `auto_assigned = true` rows and
// treats manual rows as additive, on the assumption that a manual row means an
// off-club series BEYOND whatever the site can compute. Any SR assigned by hand
// for the current season *before* the trigger existed breaks that assumption:
// the current-season reconcile migration will add an auto row on top of it and
// the rider ends up holding two SRs for one series.
//
// This lists current-season riders where a manual SR overlaps a computable one,
// so those rows can be cleared (or confirmed as genuine off-club extras) first.
//
// Usage:
//   npx tsx scripts/preflight-sr-current-season.ts
//   npx tsx scripts/preflight-sr-current-season.ts --env-file=.env.production.local
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
const SR_DISTANCES = [200, 300, 400, 600] as const

// Mirrors the trigger: the exact set, so the count of the scarcest distance.
function srCount(distances: number[]): number {
  return Math.min(...SR_DISTANCES.map((d) => distances.filter((x) => x === d).length))
}

async function main() {
  console.log('Mode: READ-ONLY (this script never writes)')
  console.log(`Season: ${SEASON}\n`)

  const { data: award, error: awardErr } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'super-randonneur')
    .single()
  if (awardErr) throw new Error(`load SR award: ${awardErr.message}`)
  const awardId = (award as { id: string }).id

  const { data: resultRows, error: resErr } = await supabase
    .from('results')
    .select('rider_id, distance_km, events!inner(event_type)')
    .eq('season', SEASON)
    .eq('status', 'finished')
    .eq('events.event_type', 'brevet')
    .in('distance_km', SR_DISTANCES)
  if (resErr) throw new Error(`fetch results: ${resErr.message}`)

  const byRider = new Map<string, number[]>()
  for (const r of (resultRows ?? []) as unknown as { rider_id: string; distance_km: number }[]) {
    byRider.set(r.rider_id, [...(byRider.get(r.rider_id) ?? []), r.distance_km])
  }

  const { data: awardRows, error: raErr } = await supabase
    .from('rider_awards')
    .select('rider_id, auto_assigned, note')
    .eq('award_id', awardId)
    .eq('season', SEASON)
  if (raErr) throw new Error(`fetch rider_awards: ${raErr.message}`)

  const manual = new Map<string, number>()
  let autoRows = 0
  for (const r of (awardRows ?? []) as { rider_id: string; auto_assigned: boolean }[]) {
    if (r.auto_assigned) autoRows += 1
    else manual.set(r.rider_id, (manual.get(r.rider_id) ?? 0) + 1)
  }

  const riderIds = [...new Set([...byRider.keys(), ...manual.keys()])]
  const names = new Map<string, string>()
  for (let i = 0; i < riderIds.length; i += 1000) {
    const { data, error } = await supabase
      .from('riders')
      .select('id, first_name, last_name')
      .in('id', riderIds.slice(i, i + 1000))
    if (error) throw new Error(`fetch rider names: ${error.message}`)
    for (const r of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
      names.set(r.id, `${r.first_name} ${r.last_name}`)
    }
  }
  const nameOf = (id: string) => names.get(id) ?? `(unknown rider ${id})`

  const overlaps: { riderId: string; manual: number; computed: number; dupes: number }[] = []
  let wouldGrant = 0
  for (const id of riderIds) {
    const computed = byRider.has(id) ? srCount(byRider.get(id)!) : 0
    wouldGrant += computed
    const man = manual.get(id) ?? 0
    if (computed > 0 && man > 0) {
      overlaps.push({ riderId: id, manual: man, computed, dupes: Math.min(man, computed) })
    }
  }

  console.log(`--- what the reconcile migration will grant in ${SEASON} ---`)
  console.log(
    `${wouldGrant} auto SR row(s) across ${riderIds.filter((id) => byRider.has(id) && srCount(byRider.get(id)!) > 0).length} rider(s).`
  )
  console.log(`Auto rows already present: ${autoRows} (should be 0 before the first deploy).\n`)

  console.log('--- manual rows that would be double-counted ---')
  if (overlaps.length === 0) {
    console.log('None. No current-season SR was assigned by hand, so nothing can double up.\n')
  } else {
    for (const o of overlaps) {
      console.log(
        `  ${nameOf(o.riderId).padEnd(40)} manual=${o.manual} computed=${o.computed} -> ${o.dupes} likely duplicate(s)`
      )
    }
    console.log(
      `\n  ${overlaps.length} rider(s), ${overlaps.reduce((n, o) => n + o.dupes, 0)} likely duplicate row(s).`
    )
    console.log('  Confirm each is a genuine off-club extra; otherwise clear the manual row')
    console.log('  before deploying, and let the trigger grant it instead.\n')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
