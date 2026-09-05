import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase } from './supabase'

function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }
  return { url, anonKey }
}

/** Anon-key client with no session (role = anon). */
export function getAnonClient(): SupabaseClient {
  const { url, anonKey } = publicEnv()
  return createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Create a confirmed auth user and return its id. Throws if it already exists. */
export async function createAuthUser(email: string): Promise<string> {
  const admin = getTestSupabase()
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) {
    throw new Error(`[integration-real] createUser(${email}): ${error?.message}`)
  }
  return data.user.id
}

/**
 * Anon-key client signed in as `email` (role = authenticated). The user must
 * already exist. Uses generateLink + verifyOtp so no email is sent.
 */
export async function createUserClient(email: string): Promise<SupabaseClient> {
  const admin = getTestSupabase()
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) {
    throw new Error(`[integration-real] generateLink(${email}): ${error?.message}`)
  }
  const client = getAnonClient()
  const { error: verifyError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  })
  if (verifyError) {
    throw new Error(`[integration-real] verifyOtp(${email}): ${verifyError.message}`)
  }
  return client
}

/** Delete every auth user whose email is in `emails`. Idempotent. */
export async function deleteAuthUsersByEmail(emails: string[]): Promise<void> {
  const admin = getTestSupabase()
  const wanted = new Set(emails.map((e) => e.toLowerCase()))
  let page = 1
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`[integration-real] listUsers: ${error.message}`)
    for (const user of data.users) {
      if (user.email && wanted.has(user.email.toLowerCase())) {
        const { error: delError } = await admin.auth.admin.deleteUser(user.id)
        if (delError) throw new Error(`[integration-real] deleteUser: ${delError.message}`)
      }
    }
    if (!data.nextPage) break
    page = data.nextPage
  }
}
