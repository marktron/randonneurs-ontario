/**
 * Admin Supabase Client (Server-Side Only)
 *
 * This module provides the admin Supabase client for WRITE operations.
 * It uses the service role key and BYPASSES Row Level Security (RLS).
 *
 * SECURITY WARNING:
 * - This client has full database access
 * - Only use in server actions and API routes
 * - NEVER import this in client components
 * - NEVER expose the service role key to the browser
 *
 * WHEN TO USE:
 * - Creating/updating/deleting records (registrations, events, etc.)
 * - Accessing private data (rider emails)
 * - Admin operations in the /admin dashboard
 *
 * WHEN NOT TO USE:
 * - Public read operations (use getSupabase() from lib/supabase.ts)
 * - Client-side code
 *
 * @example
 * ```ts
 * // In a server action (lib/actions/*.ts)
 * 'use server'
 * import { getSupabaseAdmin } from '@/lib/supabase-server'
 *
 * export async function createRegistration(data: RegistrationData) {
 *   const { error } = await getSupabaseAdmin()
 *     .from('registrations')
 *     .insert({ event_id: data.eventId, rider_id: data.riderId })
 *
 *   if (error) throw error
 * }
 * ```
 *
 * @see lib/supabase.ts for the public client
 * @see docs/DATA_LAYER.md for full data layer documentation
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Singleton instance - reused across all server-side requests
let supabaseAdminInstance: SupabaseClient<Database> | null = null

/**
 * Get the admin Supabase client instance.
 * This client bypasses RLS and should only be used for write operations
 * in server actions.
 *
 * @throws Error if environment variables are not configured
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdminInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    }
    supabaseAdminInstance = createClient<Database>(supabaseUrl, supabaseServiceKey)
  }
  return supabaseAdminInstance
}
