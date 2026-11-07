import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'

// enforce_event_status_transition() (migration
// 20261107130000_guard_event_status_transitions.sql) holds two lifecycle rules
// at the DB layer, even for the service role:
//   1. nothing leaves 'submitted' except back to 'completed' (the
//      submitEventResults rollback when the ACP email fails);
//   2. nothing moves to 'draft' unless it is already a draft.
// The rest of the table (EVENT_STATUS_TRANSITIONS) is enforced in TypeScript.

const admin = getTestSupabase() // service role: bypasses RLS, not triggers

const ID = '00000000-2222-4000-a000-00000000f501'
const SLUG_PREFIX = 'inttest-status-guard-'
const SLUG = `${SLUG_PREFIX}200km-${daysFromNow(-10)}`

async function cleanup(): Promise<void> {
  await admin.from('events').delete().eq('id', ID)
  await admin.from('events').delete().like('slug', `${SLUG_PREFIX}%`)
}

async function seed(status: string): Promise<void> {
  await cleanup()
  await checked(
    admin
      .from('events')
      .insert({
        id: ID,
        slug: SLUG,
        name: 'Inttest Status Guard',
        chapter_id: TORONTO_CHAPTER_ID,
        event_type: 'brevet',
        distance_km: 200,
        event_date: daysFromNow(-10),
        status,
      })
      .select(),
    `seed ${status} event`
  )
}

async function currentStatus(): Promise<string> {
  const data = await checked(
    admin.from('events').select('status').eq('id', ID).single(),
    'read status'
  )
  return (data as { status: string }).status
}

beforeEach(async () => {
  await cleanup()
})

afterAll(async () => {
  await cleanup()
})

describe('enforce_event_status_transition (real DB)', () => {
  it('rejects submitted -> cancelled with check_violation and leaves the row submitted', async () => {
    await seed('submitted')

    const { error } = await admin
      .from('events')
      .update({ status: 'cancelled' })
      .eq('id', ID)
      .eq('status', 'submitted')

    expect(error?.code).toBe('23514')
    expect(await currentStatus()).toBe('submitted')
  })

  it('rejects submitted -> scheduled', async () => {
    await seed('submitted')

    const { error } = await admin.from('events').update({ status: 'scheduled' }).eq('id', ID)

    expect(error?.code).toBe('23514')
    expect(await currentStatus()).toBe('submitted')
  })

  it('rejects scheduled -> draft', async () => {
    await seed('scheduled')

    const { error } = await admin.from('events').update({ status: 'draft' }).eq('id', ID)

    expect(error?.code).toBe('23514')
    expect(await currentStatus()).toBe('scheduled')
  })

  it('allows scheduled -> completed', async () => {
    await seed('scheduled')

    await checked(
      admin.from('events').update({ status: 'completed' }).eq('id', ID).select(),
      'complete event'
    )

    expect(await currentStatus()).toBe('completed')
  })

  it('allows submitted -> completed, the sanctioned claim rollback', async () => {
    await seed('submitted')

    await checked(
      admin
        .from('events')
        .update({ status: 'completed' })
        .eq('id', ID)
        .eq('status', 'submitted')
        .select(),
      'roll back submitted claim'
    )

    expect(await currentStatus()).toBe('completed')
  })

  it('allows a write that keeps a draft a draft', async () => {
    await seed('draft')

    await checked(
      admin.from('events').update({ status: 'draft', name: 'Renamed Draft' }).eq('id', ID).select(),
      'rewrite draft'
    )

    expect(await currentStatus()).toBe('draft')
  })
})
