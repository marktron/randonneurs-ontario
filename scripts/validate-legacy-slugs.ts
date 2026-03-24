/**
 * Validate that every slug in the legacy redirect map exists in the events table.
 *
 * Usage: npx tsx scripts/validate-legacy-slugs.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY
 * or NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment (or .env.local).
 */
import { config } from 'dotenv'
import { join } from 'path'
// Supabase vars are in .env.development.local; other vars in .env.local
config({ path: join(process.cwd(), '.env.development.local') })
config({ path: join(process.cwd(), '.env.local') })
import { createClient } from '@supabase/supabase-js'
import { LEGACY_EVENT_MAP } from '../lib/legacy-redirects'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or Supabase key in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  // Fetch all event slugs from the database
  const { data: events, error } = await supabase.from('events').select('slug')

  if (error) {
    console.error('Error fetching events:', error.message)
    process.exit(1)
  }

  const dbSlugs = new Set(events.map((e) => e.slug))
  const legacyEntries = Object.entries(LEGACY_EVENT_MAP)

  let mismatches = 0

  for (const [schedId, slug] of legacyEntries) {
    if (!dbSlugs.has(slug)) {
      console.log(`MISSING  schedId=${schedId}  slug=${slug}`)
      mismatches++
    }
  }

  if (mismatches === 0) {
    console.log(`All ${legacyEntries.length} legacy slugs found in the database.`)
  } else {
    console.log(
      `\n${mismatches} of ${legacyEntries.length} legacy slugs are missing from the database.`
    )
  }
}

main()
