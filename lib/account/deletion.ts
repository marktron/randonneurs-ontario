import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logRiderAction } from '@/lib/audit-log'

/**
 * Remove an account. The rider row and its registrations/results are club
 * records and stay; only the link and rider-authored profile fields go.
 * Caller is responsible for authorization (fresh code, not an admin).
 */
export async function deleteAccountData(input: {
  userId: string
  riderId: string | null
}): Promise<void> {
  const admin = getSupabaseAdmin()

  if (input.riderId) {
    const { error } = await admin
      .from('riders')
      .update({ auth_user_id: null, linked_at: null, bio: null, photo_path: null })
      .eq('id', input.riderId)
      .eq('auth_user_id', input.userId)
    if (error) throw new Error(`deleteAccountData unlink: ${error.message}`)
    // Phase 3 adds the rider-photos object removal here once photos exist.
  }

  await logRiderAction({
    actorUserId: input.userId,
    action: 'account_delete',
    entityType: 'rider',
    entityId: input.riderId,
    description: 'Rider deleted their account',
  })

  const { error: deleteError } = await admin.auth.admin.deleteUser(input.userId)
  if (deleteError) throw new Error(`deleteAccountData deleteUser: ${deleteError.message}`)
}
