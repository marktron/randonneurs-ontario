/**
 * Delete auth users that were never linked to a rider, are not admins, and
 * have not signed in for 12 months (docs/rider-accounts.md "Housekeeping",
 * design spec §12). Dry run unless --apply is passed.
 *
 *   npx tsx scripts/cleanup-unlinked-auth-users.ts          # report only
 *   npx tsx scripts/cleanup-unlinked-auth-users.ts --apply  # delete
 */
// MUST be first: loads env before any module that reads env at import time.
import './load-env'

import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const cutoff = new Date()
cutoff.setMonth(cutoff.getMonth() - 12)

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [{ data: admins }, { data: linked }] = await Promise.all([
    supabase.from('admins').select('id'),
    supabase.from('riders').select('auth_user_id').not('auth_user_id', 'is', null),
  ])
  const keep = new Set<string>([
    ...(admins ?? []).map((a) => a.id),
    ...(linked ?? []).map((r) => r.auth_user_id as string),
  ])

  const stale: { id: string; email: string | undefined; lastSignIn: string | undefined }[] = []
  let page = 1
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const user of data.users) {
      if (keep.has(user.id)) continue
      const last = user.last_sign_in_at ?? user.created_at
      if (new Date(last) < cutoff) stale.push({ id: user.id, email: user.email, lastSignIn: last })
    }
    if (!data.nextPage) break
    page = data.nextPage
  }

  console.log(
    `${stale.length} unlinked auth user(s) idle since before ${cutoff.toISOString().slice(0, 10)}`
  )
  for (const user of stale)
    console.log(`  ${user.email ?? '(no email)'}  last sign-in ${user.lastSignIn}`)
  if (!apply) {
    console.log('Dry run. Re-run with --apply to delete.')
    return
  }
  for (const user of stale) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) console.error(`Failed to delete ${user.email}: ${error.message}`)
  }
  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
