// One-off: realign slugs of upcoming events with their stored name, distance
// and date. The stored columns are the source of truth; the slug is derived.
//
// Events created before slug rotation shipped (2026-10-26) kept their original
// slug when rescheduled, so the URL can still carry the old date. This script
// recomputes `buildEventSlug(name, distance_km, event_date)` for every
// non-permanent event dated today or later, and for each mismatch:
//
//   1. upserts the old slug into event_slug_history (old slug → event id)
//   2. updates events.slug to the recomputed value
//   3. deletes any event_slug_history row equal to the new slug
//
// That is the same sequence updateEvent performs on a reschedule, so old links
// keep working through the /register/[slug] redirect.
//
// Skips any event whose recomputed slug is already in use by a different
// event (getEventBySlug treats slug as unique) and reports it instead.
//
// Dry run by default: prints the plan and exits without writing.
//
// Usage:
//   npx tsx scripts/fix-event-slugs.ts                                   # dry run, local env
//   npx tsx scripts/fix-event-slugs.ts --env-file=.env.production.local  # dry run, prod
//   npx tsx scripts/fix-event-slugs.ts --env-file=.env.production.local --apply
//
// After --apply on prod, bust the caches:
//   curl -X POST https://<site>/api/revalidate -H "Authorization: Bearer $REVALIDATE_SECRET" \
//     -H 'Content-Type: application/json' -d '{"tags":["events","slugs"]}'
import './load-env'
import { createClient } from '@supabase/supabase-js'
import { buildEventSlug } from '../lib/events/slug-rotation'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const APPLY = process.argv.includes('--apply')

interface EventRow {
  id: string
  slug: string
  name: string
  distance_km: number
  event_date: string
  event_type: string
  status: string | null
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)

  const { data: upcoming, error } = await supabase
    .from('events')
    .select('id, slug, name, distance_km, event_date, event_type, status')
    .gte('event_date', today)
    .neq('event_type', 'permanent')
    .order('event_date')
  if (error) throw error

  const events = (upcoming ?? []) as EventRow[]
  const mismatches = events
    .map((e) => ({ ...e, newSlug: buildEventSlug(e.name, e.distance_km, e.event_date) }))
    .filter((e) => e.newSlug !== e.slug)

  console.log(`${events.length} upcoming non-permanent events; ${mismatches.length} mismatched`)
  if (mismatches.length === 0) return

  // A recomputed slug already held by a different event cannot be taken.
  const { data: holders, error: holdersError } = await supabase
    .from('events')
    .select('id, slug')
    .in(
      'slug',
      mismatches.map((m) => m.newSlug)
    )
  if (holdersError) throw holdersError
  const heldBy = new Map((holders ?? []).map((h) => [h.slug as string, h.id as string]))

  const todo: typeof mismatches = []
  for (const m of mismatches) {
    const holder = heldBy.get(m.newSlug)
    const tag = holder && holder !== m.id ? 'SKIP (slug held by another event)' : 'FIX'
    console.log(
      `${tag.padEnd(36)} ${m.event_date}  ${String(m.status).padEnd(9)} ${m.slug}  ->  ${m.newSlug}`
    )
    if (tag === 'FIX') todo.push(m)
  }

  if (!APPLY) {
    console.log(`\nDry run. ${todo.length} would change. Re-run with --apply to write.`)
    return
  }

  let done = 0
  for (const m of todo) {
    const { error: histError } = await supabase
      .from('event_slug_history')
      .upsert({ slug: m.slug, event_id: m.id }, { onConflict: 'slug' })
    if (histError) {
      console.error(`history upsert failed for ${m.slug}:`, histError.message)
      continue
    }
    const { error: updError } = await supabase
      .from('events')
      .update({ slug: m.newSlug })
      .eq('id', m.id)
    if (updError) {
      console.error(`update failed for ${m.slug}:`, updError.message)
      continue
    }
    const { error: delError } = await supabase
      .from('event_slug_history')
      .delete()
      .eq('slug', m.newSlug)
    if (delError) {
      console.error(`history cleanup failed for ${m.newSlug}:`, delError.message)
      continue
    }
    done += 1
  }
  console.log(
    `\nApplied ${done}/${todo.length}. Now POST /api/revalidate with tags ["events","slugs"].`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
