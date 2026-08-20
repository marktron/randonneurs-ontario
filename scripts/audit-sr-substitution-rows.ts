// Read-only audit of Super Randonneur rows that only stand up under the old,
// incorrect substitution rule.
//
// Background: SR was briefly understood to allow a longer ride to substitute for
// a shorter one (so 200/300/600/600 was thought to qualify). It does not — SR
// requires the exact set 200 + 300 + 400 + 600 in one season. Two kinds of rows
// may have been created under the old understanding:
//
//   1. Rows written by the retired `backfill-sr-2026-correction.ts` script, which
//      stamped a distinctive note. Those are unambiguously invalid: every one of
//      them was granted *because* of >600 km substitution. If any turn up here,
//      the backfill was applied and the rows should be removed.
//   2. Hand-curated closed-season rows the site's own results cannot account for.
//      These are only a signal, not a verdict — a genuine off-club ride produces
//      the same shortfall, which is why this script never writes.
//
// Closed seasons are frozen by design, so this reports and exits. Nothing is
// inserted, updated, or deleted.
//
// Usage:
//   npx tsx scripts/audit-sr-substitution-rows.ts
//   npx tsx scripts/audit-sr-substitution-rows.ts --env-file=.env.production.local
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
const SR_DISTANCES = [200, 300, 400, 600] as const
// The note stamped by the retired backfill script.
const BACKFILL_NOTE = 'SR backfill 2026-06: prior calc dropped >600 km substitution'

// SR requires the exact set; the number of SRs is the count of the scarcest of
// the four distances. Rides at any other distance never count.
function srCount(distances: number[]): number {
  return Math.min(...SR_DISTANCES.map((d) => distances.filter((x) => x === d).length))
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
      .in('distance_km', SR_DISTANCES)
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

async function fetchRecordedRows(
  awardId: string
): Promise<{ id: string; rider_id: string; season: number; note: string | null }[]> {
  const pageSize = 1000
  let from = 0
  const rows: { id: string; rider_id: string; season: number; note: string | null }[] = []
  for (;;) {
    const { data, error } = await supabase
      .from('rider_awards')
      .select('id, rider_id, season, note')
      .eq('award_id', awardId)
      .lt('season', CURRENT_YEAR)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`fetch rider_awards: ${error.message}`)
    const batch = (data ?? []) as {
      id: string
      rider_id: string
      season: number
      note: string | null
    }[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function fetchRiderNames(riderIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  const pageSize = 1000
  for (let from = 0; from < riderIds.length; from += pageSize) {
    const batch = riderIds.slice(from, from + pageSize)
    const { data, error } = await supabase
      .from('riders')
      .select('id, first_name, last_name')
      .in('id', batch)
    if (error) throw new Error(`fetch rider names: ${error.message}`)
    for (const r of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
      names.set(r.id, `${r.first_name} ${r.last_name}`)
    }
  }
  return names
}

async function main() {
  console.log('Mode: READ-ONLY (this script never writes)')
  console.log(`Current year: ${CURRENT_YEAR} — auditing seasons < ${CURRENT_YEAR}\n`)

  const awardId = await fetchSrAwardId()
  const [results, recordedRows] = await Promise.all([
    fetchAllQualifyingResults(),
    fetchRecordedRows(awardId),
  ])

  const byKey = new Map<string, number[]>()
  for (const r of results) {
    const k = `${r.rider_id}:${r.season}`
    byKey.set(k, [...(byKey.get(k) ?? []), r.distance_km])
  }

  const recordedCounts = new Map<string, number>()
  for (const r of recordedRows) {
    const k = `${r.rider_id}:${r.season}`
    recordedCounts.set(k, (recordedCounts.get(k) ?? 0) + 1)
  }

  const backfillRows = recordedRows.filter((r) => r.note === BACKFILL_NOTE)

  type Shortfall = { riderId: string; season: number; computed: number; recorded: number }
  const shortfalls: Shortfall[] = []
  for (const k of [...recordedCounts.keys()].sort()) {
    const computed = byKey.has(k) ? srCount(byKey.get(k)!) : 0
    const recorded = recordedCounts.get(k) ?? 0
    if (computed < recorded) {
      const [riderId, seasonStr] = k.split(':')
      shortfalls.push({ riderId, season: Number(seasonStr), computed, recorded })
    }
  }

  const names = await fetchRiderNames([
    ...new Set([...backfillRows.map((r) => r.rider_id), ...shortfalls.map((s) => s.riderId)]),
  ])
  const nameOf = (id: string) => names.get(id) ?? `(unknown rider ${id})`

  console.log('--- 1. rows written by the retired backfill script ---')
  if (backfillRows.length === 0) {
    console.log('None. The >600 km substitution backfill was never applied to this database.\n')
  } else {
    for (const r of backfillRows) {
      console.log(`  ${nameOf(r.rider_id).padEnd(40)} season=${r.season}  rider_awards.id=${r.id}`)
    }
    console.log(
      `\n  ${backfillRows.length} row(s). Every one was granted under the substitution rule and is`
    )
    console.log('  invalid. To remove them:\n')
    console.log(`    DELETE FROM rider_awards WHERE note = '${BACKFILL_NOTE}';\n`)
  }

  console.log('--- 2. closed-season SR rows the site results cannot account for ---')
  if (shortfalls.length === 0) {
    console.log('None.\n')
  } else {
    for (const s of shortfalls) {
      console.log(
        `  ${nameOf(s.riderId).padEnd(40)} season=${s.season}  computed=${s.computed} recorded=${s.recorded}`
      )
    }
    console.log('')
  }

  console.log('--- summary ---')
  console.log(`backfill rows:  ${backfillRows.length} (invalid — remove)`)
  console.log(`shortfall pairs: ${shortfalls.length} (review only — off-club rides look identical)`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
