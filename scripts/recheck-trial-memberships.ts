/**
 * Re-check every cached Trial Member row for the current season against CCN.
 *
 * Riders sometimes upgrade Trial → Individual mid-season, but the cached
 * `rider_memberships` row stays on Trial. CCN returns both rows in the search
 * results; with the client fix, the non-Trial entry now wins. This script
 * applies that re-check to existing rows that were saved before the fix.
 *
 * Usage:
 *   npx tsx scripts/recheck-trial-memberships.ts            # dry-run, local env
 *   npx tsx scripts/recheck-trial-memberships.ts --apply    # write updates
 *   npx tsx scripts/recheck-trial-memberships.ts --season=2026 --apply
 *
 * Point at a different environment with --env-file:
 *   npx tsx scripts/recheck-trial-memberships.ts --env-file=.env.production.local
 *   npx tsx scripts/recheck-trial-memberships.ts --env-file=.env.production.local --apply
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
import { searchCCNMembership } from '../lib/ccn/client'
import { getCurrentSeason } from '../lib/season'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const seasonArg = args.find((a) => a.startsWith('--season='))
const season = seasonArg ? parseInt(seasonArg.split('=')[1], 10) : getCurrentSeason()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}
if (!process.env.CCN_ENDPOINT) {
  console.error('Missing CCN_ENDPOINT in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const mode = apply ? 'APPLY' : 'DRY-RUN'
  console.log(`Re-checking Trial Member rows for season ${season} [${mode}]\n`)

  const { data: rows, error } = await supabase
    .from('rider_memberships')
    .select('rider_id, ccn_id, riders!inner(first_name, last_name)')
    .eq('season', season)
    .eq('membership_type', 'Trial Member')
    .order('updated_at', { ascending: true })

  if (error) {
    console.error('Failed to load Trial rows:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('No Trial rows for this season — nothing to do.')
    return
  }

  let upgraded = 0
  let unchanged = 0
  let notFound = 0

  for (const row of rows) {
    const rider = Array.isArray(row.riders) ? row.riders[0] : row.riders
    const name = `${rider.first_name} ${rider.last_name}`

    const result = await searchCCNMembership(rider.first_name, rider.last_name)

    if (!result.found) {
      notFound++
      console.log(`  - ${name.padEnd(30)} → CCN: not found (leaving Trial row in place)`)
      continue
    }

    if (result.type === 'Trial Member') {
      unchanged++
      console.log(`  - ${name.padEnd(30)} → CCN: still Trial`)
      continue
    }

    upgraded++
    console.log(
      `  ✓ ${name.padEnd(30)} → CCN: ${result.type} (id ${result.membershipId}, was ${row.ccn_id ?? 'null'})`
    )

    if (apply) {
      const { error: updateError } = await supabase
        .from('rider_memberships')
        .update({
          ccn_id: result.membershipId,
          membership_type: result.type,
          city: result.city || null,
          country: result.country || null,
        })
        .eq('rider_id', row.rider_id)
        .eq('season', season)
      if (updateError) {
        console.error(`    ! update failed: ${updateError.message}`)
      }
    }
  }

  console.log(
    `\nSummary: ${rows.length} Trial rows checked — ${upgraded} upgrade(s) ${apply ? 'applied' : 'detected (dry-run)'}, ${unchanged} still Trial, ${notFound} not found on CCN.`
  )
  if (upgraded > 0 && !apply) {
    console.log('Re-run with --apply to write the upgrades.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
