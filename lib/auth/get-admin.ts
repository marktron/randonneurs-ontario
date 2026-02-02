import { createSupabaseServerClient } from '@/lib/supabase-server-client'
import type { AdminUser } from '@/types/queries'

export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: admin } = await supabase.from('admins').select('*').eq('id', user.id).single()

  return admin
}

export async function requireAdmin(): Promise<AdminUser> {
  const admin = await getAdmin()
  if (!admin) {
    throw new Error('Unauthorized')
  }
  return admin
}
