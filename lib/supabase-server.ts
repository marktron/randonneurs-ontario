import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

let supabaseAdminInstance: SupabaseClient<Database> | null = null

// Server-side client with service role key - bypasses RLS
// ONLY use this in server actions and API routes, never expose to client
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!supabaseAdminInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    supabaseAdminInstance = createClient<Database>(supabaseUrl, supabaseServiceKey)
  }
  return supabaseAdminInstance
}

// For backwards compatibility - lazy getter
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_, prop) {
    return getSupabaseAdmin()[prop as keyof SupabaseClient<Database>]
  }
})
