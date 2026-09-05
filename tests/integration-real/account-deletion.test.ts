import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail } from './helpers/auth-users'
import { deleteAccountData } from '@/lib/account/deletion'

const USER_EMAIL = 'inttest-delete-user@example.com'
const RIDER = { id: '00000000-10c3-4000-a000-000000000001', slug: 'inttest-delete-rider' }

describe('deleteAccountData (real DB)', () => {
  const admin = getTestSupabase()
  let userId: string

  async function cleanup() {
    await admin.from('audit_logs').delete().eq('entity_id', RIDER.id)
    await admin.from('riders').delete().eq('id', RIDER.id)
    await deleteAuthUsersByEmail([USER_EMAIL])
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
    await deleteAccountData({ userId, riderId: RIDER.id })

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
      .select('action, actor_user_id')
      .eq('entity_id', RIDER.id)
    expect(logs).toEqual([{ action: 'account_delete', actor_user_id: userId }])
  })

  it('handles an unlinked account', async () => {
    await checked(
      admin.from('riders').update({ auth_user_id: null, linked_at: null }).eq('id', RIDER.id),
      'unlink'
    )
    await expect(deleteAccountData({ userId, riderId: null })).resolves.toBeUndefined()
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 })
    expect(users.users.some((u) => u.id === userId)).toBe(false)
  })
})
