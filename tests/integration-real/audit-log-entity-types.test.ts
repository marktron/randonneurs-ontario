import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { AUDIT_ENTITY_TYPES } from '@/lib/audit-log'

const supabase = getTestSupabase()

const ENTITY_ID_PREFIX = 'inttest-audit-entity-types-'
const ADMIN_EMAIL = 'inttest-audit-entity-types@example.com'
let adminId: string

/** Auth users with the fixture email, found by paging through the auth admin API. */
async function authUserIdsByEmail(email: string): Promise<string[]> {
  const ids: string[] = []
  const perPage = 1000
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`list auth users: ${error.message}`)
    ids.push(...data.users.filter((u) => u.email === email).map((u) => u.id))
    if (data.users.length < perPage) return ids
  }
}

// Clean up by email in both places: if a previous run created the auth user
// but failed to insert the admins row, that auth user has no admins row to
// find it by, and createUser would fail on every later run.
async function cleanup() {
  await supabase.from('audit_logs').delete().like('entity_id', `${ENTITY_ID_PREFIX}%`)
  const { data } = await supabase.from('admins').select('id').eq('email', ADMIN_EMAIL)
  for (const row of data ?? []) {
    await supabase.from('audit_logs').delete().eq('admin_id', row.id)
    await supabase.from('admins').delete().eq('id', row.id)
  }
  for (const id of await authUserIdsByEmail(ADMIN_EMAIL)) {
    await supabase.auth.admin.deleteUser(id)
  }
}

beforeAll(async () => {
  await cleanup()
  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`create auth user: ${error?.message}`)
  adminId = data.user.id
  await checked(
    supabase.from('admins').insert({ id: adminId, email: ADMIN_EMAIL, name: 'IntTest Audit' }),
    'seed admin'
  )
})

afterAll(cleanup)

describe('audit_logs entity_type CHECK matches AUDIT_ENTITY_TYPES', () => {
  it.each([...AUDIT_ENTITY_TYPES])('accepts entity_type %s', async (entityType) => {
    const { error } = await supabase.from('audit_logs').insert({
      admin_id: adminId,
      action: 'create',
      entity_type: entityType,
      entity_id: `${ENTITY_ID_PREFIX}${entityType}`,
      description: `entity type ${entityType}`,
    })
    expect(error).toBeNull()
  })

  it('still rejects an unknown entity_type', async () => {
    const { error } = await supabase.from('audit_logs').insert({
      admin_id: adminId,
      action: 'create',
      entity_type: 'not_a_real_type',
      entity_id: `${ENTITY_ID_PREFIX}bogus`,
      description: 'bogus',
    })
    // 23514 is check_violation: the CHECK rejected it, not some unrelated error.
    expect(error?.code).toBe('23514')
  })
})
