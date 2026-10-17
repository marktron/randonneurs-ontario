/**
 * Flip registrations for next-season events back to `incomplete: membership`.
 *
 * Registrations written for events in a future season, before season-aware
 * membership verification shipped, were checked against the current season's
 * membership and marked `registered`. Those rows need membership verification
 * for the event's own season, so this script moves them back to
 * `incomplete: membership`.
 *
 * Run AFTER the deploy that includes season-aware membership verification.
 *
 * Usage:
 *   npx tsx scripts/flip-next-season-registrations.ts            # dry-run, local env
 *   npx tsx scripts/flip-next-season-registrations.ts --apply    # write updates
 *
 * Point at a different environment with --env-file:
 *   npx tsx scripts/flip-next-season-registrations.ts --env-file=.env.production.local
 *   npx tsx scripts/flip-next-season-registrations.ts --env-file=.env.production.local --apply
 *
 * After --apply, refresh the caches:
 *   POST /api/revalidate with {"tags":["registrations","events"]}
 */
import { config } from 'dotenv'
import { join } from 'path'

const argsRaw = process.argv.slice(2)
const envFileArg = argsRaw.find((a) => a.startsWith('--env-file='))
if (envFileArg) {
  // Load the explicit env file first; dotenv won't override anything already set.
  config({ path: join(process.cwd(), envFileArg.split('=')[1]) })
}
config({ path: join(process.cwd(), '.env.development.local') })
config({ path: join(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'
import { seasonOfEventDate, torontoCalendarYear } from '../lib/season'

const args = process.argv.slice(2)
const apply = args.includes('--apply')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const mode = apply ? 'APPLY' : 'DRY-RUN'
  const currentYear = torontoCalendarYear()
  console.log(`Flipping registered rows for events after season ${currentYear} [${mode}]\n`)

  // The season filter is applied in code, not in the query: events.season is
  // nullable, and rows with a null season must fall back to the event date.
  const { data: rows, error } = await supabase
    .from('registrations')
    .select('id, status, events!inner(name, event_date, season), riders(first_name, last_name)')
    .eq('status', 'registered')

  if (error) {
    console.error('Failed to load registrations:', error.message)
    process.exit(1)
  }

  const matches = (rows ?? []).flatMap((row) => {
    const event = Array.isArray(row.events) ? row.events[0] : row.events
    const rider = Array.isArray(row.riders) ? row.riders[0] : row.riders
    if (!event || !rider) return []
    const eventSeason = event.season ?? seasonOfEventDate(event.event_date)
    if (eventSeason <= currentYear) return []
    return [
      {
        id: row.id,
        riderName: `${rider.first_name} ${rider.last_name}`,
        eventName: event.name,
        eventDate: event.event_date,
      },
    ]
  })

  for (const m of matches) {
    console.log(
      `  - ${m.riderName.padEnd(30)} ${m.eventName.padEnd(40)} ${m.eventDate}  (registration ${m.id})`
    )
  }

  console.log(`\n${matches.length} matching row(s).`)

  if (matches.length === 0) return

  if (!apply) {
    console.log(
      'Dry-run: nothing written. Re-run with --apply to set status = incomplete: membership.'
    )
    return
  }

  const { error: updateError } = await supabase
    .from('registrations')
    .update({ status: 'incomplete: membership' })
    .in(
      'id',
      matches.map((m) => m.id)
    )
  if (updateError) {
    console.error('Update failed:', updateError.message)
    process.exit(1)
  }
  console.log(`Updated ${matches.length} row(s) to incomplete: membership.`)
  console.log(
    'Now POST /api/revalidate with {"tags":["registrations","events"]} so admin and event pages refresh.'
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
