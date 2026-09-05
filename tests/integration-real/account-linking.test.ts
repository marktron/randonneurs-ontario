import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { createAuthUser, deleteAuthUsersByEmail } from './helpers/auth-users'
import { findLinkCandidates, claimRider, resolveLink } from '@/lib/account/linking'

const SHARED_EMAIL = 'inttest-link-family@example.com'
const SOLO_EMAIL = 'inttest-link-solo@example.com'
const USER_A = 'inttest-link-user-a@example.com'
const USER_B = 'inttest-link-user-b@example.com'
const RIDERS = {
  solo: { id: '00000000-10c2-4000-a000-000000000001', slug: 'inttest-link-solo' },
  parent: { id: '00000000-10c2-4000-a000-000000000002', slug: 'inttest-link-parent' },
  child: { id: '00000000-10c2-4000-a000-000000000003', slug: 'inttest-link-child' },
}
const ALL_IDS = Object.values(RIDERS).map((r) => r.id)

describe('account linking (real DB)', () => {
  const admin = getTestSupabase()
  let userA: string
  let userB: string

  async function cleanup() {
    await admin.from('audit_logs').delete().in('entity_id', ALL_IDS)
    await admin.from('riders').delete().in('id', ALL_IDS)
    await admin.from('riders').delete().in('email', [SHARED_EMAIL, SOLO_EMAIL])
    await deleteAuthUsersByEmail([USER_A, USER_B])
  }

  beforeEach(async () => {
    await cleanup()
    await checked(
      admin.from('riders').insert([
        {
          id: RIDERS.solo.id,
          slug: RIDERS.solo.slug,
          first_name: 'Solo',
          last_name: 'Rider',
          email: SOLO_EMAIL,
        },
        {
          id: RIDERS.parent.id,
          slug: RIDERS.parent.slug,
          first_name: 'Pat',
          last_name: 'Family',
          email: SHARED_EMAIL,
        },
        {
          id: RIDERS.child.id,
          slug: RIDERS.child.slug,
          first_name: 'Kim',
          last_name: 'Family',
          email: SHARED_EMAIL,
        },
      ]),
      'seed riders'
    )
    userA = await createAuthUser(USER_A)
    userB = await createAuthUser(USER_B)
  })

  afterAll(cleanup)

  it('returns unmatched when no rider carries the email', async () => {
    expect(await resolveLink({ userId: userA, email: 'nobody@example.com' })).toEqual({
      kind: 'unmatched',
    })
  })

  it('links a single candidate, case-insensitively, and audit-logs it', async () => {
    const outcome = await resolveLink({ userId: userA, email: SOLO_EMAIL.toUpperCase() })
    expect(outcome).toEqual({ kind: 'linked', riderId: RIDERS.solo.id })
    const { data } = await admin
      .from('riders')
      .select('auth_user_id, linked_at')
      .eq('id', RIDERS.solo.id)
      .single()
    expect(data?.auth_user_id).toBe(userA)
    expect(data?.linked_at).not.toBeNull()
    const { data: logs } = await admin
      .from('audit_logs')
      .select('action, actor_user_id, admin_id')
      .eq('entity_id', RIDERS.solo.id)
    expect(logs).toEqual([{ action: 'account_link', actor_user_id: userA, admin_id: null }])
  })

  it('asks to choose when several unlinked riders share the email', async () => {
    const outcome = await resolveLink({ userId: userA, email: SHARED_EMAIL })
    expect(outcome.kind).toBe('choose')
    if (outcome.kind === 'choose') {
      expect(outcome.candidates.map((c) => c.id).sort()).toEqual(
        [RIDERS.parent.id, RIDERS.child.id].sort()
      )
    }
  })

  it('excludes riders already linked to another account', async () => {
    expect(
      await claimRider({ riderId: RIDERS.parent.id, userId: userB, email: SHARED_EMAIL })
    ).toBe(true)
    const candidates = await findLinkCandidates(SHARED_EMAIL)
    expect(candidates.map((c) => c.id)).toEqual([RIDERS.child.id])
    // Only one left → auto-link
    expect(await resolveLink({ userId: userA, email: SHARED_EMAIL })).toEqual({
      kind: 'linked',
      riderId: RIDERS.child.id,
    })
  })

  it('lets exactly one of two concurrent claims win', async () => {
    const results = await Promise.all([
      claimRider({ riderId: RIDERS.solo.id, userId: userA, email: SOLO_EMAIL }),
      claimRider({ riderId: RIDERS.solo.id, userId: userB, email: SOLO_EMAIL }),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    const { data } = await admin
      .from('riders')
      .select('auth_user_id')
      .eq('id', RIDERS.solo.id)
      .single()
    expect([userA, userB]).toContain(data?.auth_user_id)
  })

  it('refuses to claim a rider whose email no longer matches', async () => {
    await checked(
      admin.from('riders').update({ email: 'moved@example.com' }).eq('id', RIDERS.solo.id),
      'change email'
    )
    expect(await claimRider({ riderId: RIDERS.solo.id, userId: userA, email: SOLO_EMAIL })).toBe(
      false
    )
  })

  it('returns false instead of throwing when the user is already linked elsewhere', async () => {
    expect(await claimRider({ riderId: RIDERS.solo.id, userId: userA, email: SOLO_EMAIL })).toBe(
      true
    )
    expect(
      await claimRider({ riderId: RIDERS.parent.id, userId: userA, email: SHARED_EMAIL })
    ).toBe(false)
  })
})
