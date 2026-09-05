import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import {
  createAuthUser,
  createUserClient,
  deleteAuthUsersByEmail,
  getAnonClient,
} from './helpers/auth-users'

const USER_EMAIL = 'inttest-columns-user@example.com'
const OTHER_EMAIL = 'inttest-columns-other@example.com'
const RIDER_A = { id: '00000000-10c1-4000-a000-000000000001', slug: 'inttest-columns-a' }
const RIDER_B = { id: '00000000-10c1-4000-a000-000000000002', slug: 'inttest-columns-b' }

describe('rider account columns (real DB)', () => {
  const admin = getTestSupabase()
  let user: SupabaseClient
  let userId: string

  async function cleanup() {
    await admin.from('riders').delete().in('id', [RIDER_A.id, RIDER_B.id])
    await deleteAuthUsersByEmail([USER_EMAIL, OTHER_EMAIL])
  }

  beforeAll(async () => {
    await cleanup()
    await checked(
      admin.from('riders').insert([
        { id: RIDER_A.id, slug: RIDER_A.slug, first_name: 'Inttest', last_name: 'ColumnsA' },
        { id: RIDER_B.id, slug: RIDER_B.slug, first_name: 'Inttest', last_name: 'ColumnsB' },
      ]),
      'seed riders'
    )
    userId = await createAuthUser(USER_EMAIL)
    user = await createUserClient(USER_EMAIL)
  })

  afterAll(cleanup)

  it('authenticated cannot read auth_user_id or linked_at', async () => {
    const a = await user.from('riders').select('auth_user_id').eq('id', RIDER_A.id)
    const b = await user.from('riders').select('linked_at').eq('id', RIDER_A.id)
    expect(a.error?.code).toBe('42501')
    expect(b.error?.code).toBe('42501')
  })

  it('anon and authenticated can read bio and photo_path', async () => {
    const anon = getAnonClient()
    const a = await anon.from('riders').select('bio, photo_path').eq('id', RIDER_A.id)
    const u = await user.from('riders').select('bio, photo_path').eq('id', RIDER_A.id)
    expect(a.error).toBeNull()
    expect(u.error).toBeNull()
  })

  it('rejects linked_at without auth_user_id and vice versa', async () => {
    const onlyLinkedAt = await admin
      .from('riders')
      .update({ linked_at: new Date().toISOString() })
      .eq('id', RIDER_A.id)
    expect(onlyLinkedAt.error?.code).toBe('23514')
    const onlyUser = await admin
      .from('riders')
      .update({ auth_user_id: userId })
      .eq('id', RIDER_A.id)
    expect(onlyUser.error?.code).toBe('23514')
  })

  it('enforces one rider per auth user', async () => {
    const link = { auth_user_id: userId, linked_at: new Date().toISOString() }
    await checked(admin.from('riders').update(link).eq('id', RIDER_A.id), 'link rider A')
    const second = await admin.from('riders').update(link).eq('id', RIDER_B.id)
    expect(second.error?.code).toBe('23505')
  })

  it('rejects a bio over 500 characters', async () => {
    const { error } = await admin
      .from('riders')
      .update({ bio: 'x'.repeat(501) })
      .eq('id', RIDER_A.id)
    expect(error?.code).toBe('23514')
  })

  it('auth_user_id_for_email resolves case-insensitively for service_role only', async () => {
    const { data, error } = await admin.rpc('auth_user_id_for_email', {
      p_email: USER_EMAIL.toUpperCase(),
    })
    expect(error).toBeNull()
    expect(data).toBe(userId)

    const missing = await admin.rpc('auth_user_id_for_email', { p_email: 'nobody@example.com' })
    expect(missing.data).toBeNull()

    const anonCall = await getAnonClient().rpc('auth_user_id_for_email', { p_email: USER_EMAIL })
    expect(anonCall.error?.code).toBe('42501')
    const userCall = await user.rpc('auth_user_id_for_email', { p_email: USER_EMAIL })
    expect(userCall.error?.code).toBe('42501')
  })

  it('deleting the auth user unlinks the rider instead of failing', async () => {
    const otherId = await createAuthUser(OTHER_EMAIL)
    await checked(
      admin
        .from('riders')
        .update({ auth_user_id: otherId, linked_at: new Date().toISOString() })
        .eq('id', RIDER_B.id),
      'link rider B'
    )
    await deleteAuthUsersByEmail([OTHER_EMAIL])
    const { data } = await admin
      .from('riders')
      .select('auth_user_id, linked_at')
      .eq('id', RIDER_B.id)
      .single()
    expect(data?.auth_user_id).toBeNull()
    expect(data?.linked_at).toBeNull()
  })
})
