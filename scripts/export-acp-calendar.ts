// Read-only export of the club's brevet calendar in the ACP (Audax Club
// Parisien) calendar-form layout, for the VP of Brevet Administration to submit.
// One row per event. See docs/acp-calendar-export.md. Writes nothing to the DB.
//
// Usage:
//   npx tsx scripts/export-acp-calendar.ts
//   npx tsx scripts/export-acp-calendar.ts --year=2027 --out=acp-2027.xlsx
//   npx tsx scripts/export-acp-calendar.ts --env-file=.env.production.local --year=2027
//   npx tsx scripts/export-acp-calendar.ts --skip-elevation   # don't call RWGPS
import './load-env'
import { writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import {
  buildAcpCalendarRows,
  generateAcpCalendarXlsx,
  selectAcpCalendarEvents,
  type AcpCalendarSourceEvent,
} from '../lib/acp-calendar'
import { fetchRwgpsRouteElevationGain } from '../lib/rwgps'
import { acpSeasonWindow } from '../lib/acp-season'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const args = process.argv.slice(2)
const argValue = (name: string) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const yearArg = argValue('year')
const YEAR = yearArg ? Number(yearArg) : new Date().getFullYear() + 1
if (!Number.isInteger(YEAR)) {
  console.error(`Invalid --year: ${yearArg}`)
  process.exit(1)
}
const OUT = argValue('out') ?? `acp-calendar-${YEAR}.xlsx`
const SKIP_ELEVATION = args.includes('--skip-elevation')
const CONCURRENCY = 4

type Row = {
  event_date: string
  distance_km: number
  event_type: string
  status: string
  chapters: { slug: string } | null
  routes: { rwgps_id: string | null } | null
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  console.log('Mode: READ-ONLY (this script never writes to the database)')
  const { start, end } = acpSeasonWindow(YEAR)

  const { data, error } = await supabase
    .from('events')
    .select('event_date,distance_km,event_type,status,chapters(slug),routes(rwgps_id)')
    .eq('event_type', 'brevet')
    .in('status', ['draft', 'scheduled'])
    .gte('event_date', start)
    .lte('event_date', end)
  if (error) throw new Error(`Failed to load events: ${error.message}`)

  const all: AcpCalendarSourceEvent[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    eventDate: r.event_date,
    distanceKm: Number(r.distance_km),
    chapterSlug: r.chapters?.slug ?? '',
    eventType: r.event_type,
    status: r.status,
    rwgpsId: r.routes?.rwgps_id ? String(r.routes.rwgps_id) : null,
    elevationGainM: null,
  }))

  const events = selectAcpCalendarEvents(all, YEAR)
  const underMin = all.filter((e) => e.distanceKm < 200).length
  const otherChapter = all.filter((e) => e.chapterSlug === 'other' && e.distanceKm >= 200).length

  let withElevation = 0
  let failed = 0
  const withRoute = events.filter((e) => e.rwgpsId).length
  const noRoute = events.length - withRoute
  if (!SKIP_ELEVATION) {
    const ids = [...new Set(events.map((e) => e.rwgpsId).filter((id): id is string => !!id))]
    const gains = new Map<string, number | null>()
    await mapLimit(ids, CONCURRENCY, async (id) => {
      gains.set(id, await fetchRwgpsRouteElevationGain(id))
    })
    for (const e of events) {
      if (!e.rwgpsId) continue
      const gain = gains.get(e.rwgpsId) ?? null
      e.elevationGainM = gain == null ? null : Math.round(gain)
      if (gain == null) failed++
      else withElevation++
    }
  }

  const rows = buildAcpCalendarRows(events)
  writeFileSync(OUT, await generateAcpCalendarXlsx(rows))

  console.log(`ACP calendar ${YEAR} (${start} to ${end})`)
  console.log(`Brevets in window (draft/scheduled): ${all.length}`)
  console.log(`Excluded under 200 km: ${underMin}`)
  console.log(`Excluded chapter "other": ${otherChapter}`)
  console.log(`Rows written: ${rows.length}`)
  console.log(
    SKIP_ELEVATION
      ? 'Elevation: skipped (--skip-elevation)'
      : `Elevation: ${withElevation} with elevation, ${noRoute} without route, ${failed} fetch failed`
  )
  console.log(`Output: ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
