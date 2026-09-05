import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail, getAnonClient } from './helpers/auth-users'

const SUPER_ADMIN_EMAIL = 'inttest-promote-super-admin@example.com'
const RIDER_EMAIL = 'inttest-promote-rider@example.com'
const RIDER = { id: '00000000-10c5-4000-a000-000000000001', slug: 'inttest-promote-rider' }

let superAdminId = ''

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(async () => ({
    id: superAdminId,
    role: 'super_admin',
    email: SUPER_ADMIN_EMAIL,
    name: 'Inttest Super Admin',
  })),
}))

import { createAdminUser } from '@/lib/actions/admin-users'

describe('createAdminUser promoting an existing rider (real DB)', () => {
  const admin = getTestSupabase()

  async function cleanup() {
    // The audit log for createAdminUser records entity_id = the promoted
    // user's auth id (generated fresh per test run), not the rider's row id,
    // so match on the description text (which embeds the email) instead.
    await admin.from('audit_logs').delete().ilike('description', `%${RIDER_EMAIL}%`)
    await admin.from('audit_logs').delete().ilike('description', `%${SUPER_ADMIN_EMAIL}%`)
    await admin.from('riders').delete().in('id', [RIDER.id])
    await admin.from('riders').delete().eq('email', RIDER_EMAIL)
    await admin.from('admins').delete().eq('email', SUPER_ADMIN_EMAIL)
    await admin.from('admins').delete().eq('email', RIDER_EMAIL)
    await deleteAuthUsersByEmail([SUPER_ADMIN_EMAIL, RIDER_EMAIL])
  }

  beforeEach(async () => {
    await cleanup()
    superAdminId = await createAuthUser(SUPER_ADMIN_EMAIL)
    await checked(
      admin.from('admins').insert({
        id: superAdminId,
        email: SUPER_ADMIN_EMAIL,
        name: 'Inttest Super Admin',
        role: 'super_admin',
      }),
      'seed super admin'
    )
  })

  afterAll(cleanup)

  it('reuses the rider auth user, links an admins row, and leaves the rider link intact', async () => {
    const riderUserId = await createAuthUser(RIDER_EMAIL)
    await checked(
      admin.from('riders').insert({
        id: RIDER.id,
        slug: RIDER.slug,
        first_name: 'Promote',
        last_name: 'Rider',
        email: RIDER_EMAIL,
        auth_user_id: riderUserId,
        linked_at: new Date().toISOString(),
      }),
      'seed rider'
    )

    const result = await createAdminUser({
      email: RIDER_EMAIL,
      name: 'Promote Rider',
      password: 'password123',
      role: 'admin',
    })

    expect(result.success).toBe(true)

    // Exactly one auth user with that email still exists, with the same id.
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const matches = authUsers.users.filter(
      (u) => u.email?.toLowerCase() === RIDER_EMAIL.toLowerCase()
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(riderUserId)

    // An admins row exists with that id.
    const adminRow = await checked(
      admin.from('admins').select('id, role').eq('id', riderUserId).single(),
      'read admin row'
    )
    expect(adminRow).toMatchObject({ id: riderUserId, role: 'admin' })

    // The rider's auth_user_id is unchanged.
    const riderRow = await checked(
      admin.from('riders').select('auth_user_id').eq('id', RIDER.id).single(),
      'read rider row'
    )
    expect(riderRow?.auth_user_id).toBe(riderUserId)
  })

  it('does not delete the existing auth user when the admins insert fails', async () => {
    const riderUserId = await createAuthUser(RIDER_EMAIL)
    await checked(
      admin.from('riders').insert({
        id: RIDER.id,
        slug: RIDER.slug,
        first_name: 'Promote',
        last_name: 'Rider',
        email: RIDER_EMAIL,
        auth_user_id: riderUserId,
        linked_at: new Date().toISOString(),
      }),
      'seed rider'
    )

    // Pre-insert the admins row so the action's own insert hits a duplicate.
    await checked(
      admin.from('admins').insert({
        id: riderUserId,
        email: RIDER_EMAIL,
        name: 'Existing Admin Row',
        role: 'admin',
      }),
      'seed pre-existing admin row'
    )

    const result = await createAdminUser({
      email: RIDER_EMAIL,
      name: 'Promote Rider',
      password: 'password123',
      role: 'admin',
    })

    expect(result.success).toBe(false)

    // The auth user must still exist after the failed insert.
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const matches = authUsers.users.filter(
      (u) => u.email?.toLowerCase() === RIDER_EMAIL.toLowerCase()
    )
    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(riderUserId)
  })

  it('refuses to promote an email that already belongs to an admin, and leaves the password unchanged', async () => {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: RIDER_EMAIL,
      password: 'OldPassword123!',
      email_confirm: true,
    })
    if (authError || !authData.user) {
      throw new Error(`[integration-real] createUser(${RIDER_EMAIL}): ${authError?.message}`)
    }
    const riderUserId = authData.user.id

    await checked(
      admin.from('admins').insert({
        id: riderUserId,
        email: RIDER_EMAIL,
        name: 'Existing Admin Row',
        role: 'admin',
      }),
      'seed pre-existing admin row'
    )

    const result = await createAdminUser({
      email: RIDER_EMAIL,
      name: 'Promote Rider',
      password: 'NewPassword456!',
      role: 'admin',
    })

    expect(result.success).toBe(false)

    // The old password must still work — it was never overwritten.
    const { error: signInError } = await getAnonClient().auth.signInWithPassword({
      email: RIDER_EMAIL,
      password: 'OldPassword123!',
    })
    expect(signInError).toBeNull()
  })
})
