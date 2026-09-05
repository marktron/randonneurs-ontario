import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail } from './helpers/auth-users'

const ADMIN_EMAIL = 'inttest-merge-admin@example.com'
const USER_A = 'inttest-merge-user-a@example.com'
const USER_B = 'inttest-merge-user-b@example.com'
const RIDERS = {
  target: { id: '00000000-10c4-4000-a000-000000000001', slug: 'inttest-merge-target' },
  source: { id: '00000000-10c4-4000-a000-000000000002', slug: 'inttest-merge-source' },
}
let adminId = ''

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(async () => ({
    id: adminId,
    role: 'super_admin',
    email: ADMIN_EMAIL,
    name: 'Inttest Admin',
  })),
}))

import { mergeRiders } from '@/lib/actions/riders'

describe('mergeRiders with linked accounts (real DB)', () => {
  const admin = getTestSupabase()

  async function cleanup() {
    await admin.from('audit_logs').delete().in('entity_id', [RIDERS.target.id, RIDERS.source.id])
    await admin.from('riders').delete().in('id', [RIDERS.target.id, RIDERS.source.id])
    await admin.from('admins').delete().eq('email', ADMIN_EMAIL)
    await deleteAuthUsersByEmail([ADMIN_EMAIL, USER_A, USER_B])
  }

  beforeEach(async () => {
    await cleanup()
    adminId = await createAuthUser(ADMIN_EMAIL)
    await checked(
      admin
        .from('admins')
        .insert({ id: adminId, email: ADMIN_EMAIL, name: 'Inttest Admin', role: 'super_admin' }),
      'seed admin'
    )
    await checked(
      admin.from('riders').insert([
        {
          id: RIDERS.target.id,
          slug: RIDERS.target.slug,
          first_name: 'Target',
          last_name: 'Rider',
          bio: null,
        },
        {
          id: RIDERS.source.id,
          slug: RIDERS.source.slug,
          first_name: 'Source',
          last_name: 'Rider',
          bio: 'from source',
        },
      ]),
      'seed riders'
    )
  })

  afterAll(cleanup)

  async function merge() {
    return mergeRiders({
      sourceRiderIds: [RIDERS.target.id, RIDERS.source.id],
      targetRiderId: RIDERS.target.id,
      riderData: { firstName: 'Target', lastName: 'Rider', email: null, gender: null },
    })
  }

  it('moves a source-only link to the target and keeps the first non-null bio', async () => {
    const userA = await createAuthUser(USER_A)
    await checked(
      admin
        .from('riders')
        .update({ auth_user_id: userA, linked_at: new Date().toISOString() })
        .eq('id', RIDERS.source.id),
      'link source'
    )
    const result = await merge()
    expect(result.success).toBe(true)
    const { data } = await admin
      .from('riders')
      .select('auth_user_id, linked_at, bio')
      .eq('id', RIDERS.target.id)
      .single()
    expect(data?.auth_user_id).toBe(userA)
    expect(data?.linked_at).not.toBeNull()
    expect(data?.bio).toBe('from source')
  })

  it('keeps the target link when both are linked and records the dropped one', async () => {
    const userA = await createAuthUser(USER_A)
    const userB = await createAuthUser(USER_B)
    const now = new Date().toISOString()
    await checked(
      admin
        .from('riders')
        .update({ auth_user_id: userA, linked_at: now })
        .eq('id', RIDERS.target.id),
      'link target'
    )
    await checked(
      admin
        .from('riders')
        .update({ auth_user_id: userB, linked_at: now })
        .eq('id', RIDERS.source.id),
      'link source'
    )
    const result = await merge()
    expect(result.success).toBe(true)
    const { data } = await admin
      .from('riders')
      .select('auth_user_id')
      .eq('id', RIDERS.target.id)
      .single()
    expect(data?.auth_user_id).toBe(userA)
    const { data: logs } = await admin
      .from('audit_logs')
      .select('description')
      .eq('entity_id', RIDERS.target.id)
      .eq('action', 'merge')
    expect(logs?.[0]?.description).toMatch(/dropped account link/i)
  })
})
