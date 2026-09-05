import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail } from './helpers/auth-users'
import { deleteAccountData } from '@/lib/account/deletion'

const USER_EMAIL = 'inttest-delete-user@example.com'
const OTHER_USER_EMAIL = 'inttest-delete-other@example.com'
const RIDER = { id: '00000000-10c3-4000-a000-000000000001', slug: 'inttest-delete-rider' }
// A uuid that is deliberately not an auth.users row, so deleteUser() errors.
const MISSING_USER_ID = '00000000-10c3-4000-a000-0000000000ff'

describe('deleteAccountData (real DB)', () => {
  const admin = getTestSupabase()
  let userId: string | undefined
  let otherUserId: string | undefined

  async function cleanup() {
    await admin.from('audit_logs').delete().eq('entity_id', RIDER.id)
    // The unlinked-account case logs with entity_id: null, so it isn't caught
    // above — clean it up by actor_user_id too, using whatever ids the
    // previous test (or run) assigned.
    if (userId) await admin.from('audit_logs').delete().eq('actor_user_id', userId)
    if (otherUserId) await admin.from('audit_logs').delete().eq('actor_user_id', otherUserId)
    await admin.from('audit_logs').delete().eq('actor_user_id', MISSING_USER_ID)
    await admin.from('riders').delete().eq('id', RIDER.id)
    await deleteAuthUsersByEmail([USER_EMAIL, OTHER_USER_EMAIL])
  }

  beforeEach(async () => {
    await cleanup()
    userId = await createAuthUser(USER_EMAIL)
    await checked(
      admin.from('riders').insert({
        id: RIDER.id,
        slug: RIDER.slug,
        first_name: 'Inttest',
        last_name: 'Delete',
        email: USER_EMAIL,
        auth_user_id: userId,
        linked_at: new Date().toISOString(),
        bio: 'I ride bikes',
      }),
      'seed linked rider'
    )
  })

  afterAll(cleanup)

  it('unlinks the rider, clears profile fields, keeps the rider, deletes the auth user, and logs it', async () => {
    await deleteAccountData({ userId: userId!, riderId: RIDER.id })

    const { data: rider } = await admin
      .from('riders')
      .select('id, auth_user_id, linked_at, bio, photo_path, email')
      .eq('id', RIDER.id)
      .single()
    expect(rider).toMatchObject({
      id: RIDER.id,
      auth_user_id: null,
      linked_at: null,
      bio: null,
      photo_path: null,
    })
    expect(rider?.email).toBe(USER_EMAIL) // club record stays intact

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(users.users.some((u) => u.id === userId)).toBe(false)

    const { data: logs } = await admin
      .from('audit_logs')
      .select('action, actor_user_id, admin_id')
      .eq('entity_id', RIDER.id)
    expect(logs).toEqual([{ action: 'account_delete', actor_user_id: userId, admin_id: null }])
  })

  it('handles an unlinked account', async () => {
    await checked(
      admin.from('riders').update({ auth_user_id: null, linked_at: null }).eq('id', RIDER.id),
      'unlink'
    )
    await expect(deleteAccountData({ userId: userId!, riderId: null })).resolves.toBeUndefined()
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(users.users.some((u) => u.id === userId)).toBe(false)
  })

  it('does not unlink a rider now linked to a different auth user, but still deletes the caller', async () => {
    otherUserId = await createAuthUser(OTHER_USER_EMAIL)
    await checked(
      admin
        .from('riders')
        .update({ auth_user_id: otherUserId, linked_at: new Date().toISOString() })
        .eq('id', RIDER.id),
      're-link rider to the other user'
    )

    // userId no longer owns this rider's link (otherUserId does). Deleting the
    // caller's own auth user always proceeds — that's the account they asked to
    // delete — but the FK cascade only clears a link pointing at *them*, so this
    // rider keeps otherUserId. The profile-clearing UPDATE is then scoped by
    // `.is('auth_user_id', null)`, so it is a no-op too and the bio survives:
    // a caller can never wipe a profile that now belongs to someone else.
    await deleteAccountData({ userId: userId!, riderId: RIDER.id })

    const { data: rider } = await admin
      .from('riders')
      .select('auth_user_id, linked_at, bio')
      .eq('id', RIDER.id)
      .single()
    expect(rider?.auth_user_id).toBe(otherUserId)
    expect(rider?.linked_at).not.toBeNull()
    expect(rider?.bio).toBe('I ride bikes')

    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(users.users.some((u) => u.id === userId)).toBe(false)
    expect(users.users.some((u) => u.id === otherUserId)).toBe(true)
  })

  it('changes nothing and logs nothing when deleting the auth user fails', async () => {
    // deleteUser runs first, so a failure must leave the rider exactly as it
    // was and write no audit row — otherwise a retry stacks a second one.
    await expect(deleteAccountData({ userId: MISSING_USER_ID, riderId: RIDER.id })).rejects.toThrow(
      /deleteUser/
    )

    const { data: rider } = await admin
      .from('riders')
      .select('auth_user_id, linked_at, bio')
      .eq('id', RIDER.id)
      .single()
    expect(rider?.auth_user_id).toBe(userId)
    expect(rider?.linked_at).not.toBeNull()
    expect(rider?.bio).toBe('I ride bikes')

    const { data: logs } = await admin
      .from('audit_logs')
      .select('action')
      .eq('entity_id', RIDER.id)
      .eq('action', 'account_delete')
    expect(logs ?? []).toHaveLength(0)
  })
})
