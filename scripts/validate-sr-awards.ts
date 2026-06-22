// Read-only validation of the Super Randonneur formula against closed seasons.
// For every (rider, season < current calendar year), compare recorded SR rows
// to the computed SR count. computed <= recorded is expected (off-club rides);
// computed > recorded is a red flag.
//
// Usage:
//   npx tsx scripts/validate-sr-awards.ts
//   npx tsx scripts/validate-sr-awards.ts --env-file=.env.production.local
import './load-env'
import { createClient } from '@supabase/supabase-js'
import ws from 'ws'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

const CURRENT_YEAR = new Date().getFullYear()

function srCount(distances: number[]): number {
  const n = (t: number) => distances.filter((d) => d >= t).length
  return Math.min(n(600), Math.floor(n(400) / 2), Math.floor(n(300) / 3), Math.floor(n(200) / 4))
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

async function fetchSrAwardId(): Promise<string> {
  const { data, error } = await supabase
    .from('awards')
    .select('id')
    .eq('slug', 'super-randonneur')
    .single()
  if (error) throw new Error(`load SR award: ${error.message}`)
  return (data as { id: string }).id
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

async function main() {
  const awardId = await fetchSrAwardId()
  const results = await fetchAllQualifyingResults()
  const recorded = await fetchRecordedCounts(awardId)

  // Group distances by rider:season and compute SR count.
  const byKey = new Map<string, number[]>()
  for (const r of results) {
    const k = `${r.rider_id}:${r.season}`
    const arr = byKey.get(k) ?? []
    arr.push(r.distance_km)
    byKey.set(k, arr)
  }

  const keys = new Set<string>([...byKey.keys(), ...recorded.keys()])
  let redFlags = 0
  let shortfalls = 0
  let matches = 0

  for (const k of [...keys].sort()) {
    const computed = byKey.has(k) ? srCount(byKey.get(k)!) : 0
    const rec = recorded.get(k) ?? 0
    if (computed === rec) {
      matches += 1
    } else if (computed > rec) {
      redFlags += 1
      console.log(`RED FLAG  ${k}  computed=${computed} recorded=${rec}`)
    } else {
      shortfalls += 1
      console.log(`shortfall ${k}  computed=${computed} recorded=${rec} (off-club?)`)
    }
  }

  console.log('\n--- summary ---')
  console.log(`matches:    ${matches}`)
  console.log(`shortfalls: ${shortfalls} (expected — off-club rides)`)
  console.log(`RED FLAGS:  ${redFlags} (computed > recorded — investigate)`)
  if (redFlags > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
