import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail } from './helpers/auth-users'

const SUPER_ADMIN_EMAIL = 'inttest-audit-delete-super-admin@example.com'
const TARGET_ADMIN_EMAIL = 'inttest-audit-delete-target-admin@example.com'
const TARGET_ADMIN_NAME = 'Inttest Admin'

let superAdminId = ''
let currentAdmin: { id: string; role: string; email: string; name: string } | null = null

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn(async () => currentAdmin),
}))

import { deleteAdminUser } from '@/lib/actions/admin-users'
import { logAuditEvent } from '@/lib/audit-log'

describe('audit_logs survives an admin delete (real DB)', () => {
  const admin = getTestSupabase()

  async function cleanup() {
    const { data: staleAdmins } = await admin
      .from('admins')
      .select('id')
      .in('email', [SUPER_ADMIN_EMAIL, TARGET_ADMIN_EMAIL])
    const staleIds = (staleAdmins ?? []).map((a) => a.id)
    if (staleIds.length > 0) {
      await admin.from('audit_logs').delete().in('admin_id', staleIds)
      await admin.from('audit_logs').delete().in('actor_user_id', staleIds)
      await admin.from('audit_logs').delete().in('entity_id', staleIds)
    }
    await admin.from('audit_logs').delete().ilike('description', `%${TARGET_ADMIN_EMAIL}%`)
    await admin.from('audit_logs').delete().ilike('description', `%${SUPER_ADMIN_EMAIL}%`)
    await admin.from('admins').delete().eq('email', SUPER_ADMIN_EMAIL)
    await admin.from('admins').delete().eq('email', TARGET_ADMIN_EMAIL)
    await deleteAuthUsersByEmail([SUPER_ADMIN_EMAIL, TARGET_ADMIN_EMAIL])
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
    currentAdmin = {
      id: superAdminId,
      role: 'super_admin',
      email: SUPER_ADMIN_EMAIL,
      name: 'Inttest Super Admin',
    }
  })

  afterAll(cleanup)

  it('keeps the audit row (admin_id nulled, actor_user_id/actor_label preserved) when the writing admin is deleted', async () => {
    const targetAdminId = await createAuthUser(TARGET_ADMIN_EMAIL)
    await checked(
      admin.from('admins').insert({
        id: targetAdminId,
        email: TARGET_ADMIN_EMAIL,
        name: TARGET_ADMIN_NAME,
        role: 'admin',
      }),
      'seed target admin'
    )

    // The target admin writes an audit row about their own action.
    await logAuditEvent({
      adminId: targetAdminId,
      actorLabel: TARGET_ADMIN_NAME,
      action: 'update',
      entityType: 'rider',
      entityId: 'some-rider-id',
      description: 'Inttest: target admin did a thing',
    })

    const before = await checked(
      admin
        .from('audit_logs')
        .select('id, admin_id, actor_user_id, actor_label')
        .eq('admin_id', targetAdminId)
        .single(),
      'read audit row before delete'
    )
    expect(before?.actor_user_id).toBe(targetAdminId)
    expect(before?.actor_label).toBe(TARGET_ADMIN_NAME)

    // Now a different (super) admin deletes the target admin.
    const result = await deleteAdminUser(targetAdminId)
    expect(result.success).toBe(true)

    // The admins row and auth user are gone.
    const { data: adminRows } = await admin.from('admins').select('id').eq('id', targetAdminId)
    expect(adminRows ?? []).toHaveLength(0)

    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const matches = authUsers.users.filter(
      (u) => u.email?.toLowerCase() === TARGET_ADMIN_EMAIL.toLowerCase()
    )
    expect(matches).toHaveLength(0)

    // But the audit row survives, with the durable actor id/label intact.
    const after = await checked(
      admin
        .from('audit_logs')
        .select('id, admin_id, actor_user_id, actor_label')
        .eq('id', before?.id)
        .single(),
      'read audit row after delete'
    )
    expect(after?.admin_id).toBeNull()
    expect(after?.actor_user_id).toBe(targetAdminId)
    expect(after?.actor_label).toBe(TARGET_ADMIN_NAME)
  })

  it('survives the delete even for a row inserted with only admin_id set (bypassing logAuditEvent)', async () => {
    const targetAdminId = await createAuthUser(TARGET_ADMIN_EMAIL)
    await checked(
      admin.from('admins').insert({
        id: targetAdminId,
        email: TARGET_ADMIN_EMAIL,
        name: TARGET_ADMIN_NAME,
        role: 'admin',
      }),
      'seed target admin'
    )

    // Direct insert, bypassing logAuditEvent: admin_id set, actor_user_id
    // explicitly NULL. Still allowed by audit_logs_actor_check.
    const inserted = await checked(
      admin
        .from('audit_logs')
        .insert({
          admin_id: targetAdminId,
          actor_user_id: null,
          action: 'update',
          entity_type: 'rider',
          entity_id: 'some-rider-id',
          description: 'Inttest: direct insert bypassing logAuditEvent',
        })
        .select('id')
        .single(),
      'direct insert audit row'
    )

    const result = await deleteAdminUser(targetAdminId)
    expect(result.success).toBe(true)

    // The row must still exist (not FK-blocked, not CHECK-blocked), and the
    // durable actor id must have been preserved by the safety-net trigger.
    const after = await checked(
      admin
        .from('audit_logs')
        .select('id, admin_id, actor_user_id')
        .eq('id', inserted?.id)
        .single(),
      'read directly-inserted audit row after delete'
    )
    expect(after?.admin_id).toBeNull()
    expect(after?.actor_user_id).toBe(targetAdminId)
  })
})
