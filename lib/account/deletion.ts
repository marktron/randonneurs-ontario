import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logRiderAction } from '@/lib/audit-log'

/**
 * Remove an account. The rider row and its registrations/results are club
 * records and stay; only the link and rider-authored profile fields go.
 * Caller is responsible for authorization (fresh code, not an admin).
 *
 * Order matters. The auth user goes first, because until it does nothing has
 * changed and a failure leaves a clean retry — clearing the profile or writing
 * the audit row first would strand a half-deleted account and stack a second
 * audit row on every retry.
 */
export async function deleteAccountData(input: {
  userId: string
  riderId: string | null
}): Promise<void> {
  const admin = getSupabaseAdmin()

  // 1. Delete the auth user. The FK on riders.auth_user_id (ON DELETE SET NULL)
  //    plus its trigger unlinks the rider and clears linked_at — but only a
  //    rider still pointing at *this* user.
  const { error: deleteError } = await admin.auth.admin.deleteUser(input.userId)
  if (deleteError) throw new Error(`deleteAccountData deleteUser: ${deleteError.message}`)

  if (input.riderId) {
    // 2. Clear the rider-authored fields, scoped to a rider the cascade just
    //    unlinked. If an admin re-pointed this rider at someone else in the
    //    meantime, auth_user_id is non-null and this is a no-op, so a departing
    //    account can never wipe a profile that now belongs to another rider.
    const { error } = await admin
      .from('riders')
      .update({ bio: null, photo_path: null })
      .eq('id', input.riderId)
      .is('auth_user_id', null)
    if (error) throw new Error(`deleteAccountData clear profile: ${error.message}`)
    // Phase 3 adds the rider-photos object removal here once photos exist.
  }

  // 3. Record it last, so an audit row only ever describes work that happened.
  await logRiderAction({
    actorUserId: input.userId,
    action: 'account_delete',
    entityType: 'rider',
    entityId: input.riderId,
    description: 'Rider deleted their account',
  })
}
