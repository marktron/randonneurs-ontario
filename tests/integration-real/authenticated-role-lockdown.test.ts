import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, createUserClient, deleteAuthUsersByEmail } from './helpers/auth-users'

const USER_EMAIL = 'inttest-lockdown-user@example.com'
const RIDER = {
  id: '00000000-10c0-4000-a000-000000000001',
  slug: 'inttest-lockdown-rider',
  email: 'inttest-lockdown-rider@example.com',
}
const OBJECT_PATH = 'inttest-lockdown/protected.txt'

describe('authenticated role lockdown (real DB)', () => {
  const admin = getTestSupabase()
  let user: SupabaseClient

  async function cleanup() {
    await admin.from('riders').delete().eq('id', RIDER.id)
    await admin.from('riders').delete().eq('email', RIDER.email)
    await admin.storage.from('rider-submissions').remove([OBJECT_PATH])
    await deleteAuthUsersByEmail([USER_EMAIL])
  }

  beforeAll(async () => {
    await cleanup()
    await checked(
      admin.from('riders').insert({
        id: RIDER.id,
        slug: RIDER.slug,
        first_name: 'Inttest',
        last_name: 'Lockdown',
        email: RIDER.email,
        phone: '555-0100',
        emergency_contact_name: 'Someone',
        emergency_contact_phone: '555-0101',
      }),
      'seed rider'
    )
    await checked(
      admin.storage
        .from('rider-submissions')
        .upload(OBJECT_PATH, new Blob(['protected'], { type: 'text/xml' }), {
          contentType: 'text/xml',
          upsert: true,
        }),
      'seed storage object'
    )
    await createAuthUser(USER_EMAIL)
    user = await createUserClient(USER_EMAIL)
  })

  afterAll(cleanup)

  it('signed-in client really is authenticated, not anon', async () => {
    const { data } = await user.auth.getUser()
    expect(data.user?.email).toBe(USER_EMAIL)
  })

  it('can read the public rider columns', async () => {
    const { data, error } = await user
      .from('riders')
      .select('id, slug, first_name, last_name, gender, rider_number, created_at, updated_at')
      .eq('id', RIDER.id)
      .single()
    expect(error).toBeNull()
    expect(data?.slug).toBe(RIDER.slug)
  })

  it.each(['email', 'phone', 'emergency_contact_name', 'emergency_contact_phone', 'hidden'])(
    'cannot read riders.%s',
    async (column) => {
      const { error } = await user.from('riders').select(column).eq('id', RIDER.id)
      expect(error?.code).toBe('42501')
    }
  )

  it('cannot read the registrations base table at all', async () => {
    const { error } = await user.from('registrations').select('id').limit(1)
    expect(error?.code).toBe('42501')
  })

  it('cannot read results.submission_token', async () => {
    const { error } = await user.from('results').select('submission_token').limit(1)
    expect(error?.code).toBe('42501')
  })

  it('can still read the public views', async () => {
    const regs = await user.from('public_registrations').select('id').limit(1)
    const results = await user.from('public_results').select('id').limit(1)
    const riders = await user.from('public_riders').select('id').limit(1)
    expect(regs.error).toBeNull()
    expect(results.error).toBeNull()
    expect(riders.error).toBeNull()
  })

  it('cannot insert, update or delete riders', async () => {
    const upd = await user.from('riders').update({ first_name: 'Hacked' }).eq('id', RIDER.id)
    expect(upd.error?.code).toBe('42501')
    const ins = await user
      .from('riders')
      .insert({ slug: 'inttest-lockdown-x', first_name: 'X', last_name: 'Y' })
    expect(ins.error?.code).toBe('42501')
    const del = await user.from('riders').delete().eq('id', RIDER.id)
    expect(del.error?.code).toBe('42501')
    const { data } = await admin.from('riders').select('first_name').eq('id', RIDER.id).single()
    expect(data?.first_name).toBe('Inttest')
  })

  it('cannot read event_controls or control_checkins', async () => {
    const controls = await user.from('event_controls').select('id').limit(1)
    const checkins = await user.from('control_checkins').select('id').limit(1)
    expect(controls.error?.code).toBe('42501')
    expect(checkins.error?.code).toBe('42501')
  })

  it('cannot upload to any bucket', async () => {
    for (const bucket of ['images', 'rider-submissions']) {
      const { error } = await user.storage
        .from(bucket)
        .upload(`inttest-lockdown/${Date.now()}.txt`, new Blob(['x']), {
          contentType: 'text/plain',
        })
      expect(error, bucket).not.toBeNull()
    }
  })

  it('cannot overwrite or delete an existing rider-submissions object', async () => {
    await user.storage
      .from('rider-submissions')
      .upload(OBJECT_PATH, new Blob(['tampered']), { contentType: 'text/plain', upsert: true })
    await user.storage.from('rider-submissions').remove([OBJECT_PATH])
    const { data, error } = await admin.storage.from('rider-submissions').download(OBJECT_PATH)
    expect(error).toBeNull()
    expect(await data?.text()).toBe('protected')
  })
})
