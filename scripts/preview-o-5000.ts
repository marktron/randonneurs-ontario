// Read-only preview / pre-deploy check for the O-5000 trigger.
//
// Rule: at least 5000 km of finished results (brevets, populaires, permanents,
// flèches) in a calendar year, on events ridden in Ontario. The "other" chapter
// holds two kinds of event: the annual club Flèche (in Ontario, counts) and
// Paris-Brest-Paris (abroad, does not). So a result is excluded only when its
// event is under "other" AND is not a flèche. Distance comes from
// results.distance_km, which is the per-rider distance and handles flèches
// correctly. Writes nothing.
//
// Run this against production BEFORE deploying the O-5000 trigger migrations to
// confirm the expected recipients. Any manual (auto=false) current-season row
// listed under "existing rider_awards" for a rider who also appears under
// EARNED will be doubled by the backfill; clear it first or confirm it is a
// genuine extra.
//
// Usage:
//   npx tsx scripts/preview-o-5000.ts
//   npx tsx scripts/preview-o-5000.ts --season=2025
//   npx tsx scripts/preview-o-5000.ts --env-file=.env.production.local
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
const THRESHOLD = 5000
const NEAR_MISS = 4000
const EXCLUDED_CHAPTER = 'other'
const isExcluded = (chapterSlug: string, eventType: string) =>
  chapterSlug === EXCLUDED_CHAPTER && eventType !== 'fleche'

type Chapter = { id: string; slug: string; name: string }
type ResultRow = {
  rider_id: string
  distance_km: number
  events: { name: string; event_type: string; chapter_id: string; event_date: string }
  riders: { first_name: string; last_name: string; hidden: boolean }
}
type RiderEntry = {
  name: string
  hidden: boolean
  qualifying: number
  excluded: number
  byChapter: Map<string, number>
  byType: Map<string, number>
  excludedEvents: string[]
}

async function main() {
  console.log('Mode: READ-ONLY (this script never writes)')
  console.log(`DB: ${url}`)
  console.log(`Season: ${SEASON}\n`)

  const { data: chapters, error: cErr } = await supabase
    .from('chapters')
    .select('id, slug, name')
    .order('name')
  if (cErr) throw new Error(`load chapters: ${cErr.message}`)
  const chapterSlug = new Map((chapters as Chapter[]).map((c) => [c.id, c.slug]))
  console.log('--- chapters ---')
  for (const c of chapters as Chapter[]) {
    console.log(
      `  ${c.slug.padEnd(12)} ${c.name}${c.slug === EXCLUDED_CHAPTER ? '  (EXCLUDED unless flèche)' : ''}`
    )
  }

  const { data: award, error: aErr } = await supabase
    .from('awards')
    .select('id, slug, title, award_type')
    .eq('slug', 'o-5000')
    .maybeSingle()
  if (aErr) throw new Error(`load award: ${aErr.message}`)
  console.log('\n--- award row ---')
  console.log(award ?? '(no o-5000 award row!)')

  if (award) {
    const { data: existing, error: eErr } = await supabase
      .from('rider_awards')
      .select('season, auto_assigned, note, riders(first_name, last_name)')
      .eq('award_id', award.id)
      .in('season', [SEASON - 1, SEASON])
      .order('season')
    if (eErr) throw new Error(`load rider_awards: ${eErr.message}`)
    console.log(`\n--- existing o-5000 rider_awards (${SEASON - 1}, ${SEASON}) ---`)
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
      'rider_id, distance_km, events!inner(name, event_type, chapter_id, event_date), riders!inner(first_name, last_name, hidden)'
    )
    .eq('season', SEASON)
    .eq('status', 'finished')
  if (rErr) throw new Error(`load results: ${rErr.message}`)
  const rows = (results ?? []) as unknown as ResultRow[]
  console.log(`\nfinished results in ${SEASON}: ${rows.length}`)

  const nullDistance = rows.filter((r) => r.distance_km == null)
  console.log(`finished results with NULL distance_km: ${nullDistance.length}`)

  const byRider = new Map<string, RiderEntry>()
  for (const r of rows) {
    const slug = chapterSlug.get(r.events.chapter_id) ?? `?${r.events.chapter_id}`
    const entry = byRider.get(r.rider_id) ?? {
      name: `${r.riders.first_name} ${r.riders.last_name}`,
      hidden: r.riders.hidden,
      qualifying: 0,
      excluded: 0,
      byChapter: new Map<string, number>(),
      byType: new Map<string, number>(),
      excludedEvents: [],
    }
    const km = r.distance_km ?? 0
    if (isExcluded(slug, r.events.event_type)) {
      entry.excluded += km
      entry.excludedEvents.push(`${r.events.name} (${km} km, ${r.events.event_date})`)
    } else {
      entry.qualifying += km
      entry.byChapter.set(slug, (entry.byChapter.get(slug) ?? 0) + km)
      entry.byType.set(r.events.event_type, (entry.byType.get(r.events.event_type) ?? 0) + km)
    }
    byRider.set(r.rider_id, entry)
  }

  const fmt = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
  const byKm = (a: RiderEntry, b: RiderEntry) => b.qualifying - a.qualifying

  const earned = [...byRider.values()].filter((e) => e.qualifying >= THRESHOLD).sort(byKm)
  const near = [...byRider.values()]
    .filter((e) => e.qualifying >= NEAR_MISS && e.qualifying < THRESHOLD)
    .sort(byKm)
  // Riders whose excluded rides would tip them over: a rule-sensitivity check.
  const onlyWithOther = [...byRider.values()]
    .filter((e) => e.qualifying < THRESHOLD && e.qualifying + e.excluded >= THRESHOLD)
    .sort(byKm)

  console.log(`\n=== EARNED O-5000 ${SEASON}: ${earned.length} rider(s) ===`)
  for (const e of earned) {
    console.log(`\n  ${e.name}${e.hidden ? ' [HIDDEN]' : ''}  ${e.qualifying} km`)
    console.log(`     by chapter: ${fmt(e.byChapter)}`)
    console.log(`     by type:    ${fmt(e.byType)}`)
    if (e.excluded > 0) {
      console.log(`     excluded: ${e.excluded} km -> ${e.excludedEvents.join(' | ')}`)
    }
  }

  console.log(`\n=== ${NEAR_MISS}-${THRESHOLD - 1} km (near miss): ${near.length} rider(s) ===`)
  for (const e of near) console.log(`  ${e.name.padEnd(30)} ${String(e.qualifying).padStart(5)} km`)

  console.log(
    `\n=== would qualify ONLY if excluded rides counted: ${onlyWithOther.length} rider(s) ===`
  )
  for (const e of onlyWithOther) {
    console.log(
      `  ${e.name.padEnd(30)} ${String(e.qualifying).padStart(5)} km + excluded ${e.excluded} km -> ${e.excludedEvents.join(' | ')}`
    )
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
