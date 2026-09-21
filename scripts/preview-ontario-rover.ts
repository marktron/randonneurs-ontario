// Read-only preview for the Ontario Rover award.
//
// Rule (award text): accumulate 1200 km of permanents, over any period, with at
// least two of those permanents being 300 km or more. Can be earned multiple
// times. Only finished `permanent` results count.
//
// Because "over any period" spans seasons, this script evaluates two candidate
// readings against the hand-assigned history so the reconciler rule can be
// chosen with evidence:
//
//   Greedy windows: walk the rider's finished permanents in date order,
//     accumulating km and the count of 300+ rides. When both thresholds are
//     met, award in the season of the ride that closed the window, and start a
//     fresh window from the next ride. Nothing carries over.
//
//   Global count: LEAST(floor(total_km / 1200), floor(count_300plus / 2)) over
//     the rider's whole history, regardless of ordering.
//
// Writes nothing.
//
// Usage:
//   npx tsx scripts/preview-ontario-rover.ts
//   npx tsx scripts/preview-ontario-rover.ts --env-file=.env.production.local
import './load-env'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CURRENT_SEASON = new Date().getFullYear()
const KM_TARGET = 1200
const LONG_KM = 300
const LONG_NEEDED = 2

type ResultRow = {
  rider_id: string
  distance_km: number
  season: number
  events: { name: string; event_date: string }
  riders: { first_name: string; last_name: string; hidden: boolean }
}
type Ride = { km: number; season: number; date: string; name: string }
type Rider = { name: string; hidden: boolean; rides: Ride[] }

function greedyWindows(
  rides: Ride[]
): { season: number; km: number; long: number; closer: string }[] {
  const awards: { season: number; km: number; long: number; closer: string }[] = []
  let km = 0
  let long = 0
  for (const r of rides) {
    km += r.km
    if (r.km >= LONG_KM) long += 1
    if (km >= KM_TARGET && long >= LONG_NEEDED) {
      awards.push({ season: r.season, km, long, closer: `${r.name} ${r.date}` })
      km = 0
      long = 0
    }
  }
  return awards
}

function globalCount(rides: Ride[]): number {
  const total = rides.reduce((n, r) => n + r.km, 0)
  const long = rides.filter((r) => r.km >= LONG_KM).length
  return Math.min(Math.floor(total / KM_TARGET), Math.floor(long / LONG_NEEDED))
}

async function main() {
  console.log('Mode: READ-ONLY (this script never writes)')
  console.log(`DB: ${url}`)
  console.log(`Current season: ${CURRENT_SEASON}\n`)

  const { data: award, error: aErr } = await supabase
    .from('awards')
    .select('id, slug, title, award_type')
    .eq('slug', 'ontario-rover')
    .maybeSingle()
  if (aErr) throw new Error(`load award: ${aErr.message}`)
  if (!award) throw new Error('no ontario-rover award row')

  const { data: existing, error: eErr } = await supabase
    .from('rider_awards')
    .select('rider_id, season, auto_assigned, note')
    .eq('award_id', award.id)
  if (eErr) throw new Error(`load rider_awards: ${eErr.message}`)
  const existingByRider = new Map<
    string,
    { season: number; auto: boolean; note: string | null }[]
  >()
  for (const r of (existing ?? []) as {
    rider_id: string
    season: number
    auto_assigned: boolean
    note: string | null
  }[]) {
    existingByRider.set(r.rider_id, [
      ...(existingByRider.get(r.rider_id) ?? []),
      { season: r.season, auto: r.auto_assigned, note: r.note },
    ])
  }

  const { data: results, error: rErr } = await supabase
    .from('results')
    .select(
      'rider_id, distance_km, season, events!inner(name, event_date, event_type), riders!inner(first_name, last_name, hidden)'
    )
    .eq('status', 'finished')
    .eq('events.event_type', 'permanent')
    .order('event_date', { referencedTable: 'events' })
  if (rErr) throw new Error(`load results: ${rErr.message}`)
  const rows = (results ?? []) as unknown as ResultRow[]
  console.log(`finished permanent results (all time): ${rows.length}`)
  const nullDist = rows.filter((r) => r.distance_km == null).length
  console.log(`  with NULL distance_km: ${nullDist}`)
  const seasonMismatch = rows.filter((r) => Number(r.events.event_date.slice(0, 4)) !== r.season)
  console.log(`  where results.season != year(event_date): ${seasonMismatch.length}`)

  const riders = new Map<string, Rider>()
  for (const r of rows) {
    const entry = riders.get(r.rider_id) ?? {
      name: `${r.riders.first_name} ${r.riders.last_name}`,
      hidden: r.riders.hidden,
      rides: [],
    }
    entry.rides.push({
      km: r.distance_km ?? 0,
      season: r.season,
      date: r.events.event_date,
      name: r.events.name,
    })
    riders.set(r.rider_id, entry)
  }
  for (const e of riders.values()) e.rides.sort((a, b) => a.date.localeCompare(b.date))

  // Riders with an existing award but no permanent results at all (data gaps).
  const ghosts = [...existingByRider.keys()].filter((id) => !riders.has(id))
  if (ghosts.length) {
    const { data } = await supabase
      .from('riders')
      .select('id, first_name, last_name')
      .in('id', ghosts)
    console.log(
      `\n--- existing Rover rows for riders with NO permanent results on site: ${ghosts.length} ---`
    )
    for (const g of (data ?? []) as { id: string; first_name: string; last_name: string }[]) {
      const ex = existingByRider.get(g.id)!
      console.log(
        `  ${`${g.first_name} ${g.last_name}`.padEnd(30)} seasons: ${ex.map((x) => x.season).join(', ')}`
      )
    }
  }

  console.log('\n=== history check: existing rows vs candidate rules ===')
  console.log('(one line per rider with any existing row or any computed award)\n')
  const seasonList = (xs: number[]) => (xs.length ? xs.sort().join(',') : '-')
  let agreeGreedy = 0
  let agreeGlobal = 0
  let considered = 0
  const rows2: string[] = []
  for (const [id, rider] of riders) {
    const ex = existingByRider.get(id) ?? []
    const greedy = greedyWindows(rider.rides)
    const global = globalCount(rider.rides)
    if (ex.length === 0 && greedy.length === 0 && global === 0) continue
    considered += 1
    const exSeasons = ex.map((x) => x.season)
    const gSeasons = greedy.map((g) => g.season)
    const greedyMatch = seasonList([...exSeasons]) === seasonList([...gSeasons])
    const globalMatch = ex.length === global
    if (greedyMatch) agreeGreedy += 1
    if (globalMatch) agreeGlobal += 1
    const total = rider.rides.reduce((n, r) => n + r.km, 0)
    const long = rider.rides.filter((r) => r.km >= LONG_KM).length
    rows2.push(
      `  ${rider.name.padEnd(28)} existing=${seasonList([...exSeasons]).padEnd(20)} greedy=${seasonList([...gSeasons]).padEnd(20)} global=${global}  [${total} km, ${long}x300+]${greedyMatch ? '' : '  <-- greedy differs'}${globalMatch ? '' : '  <-- global differs'}`
    )
  }
  for (const l of rows2.sort()) console.log(l)
  console.log(
    `\n  riders considered: ${considered}; greedy matches existing: ${agreeGreedy}; global matches existing: ${agreeGlobal}`
  )

  console.log('\n=== historical windows (prior seasons) with no matching row ===')
  console.log('(review, then paste into psql if these should be restored; never run blindly)\n')
  const missingSql: string[] = []
  for (const [id, rider] of riders) {
    const greedy = greedyWindows(rider.rides).filter((g) => g.season < CURRENT_SEASON)
    const ex = existingByRider.get(id) ?? []
    const bySeason = new Map<number, number>()
    for (const g of greedy) bySeason.set(g.season, (bySeason.get(g.season) ?? 0) + 1)
    for (const [season, n] of bySeason) {
      const have = ex.filter((x) => x.season === season).length
      for (let i = have; i < n; i++) {
        const closer = greedy.filter((g) => g.season === season)[i]
        missingSql.push(
          `-- ${rider.name}, ${season}, closed by ${closer.closer} (${closer.km} km, ${closer.long}x300+)\n` +
            `INSERT INTO rider_awards (rider_id, award_id, season, auto_assigned, note) VALUES ('${id}', '${award.id}', ${season}, false, 'Restored from replay of on-site permanents');`
        )
      }
    }
  }
  if (missingSql.length === 0) console.log('  (none)')
  for (const l of missingSql.sort()) console.log(l)

  console.log(`\n=== ${CURRENT_SEASON}: awards the greedy rule closes this season ===`)
  let any = false
  for (const [id, rider] of riders) {
    const greedy = greedyWindows(rider.rides).filter((g) => g.season === CURRENT_SEASON)
    if (greedy.length === 0) continue
    any = true
    const ex = (existingByRider.get(id) ?? []).filter((x) => x.season === CURRENT_SEASON)
    console.log(
      `  ${rider.name.padEnd(28)} ${greedy.length} award(s), existing ${CURRENT_SEASON} rows: ${ex.length}`
    )
    for (const g of greedy) console.log(`     closed by ${g.closer} (${g.km} km, ${g.long}x300+)`)
  }
  if (!any) console.log('  (none)')

  console.log(`\n=== ${CURRENT_SEASON}: open windows (progress toward the next Rover) ===`)
  const open: string[] = []
  for (const rider of riders.values()) {
    if (!rider.rides.some((r) => r.season === CURRENT_SEASON)) continue
    let km = 0
    let long = 0
    for (const r of rider.rides) {
      km += r.km
      if (r.km >= LONG_KM) long += 1
      if (km >= KM_TARGET && long >= LONG_NEEDED) {
        km = 0
        long = 0
      }
    }
    if (km > 0)
      open.push(
        `  ${rider.name.padEnd(28)} ${String(km).padStart(5)} km, ${long}x300+ in the open window`
      )
  }
  for (const l of open.sort()) console.log(l)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
