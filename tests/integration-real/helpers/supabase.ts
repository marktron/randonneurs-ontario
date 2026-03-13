import { createClient, SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Get a Supabase admin client for test data setup/teardown.
 * Uses real env vars loaded by the setup file.
 */
export function getTestSupabase(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('[integration-real] Missing SUPABASE env vars. Is local Supabase running?')
  }

  client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return client
}

/** Run a Supabase query and throw if it returns an error. */
export async function checked<T>(
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await operation
  if (error) {
    throw new Error(`[integration-real] ${label}: ${error.message}`)
  }
  return data
}
