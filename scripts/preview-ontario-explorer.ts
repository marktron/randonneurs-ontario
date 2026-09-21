// Read-only preview / pre-deploy check for the Ontario Explorer trigger.
//
// Rule (mirrors reconcile_ontario_explorer_for_rider_season): at least one
// finished `brevet` result of 200 km or more in each of the four chapters
// (Toronto, Huron, Ottawa, Simcoe) in a calendar year. Populaires, flèches and
// permanents never count. Writes nothing.
//
// Run this against production BEFORE deploying 20260921120000 + 20260921120100
// to confirm the expected recipients. Any manual (auto=false) current-season
// row listed under "existing rider_awards" for a rider who also appears under
// EARNED will be doubled by the backfill; clear it first or confirm it is a
// genuine extra.
//
// Usage:
//   npx tsx scripts/preview-ontario-explorer.ts
//   npx tsx scripts/preview-ontario-explorer.ts --season=2025
//   npx tsx scripts/preview-ontario-explorer.ts --env-file=.env.production.local
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

const seasonArg = process.argv.slice(2).find((a) => a.startsWith('--season='))
const SEASON = seasonArg ? Number(seasonArg.split('=')[1]) : new Date().getFullYear()
const REQUIRED = ['toronto', 'huron', 'ottawa', 'simcoe'] as const

type Chapter = { id: string; slug: string; name: string }
type ResultRow = {
  rider_id: string
  distance_km: number
  events: {
    name: string
    event_type: string
    chapter_id: string
    distance_km: number
    event_date: string
  }
  riders: { first_name: string; last_name: string; hidden: boolean }
}
type RiderEntry = { name: string; hidden: boolean; chapters: Map<string, string[]> }

async function main() {
  console.log('Mode: READ-ONLY (this script never writes)')
  console.log(`DB: ${url}`)
  console.log(`Season: ${SEASON}\n`)

  const { data: chapters, error: cErr } = await supabase
    .from('chapters')
    .select('id, slug, name')
    .order('name')
  if (cErr) throw new Error(`load chapters: ${cErr.message}`)
  console.log('--- chapters ---')
  for (const c of chapters as Chapter[]) console.log(`  ${c.slug.padEnd(12)} ${c.name}`)
  const chapterSlug = new Map((chapters as Chapter[]).map((c) => [c.id, c.slug]))

  const { data: award, error: aErr } = await supabase
    .from('awards')
    .select('id, slug, title, award_type')
    .eq('slug', 'ontario-explorer')
    .maybeSingle()
  if (aErr) throw new Error(`load award: ${aErr.message}`)
  console.log('\n--- award row ---')
  console.log(award ?? '(no ontario-explorer award row!)')

  if (award) {
    const { data: existing, error: eErr } = await supabase
      .from('rider_awards')
      .select('season, auto_assigned, note, riders(first_name, last_name)')
      .eq('award_id', award.id)
      .in('season', [SEASON - 1, SEASON])
      .order('season')
    if (eErr) throw new Error(`load rider_awards: ${eErr.message}`)
    console.log(`\n--- existing ontario-explorer rider_awards (${SEASON - 1}, ${SEASON}) ---`)
    const ex = (existing ?? []) as unknown as {
      season: number
      auto_assigned: boolean
      note: string | null
      riders: { first_name: string; last_name: string }
    }[]
    if (ex.length === 0) console.log('  (none)')
    for (const r of ex) {
      console.log(
        `  ${r.season}  ${`${r.riders.first_name} ${r.riders.last_name}`.padEnd(30)} auto=${r.auto_assigned}  ${r.note ?? ''}`
      )
    }
  }

  const { data: results, error: rErr } = await supabase
    .from('results')
    .select(
      'rider_id, distance_km, events!inner(name, event_type, chapter_id, distance_km, event_date), riders!inner(first_name, last_name, hidden)'
    )
    .eq('season', SEASON)
    .eq('status', 'finished')
  if (rErr) throw new Error(`load results: ${rErr.message}`)
  const rows = (results ?? []) as unknown as ResultRow[]
  console.log(`\nfinished results in ${SEASON}: ${rows.length}`)

  // Edge-case audit: event types present, and any "brevet" under 200 km.
  const typeCounts: Record<string, number> = {}
  const brevetUnder200: ResultRow[] = []
  for (const r of rows) {
    typeCounts[r.events.event_type] = (typeCounts[r.events.event_type] ?? 0) + 1
    if (r.events.event_type === 'brevet' && (r.distance_km < 200 || r.events.distance_km < 200)) {
      brevetUnder200.push(r)
    }
  }
  console.log('by event_type:', typeCounts)
  console.log(`brevet results under 200 km: ${brevetUnder200.length}`)
  for (const r of brevetUnder200.slice(0, 10)) {
    console.log(
      `   ${r.events.name} ${r.events.event_date} event=${r.events.distance_km} result=${r.distance_km}`
    )
  }

  const byRider = new Map<string, RiderEntry>()
  for (const r of rows) {
    if (r.events.event_type !== 'brevet' || r.distance_km < 200) continue
    const slug = chapterSlug.get(r.events.chapter_id) ?? `?${r.events.chapter_id}`
    const entry = byRider.get(r.rider_id) ?? {
      name: `${r.riders.first_name} ${r.riders.last_name}`,
      hidden: r.riders.hidden,
      chapters: new Map<string, string[]>(),
    }
    entry.chapters.set(slug, [
      ...(entry.chapters.get(slug) ?? []),
      `${r.events.name} (${r.events.distance_km} km, ${r.events.event_date})`,
    ])
    byRider.set(r.rider_id, entry)
  }

  const slugsSeen = new Set<string>()
  for (const e of byRider.values()) for (const s of e.chapters.keys()) slugsSeen.add(s)
  console.log('\nchapter slugs seen on finished brevets:', [...slugsSeen].sort().join(', '))

  const earned: (RiderEntry & { extra: string[] })[] = []
  const threeOfFour: (RiderEntry & { missing: string[] })[] = []
  for (const e of byRider.values()) {
    const have = REQUIRED.filter((s) => e.chapters.has(s))
    const extra = [...e.chapters.keys()].filter((s) => !(REQUIRED as readonly string[]).includes(s))
    if (have.length === 4) earned.push({ ...e, extra })
    else if (have.length === 3) {
      threeOfFour.push({ ...e, missing: REQUIRED.filter((s) => !e.chapters.has(s)) })
    }
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

  console.log(`\n=== EARNED Ontario Explorer ${SEASON}: ${earned.length} rider(s) ===`)
  for (const e of earned.sort(byName)) {
    console.log(`\n  ${e.name}${e.hidden ? ' [HIDDEN]' : ''}`)
    for (const s of REQUIRED) console.log(`     ${s.padEnd(8)} ${e.chapters.get(s)!.join(' | ')}`)
    if (e.extra.length) console.log(`     (also rode in: ${e.extra.join(', ')})`)
  }

  console.log(`\n=== 3 of 4 chapters: ${threeOfFour.length} rider(s) ===`)
  for (const e of threeOfFour.sort(byName)) {
    console.log(`  ${e.name.padEnd(30)} missing: ${e.missing.join(', ')}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
