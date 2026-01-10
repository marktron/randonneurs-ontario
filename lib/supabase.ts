/**
 * Public Supabase Client
 *
 * This module provides the public Supabase client for READ operations.
 * It uses the anonymous key and respects Row Level Security (RLS) policies.
 *
 * WHEN TO USE:
 * - Fetching public data (events, routes, results)
 * - Server components that read public data
 * - Any read operation that doesn't need admin privileges
 *
 * WHEN NOT TO USE:
 * - Write operations (use getSupabaseAdmin() from lib/supabase-server.ts)
 * - Accessing private data like rider emails
 * - Operations that need to bypass RLS
 *
 * @example
 * ```ts
 * import { getSupabase } from '@/lib/supabase'
 *
 * const { data: events } = await getSupabase()
 *   .from('events')
 *   .select('*')
 *   .eq('status', 'scheduled')
 * ```
 *
 * @see lib/supabase-server.ts for the admin client
 * @see docs/DATA_LAYER.md for full data layer documentation
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Singleton instance - reused across all requests for efficiency
let supabaseInstance: SupabaseClient<Database> | null = null

/**
 * Get the public Supabase client instance.
 * Creates a singleton client on first call, reuses it on subsequent calls.
 *
 * @throws Error if environment variables are not configured
 */
export function getSupabase(): SupabaseClient<Database> {
  if (!supabaseInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
    }
    supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey)
  }
  return supabaseInstance
}
