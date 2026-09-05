import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase-server-client'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import type { Rider } from '@/types/queries'

export interface Account {
  /** auth.users.id */
  userId: string
  email: string | null
  /** The linked rider row, or null when the account has not been linked yet */
  rider: Rider | null
  /** True when this same auth user also has an `admins` row */
  isAdmin: boolean
}

export interface LinkedAccount extends Account {
  rider: Rider
}

export class NotLinkedError extends Error {
  constructor() {
    super('NotLinked')
    this.name = 'NotLinkedError'
  }
}

/**
 * Resolve the signed-in rider account for the current request, or null.
 *
 * Identity comes from the cookie client (`auth.getUser()` validates the token
 * server-side). The rider and admin rows are read with the service-role client
 * because `auth_user_id` is deliberately not readable by the `authenticated`
 * role. Wrapped in React `cache` so layouts, pages and actions in one request
 * share a single lookup.
 */
export const getAccount = cache(async (): Promise<Account | null> => {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = getSupabaseAdmin()
  const [{ data: rider }, { data: adminRow }] = await Promise.all([
    admin.from('riders').select('*').eq('auth_user_id', user.id).maybeSingle(),
    admin.from('admins').select('id').eq('id', user.id).maybeSingle(),
  ])

  return {
    userId: user.id,
    email: user.email ?? null,
    rider: (rider as Rider | null) ?? null,
    isAdmin: Boolean(adminRow),
  }
})

export async function requireAccount(): Promise<Account> {
  const account = await getAccount()
  if (!account) throw new Error('Unauthorized')
  return account
}

export async function requireRider(): Promise<LinkedAccount> {
  const account = await requireAccount()
  if (!account.rider) throw new NotLinkedError()
  return { ...account, rider: account.rider }
}
