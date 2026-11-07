import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { AUDIT_ENTITY_TYPES } from '@/lib/audit-log'

const supabase = getTestSupabase()

const ENTITY_ID_PREFIX = 'inttest-audit-entity-types-'
const ADMIN_EMAIL = 'inttest-audit-entity-types@example.com'
let adminId: string

async function cleanup() {
  await supabase.from('audit_logs').delete().like('entity_id', `${ENTITY_ID_PREFIX}%`)
  const { data } = await supabase.from('admins').select('id').eq('email', ADMIN_EMAIL)
  for (const row of data ?? []) {
    await supabase.from('audit_logs').delete().eq('admin_id', row.id)
    await supabase.from('admins').delete().eq('id', row.id)
    await supabase.auth.admin.deleteUser(row.id)
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
    expect(error).not.toBeNull()
  })
})
