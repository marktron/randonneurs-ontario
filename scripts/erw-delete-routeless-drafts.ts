/**
 * Free Epic Ride Weather draft slots.
 *
 * ERW caps an account at 10 draft events. An ERW event created for one of our
 * events that has no Ride with GPS route can never be published there, so it
 * sits as a draft and occupies a slot forever. Once the quota is full every
 * create for every chapter fails with "Maximum draft event limit (10) reached".
 *
 * This script lists ERW's drafts, matches each to our event by erw_event_id,
 * and with --apply deletes the draft on ERW and clears erw_event_id and
 * erw_canonical_url on our row. Drafts that are unknown to our database are
 * reported but left alone unless --apply --include-orphans is given.
 *
 * Usage:
 *   npx tsx --env-file=.env.production.local scripts/erw-delete-routeless-drafts.ts            # dry run
 *   npx tsx --env-file=.env.production.local scripts/erw-delete-routeless-drafts.ts --apply
 */

import { createClient } from '@supabase/supabase-js'
import { deleteErwEvent } from '../lib/erw/client'

const ERW_BASE_URL = 'https://events.epicrideweather.com/api/public/v1'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!process.env.EPIC_RIDE_WEATHER_CLIENT_ID || !process.env.EPIC_RIDE_WEATHER_SECRET) {
  console.error('Missing EPIC_RIDE_WEATHER_CLIENT_ID or EPIC_RIDE_WEATHER_SECRET')
  process.exit(1)
}

const apply = process.argv.includes('--apply')
const includeOrphans = process.argv.includes('--include-orphans')

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

interface ErwDraft {
  id: string
  name: string
  routes?: unknown[]
}

/** List the account's draft events. The client has no list call, so this is local. */
async function listErwDrafts(): Promise<ErwDraft[]> {
  const tokenResponse = await fetch(`${ERW_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.EPIC_RIDE_WEATHER_CLIENT_ID!,
      client_secret: process.env.EPIC_RIDE_WEATHER_SECRET!,
    }).toString(),
  })
  if (!tokenResponse.ok) throw new Error(`ERW token request failed: ${tokenResponse.status}`)
  const { access_token: token } = (await tokenResponse.json()) as { access_token: string }

  const response = await fetch(`${ERW_BASE_URL}/events?status=draft&limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`ERW list drafts failed: ${response.status}`)
  const body = (await response.json()) as { events?: ErwDraft[] }
  return body.events ?? []
}

async function main() {
  console.log(
    apply ? '=== APPLY — deleting drafts ===\n' : '=== DRY RUN — no changes will be made ===\n'
  )
  console.log(`Database: ${supabaseUrl}\n`)

  const drafts = await listErwDrafts()
  console.log(`ERW drafts: ${drafts.length}\n`)
  if (drafts.length === 0) return

  const { data: rows, error } = await supabase
    .from('events')
    .select('id, name, event_date, status, erw_event_id, chapters(slug)')
    .in(
      'erw_event_id',
      drafts.map((d) => d.id)
    )
  if (error) throw error
  const byErwId = new Map((rows ?? []).map((r) => [r.erw_event_id as string, r]))

  let deleted = 0
  for (const draft of drafts) {
    const row = byErwId.get(draft.id)
    const routes = draft.routes?.length ?? 0
    const label = row
      ? `${(row.chapters as unknown as { slug: string } | null)?.slug ?? '?'} ${row.event_date} ${row.status} "${row.name}" (${row.id})`
      : 'NOT IN OUR DATABASE'
    console.log(`${draft.id}  routes=${routes}  "${draft.name}"  ->  ${label}`)

    if (!apply) continue
    if (!row && !includeOrphans) {
      console.log('   skipped (orphan; pass --include-orphans to delete)')
      continue
    }

    const result = await deleteErwEvent(draft.id)
    if (!result.success) {
      console.log(`   ERW delete failed: ${result.error}`)
      continue
    }
    if (row) {
      const { error: updateError } = await supabase
        .from('events')
        .update({ erw_event_id: null, erw_canonical_url: null })
        .eq('id', row.id)
      if (updateError) {
        console.log(`   deleted on ERW but failed to clear our row: ${updateError.message}`)
        continue
      }
    }
    deleted++
    console.log('   deleted')
  }

  console.log(
    `\n${apply ? 'Deleted' : 'Would delete'}: ${apply ? deleted : drafts.filter((d) => byErwId.has(d.id) || includeOrphans).length} of ${drafts.length}`
  )
  if (!apply) console.log('Run with --apply to delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
