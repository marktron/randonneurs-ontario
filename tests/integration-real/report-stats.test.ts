import { describe, it, expect } from 'vitest'
import { getTestSupabase } from './helpers/supabase'

describe('Report RPC functions', () => {
  const supabase = getTestSupabase()
  const testSeason = 2025

  it('get_report_membership_stats returns expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_membership_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty('total_members')
    expect(data![0]).toHaveProperty('new_members')
    expect(data![0]).toHaveProperty('returning_members')
    expect(data![0]).toHaveProperty('prior_year_members')
  })

  it('get_report_participation_stats returns expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_participation_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty('unique_riders')
    expect(data![0]).toHaveProperty('total_finishes')
    expect(data![0]).toHaveProperty('total_km')
  })

  it('get_report_event_stats returns rows with expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_event_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('distance_bucket')
      expect(data![0]).toHaveProperty('event_count')
      expect(data![0]).toHaveProperty('total_riders')
    }
  })

  it('get_report_top_riders returns rows with expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_top_riders', {
      p_season: testSeason,
      p_limit: 5,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('rider_id')
      expect(data![0]).toHaveProperty('first_name')
      expect(data![0]).toHaveProperty('events_finished')
      expect(data![0]).toHaveProperty('total_km')
    }
  })

  it('get_report_yoy_summary returns 5 seasons', async () => {
    const { data, error } = await supabase.rpc('get_report_yoy_summary', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(5)
    expect(data![0]).toHaveProperty('season')
    expect(data![0]).toHaveProperty('members')
    expect(data![0]).toHaveProperty('events')
    expect(data![0]).toHaveProperty('riders')
    expect(data![0]).toHaveProperty('total_km')
  })

  it('get_report_non_renewed_riders returns expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_non_renewed_riders', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('rider_id')
      expect(data![0]).toHaveProperty('first_name')
      expect(data![0]).toHaveProperty('last_name')
    }
  })

  it('filters by chapter when p_chapter_id is provided', async () => {
    const { data: chapters } = await supabase.from('chapters').select('id').limit(1).single()

    if (!chapters) return

    const { data, error } = await supabase.rpc('get_report_participation_stats', {
      p_season: testSeason,
      p_chapter_id: chapters.id,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
