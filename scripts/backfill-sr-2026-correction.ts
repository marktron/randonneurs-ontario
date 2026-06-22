// One-time correction for the >600 km substitution bug in SR award calculation.
//
// Background: a prior version of srCount() did not count rides longer than 600 km
// as substitutes for shorter required distances (400, 300, 200 km). This caused 34
// closed-season (rider, season) pairs to be missing SR awards. The club confirmed
// these awards are real. The forward-only trigger does not touch closed seasons, so
// this script corrects them once.
//
// Behaviour:
//   - DRY-RUN by default (prints planned inserts, writes nothing to the DB).
//   - Pass --apply to insert the missing rider_awards rows.
//   - NEVER deletes rows (negative deltas — off-club overages — are silently ignored).
//   - Safe to re-run: delta is recomputed live each time, so already-fixed pairs
//     yield delta 0 and nothing is inserted.
//
// Usage:
//   npx tsx scripts/backfill-sr-2026-correction.ts                             # dry-run
//   npx tsx scripts/backfill-sr-2026-correction.ts --env-file=.env.production.local  # dry-run prod
//   npx tsx scripts/backfill-sr-2026-correction.ts --apply                     # write
import './load-env'
import { createClient } from '@supabase/supabase-js'
import type { WebSocketLikeConstructor } from '@supabase/realtime-js'
import ws from 'ws'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
// Node 20 lacks native WebSocket; ws polyfill required by @supabase/realtime-js.
// The cast is safe: ws fulfils the WebSocketLikeConstructor contract at runtime.
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws as unknown as WebSocketLikeConstructor },
})

const CURRENT_YEAR = new Date().getFullYear()
const APPLY = process.argv.includes('--apply')

function srCount(distances: number[]): number {
  const n = (t: number) => distances.filter((d) => d >= t).length
  return Math.min(n(600), Math.floor(n(400) / 2), Math.floor(n(300) / 3), Math.floor(n(200) / 4))
}

async function fetchSrAwardId(): Promise<string> {
  const { data, error } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'super-randonneur')
    .single()
  if (error) throw new Error(`load SR award: ${error.message}`)
  if (!data)
    throw new Error('SR award not found — slug "super-randonneur" missing from awards table')
  return (data as { id: string }).id
}

async function fetchAllQualifyingResults(): Promise<
  { rider_id: string; season: number; distance_km: number }[]
> {
  const pageSize = 1000
  let from = 0
  const rows: { rider_id: string; season: number; distance_km: number }[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('results')
      .select('rider_id, season, distance_km, events!inner(event_type)')
      .eq('status', 'finished')
      .eq('events.event_type', 'brevet')
      .gte('distance_km', 200)
      .lt('season', CURRENT_YEAR)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetch results: ${error.message}`)
    const batch = (data ?? []) as unknown as {
      rider_id: string
      season: number
      distance_km: number
    }[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function fetchRecordedCounts(awardId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('rider_awards')
      .select('rider_id, season')
      .eq('award_id', awardId)
      .lt('season', CURRENT_YEAR)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetch rider_awards: ${error.message}`)
    const batch = (data ?? []) as { rider_id: string; season: number }[]
    for (const r of batch) {
      const k = `${r.rider_id}:${r.season}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    if (batch.length < pageSize) break
    from += pageSize
  }
  return counts
}

async function fetchRiderNames(riderIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (riderIds.length === 0) return names
  const pageSize = 1000
  let from = 0
  for (;;) {
    const batch = riderIds.slice(from, from + pageSize)
    if (batch.length === 0) break
    const { data, error } = await supabase
      .from('riders')
      .select('id, first_name, last_name')
      .in('id', batch)
    if (error) throw new Error(`fetch rider names: ${error.message}`)
    for (const r of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
      names.set(r.id, `${r.first_name} ${r.last_name}`)
    }
    from += pageSize
    if (batch.length < pageSize) break
  }
  return names
}

async function main() {
  console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY-RUN (no writes)'}`)
  console.log(`Current year: ${CURRENT_YEAR} — processing seasons < ${CURRENT_YEAR}\n`)

  const awardId = await fetchSrAwardId()
  const results = await fetchAllQualifyingResults()
  const recorded = await fetchRecordedCounts(awardId)

  // Group distances by rider:season.
  const byKey = new Map<string, number[]>()
  for (const r of results) {
    const k = `${r.rider_id}:${r.season}`
    const arr = byKey.get(k) ?? []
    arr.push(r.distance_km)
    byKey.set(k, arr)
  }

  // Compute deltas (positive only).
  type Delta = { riderId: string; season: number; delta: number }
  const deltas: Delta[] = []

  const keys = new Set<string>([...byKey.keys(), ...recorded.keys()])
  for (const k of [...keys].sort()) {
    const computed = byKey.has(k) ? srCount(byKey.get(k)!) : 0
    const rec = recorded.get(k) ?? 0
    const delta = computed - rec
    if (delta > 0) {
      const [riderId, seasonStr] = k.split(':')
      deltas.push({ riderId, season: Number(seasonStr), delta })
    }
  }

  if (deltas.length === 0) {
    console.log('No missing SR awards found — nothing to do.')
    return
  }

  // Fetch names for display.
  const uniqueRiderIds = [...new Set(deltas.map((d) => d.riderId))]
  const names = await fetchRiderNames(uniqueRiderIds)

  // Report planned inserts.
  let totalRows = 0
  for (const { riderId, season, delta } of deltas) {
    const name = names.get(riderId) ?? `(unknown rider ${riderId})`
    console.log(`  ${name.padEnd(40)} season=${season}  delta=+${delta}`)
    totalRows += delta
  }

  console.log(
    `\nPlanned: ${totalRows} row(s) to insert across ${deltas.length} (rider, season) pair(s).`
  )

  if (!APPLY) {
    console.log('\nDry-run complete. Pass --apply to write.')
    return
  }

  // Build insert rows.
  const NOTE = 'SR backfill 2026-06: prior calc dropped >600 km substitution'
  const insertRows: {
    rider_id: string
    award_id: string
    season: number
    auto_assigned: boolean
    note: string
  }[] = []

  for (const { riderId, season, delta } of deltas) {
    for (let i = 0; i < delta; i++) {
      insertRows.push({
        rider_id: riderId,
        award_id: awardId,
        season,
        auto_assigned: false,
        note: NOTE,
      })
    }
  }

  const { error } = await supabase.from('rider_awards').insert(insertRows)
  if (error) throw new Error(`insert rider_awards: ${error.message}`)

  console.log(`\nInserted ${insertRows.length} row(s) into rider_awards.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
