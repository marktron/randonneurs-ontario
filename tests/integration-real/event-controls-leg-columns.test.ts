import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'

// event_controls.leg_rwgps_id + leg_name tag a control with the RWGPS
// collection member route ("leg") it was imported from. The pair is set
// together or not at all (event_controls_leg_pair CHECK); single-route
// events leave both NULL.

const IDS = {
  event: '00000000-1e6c-4000-a000-000000000001',
}
const EVENT_SLUG_PREFIX = 'inttest-leg-columns-'

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('event_controls').delete().eq('event_id', IDS.event)
  await supabase.from('events').delete().eq('id', IDS.event)
  // Also by natural key: the slug embeds a relative date, so a leftover row
  // from an interrupted run on another day has the fixed id above but a
  // different slug — and vice versa for a colliding slug without our id.
  await supabase.from('events').delete().ilike('slug', `${EVENT_SLUG_PREFIX}%`)
}

describe('event_controls leg columns (real DB)', () => {
  const supabase = getTestSupabase()

  beforeAll(async () => {
    await cleanup(supabase)
    await checked(
      supabase.from('events').insert({
        id: IDS.event,
        slug: `${EVENT_SLUG_PREFIX}${daysFromNow(14)}`,
        chapter_id: TORONTO_CHAPTER_ID,
        name: 'IntTest Leg Columns',
        event_type: 'brevet',
        distance_km: 2000,
        event_date: daysFromNow(14),
        start_time: '08:00',
        status: 'scheduled',
      }),
      'insert event'
    )
  })

  beforeEach(async () => {
    await supabase.from('event_controls').delete().eq('event_id', IDS.event)
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('accepts a row with both leg columns NULL (single-route default)', async () => {
    const { error } = await supabase.from('event_controls').insert({
      event_id: IDS.event,
      position: 1,
      name: 'Start',
      distance_km: 0,
      leg_rwgps_id: null,
      leg_name: null,
    })
    expect(error).toBeNull()
  })

  it('accepts a row with both leg columns set', async () => {
    const { error } = await supabase.from('event_controls').insert({
      event_id: IDS.event,
      position: 1,
      name: 'Gravenhurst',
      distance_km: 102.5,
      leg_rwgps_id: '12345678',
      leg_name: 'Leg 3: CCE 200 - Gravenhurst',
    })
    expect(error).toBeNull()
  })

  it('rejects leg_rwgps_id without leg_name', async () => {
    const { error } = await supabase.from('event_controls').insert({
      event_id: IDS.event,
      position: 1,
      name: 'Gravenhurst',
      distance_km: 102.5,
      leg_rwgps_id: '12345678',
      leg_name: null,
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('event_controls_leg_pair')
  })

  it('rejects leg_name without leg_rwgps_id', async () => {
    const { error } = await supabase.from('event_controls').insert({
      event_id: IDS.event,
      position: 1,
      name: 'Gravenhurst',
      distance_km: 102.5,
      leg_rwgps_id: null,
      leg_name: 'Leg 3: CCE 200 - Gravenhurst',
    })
    expect(error).not.toBeNull()
    expect(error!.message).toContain('event_controls_leg_pair')
  })
})
