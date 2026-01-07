import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Server-side client with service role key - bypasses RLS
// ONLY use this in server actions and API routes, never expose to client
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey)
