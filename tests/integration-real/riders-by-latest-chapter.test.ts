import { describe, it, expect } from 'vitest'
import { getTestSupabase } from './helpers/supabase'

describe('get_riders_by_latest_chapter RPC', () => {
  const supabase = getTestSupabase()

  it('returns expected shape with rider_id and total_count', async () => {
    // Get a chapter name that has memberships
    const { data: membership } = await supabase
      .from('rider_memberships')
      .select('chapters (name)')
      .limit(1)
      .single()

    if (!membership?.chapters) return

    const chapterName = (membership.chapters as { name: string }).name
    const { data, error } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('rider_id')
      expect(data![0]).toHaveProperty('total_count')
      expect(Number(data![0].total_count)).toBeGreaterThan(0)
    }
  })

  it('returns empty array for non-existent chapter', async () => {
    const { data, error } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: 'NonExistent Chapter XYZ',
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('respects p_limit parameter', async () => {
    const { data: membership } = await supabase
      .from('rider_memberships')
      .select('chapters (name)')
      .limit(1)
      .single()

    if (!membership?.chapters) return

    const chapterName = (membership.chapters as { name: string }).name
    const { data, error } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
      p_limit: 2,
    })
    expect(error).toBeNull()
    expect(data!.length).toBeLessThanOrEqual(2)
  })

  it('total_count reflects full filtered set regardless of limit', async () => {
    const { data: membership } = await supabase
      .from('rider_memberships')
      .select('chapters (name)')
      .limit(1)
      .single()

    if (!membership?.chapters) return

    const chapterName = (membership.chapters as { name: string }).name

    // Get all results (no limit)
    const { data: allData } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
      p_limit: 1000,
    })
    const fullCount = allData?.length ?? 0

    if (fullCount < 2) return

    // Get limited results
    const { data: limitedData } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
      p_limit: 1,
    })
    expect(limitedData).toHaveLength(1)
    expect(Number(limitedData![0].total_count)).toBe(fullCount)
  })

  it('filters by search term', async () => {
    // Get a rider who has a membership
    const { data: membership } = await supabase
      .from('rider_memberships')
      .select('rider_id, chapters (name)')
      .limit(1)
      .single()

    if (!membership?.chapters) return

    const chapterName = (membership.chapters as { name: string }).name

    // Get the rider's name for a search term
    const { data: rider } = await supabase
      .from('riders')
      .select('last_name')
      .eq('id', membership.rider_id)
      .single()

    if (!rider) return

    const { data, error } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
      p_search: rider.last_name,
    })
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    // The searched rider should be in results
    expect(data!.some((r) => r.rider_id === membership.rider_id)).toBe(true)
  })

  it('returns only riders whose latest membership matches the chapter', async () => {
    const { data: chapters } = await supabase.from('chapters').select('id, name')
    if (!chapters || chapters.length < 2) return

    const chapterName = chapters[0].name
    const { data, error } = await supabase.rpc('get_riders_by_latest_chapter', {
      p_chapter_name: chapterName,
    })
    expect(error).toBeNull()

    // Verify each returned rider's latest membership is in the expected chapter
    for (const row of data ?? []) {
      const { data: memberships } = await supabase
        .from('rider_memberships')
        .select('season, chapter_id')
        .eq('rider_id', row.rider_id)
        .order('season', { ascending: false })
        .limit(1)
        .single()

      expect(memberships).not.toBeNull()
      expect(memberships!.chapter_id).toBe(chapters[0].id)
    }
  })
})
