import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getTestSupabase, checked } from './helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './registration/helpers'

const EVENT_ID = '00000000-5a27-4000-a000-000000000001'

describe('events ride-start columns (real DB)', () => {
  const supabase = getTestSupabase()
  const base = {
    id: EVENT_ID,
    slug: 'inttest-ride-start-columns',
    name: 'IntTest Ride Start',
    event_type: 'permanent',
    status: 'scheduled',
    chapter_id: TORONTO_CHAPTER_ID,
    distance_km: 200,
    event_date: daysFromNow(40),
    start_time: '08:00',
  }

  const cleanup = async () => {
    await supabase.from('events').delete().eq('id', EVENT_ID)
    await supabase.from('events').delete().eq('slug', base.slug)
  }
  beforeAll(cleanup)
  afterAll(cleanup)

  it('defaults direction to as_posted with no alternate start', async () => {
    await checked(supabase.from('events').insert(base), 'insert event')
    const { data } = await supabase
      .from('events')
      .select('direction, start_offset_km, start_lat, start_lng')
      .eq('id', EVENT_ID)
      .single()
    expect(data).toEqual({
      direction: 'as_posted',
      start_offset_km: null,
      start_lat: null,
      start_lng: null,
    })
    await cleanup()
  })

  it('rejects an unknown direction', async () => {
    const { error } = await supabase.from('events').insert({ ...base, direction: 'sideways' })
    expect(error?.code).toBe('23514')
  })

  it('rejects an offset without coordinates', async () => {
    const { error } = await supabase.from('events').insert({ ...base, start_offset_km: 42.3 })
    expect(error?.code).toBe('23514')
  })

  it('rejects a latitude without a longitude', async () => {
    const { error } = await supabase.from('events').insert({ ...base, start_lat: 44.1 })
    expect(error?.code).toBe('23514')
  })

  it('stores an offset to one decimal with its coordinates', async () => {
    await checked(
      supabase
        .from('events')
        .insert({ ...base, start_offset_km: 42.3, start_lat: 44.1, start_lng: -79.1 }),
      'insert event with start'
    )
    const { data } = await supabase
      .from('events')
      .select('start_offset_km')
      .eq('id', EVENT_ID)
      .single()
    expect(data!.start_offset_km).toBe(42.3)
    await cleanup()
  })
})
