import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for records data fetching functions.
 *
 * These tests verify RPC calls and data transformation.
 */

vi.mock('@/lib/supabase', () => {
  // Shared RPC mock - created once and reused
  const rpcMock = vi.fn().mockResolvedValue({ data: [], error: null })

  return {
    getSupabase: vi.fn(() => ({
      rpc: rpcMock,
    })),
    __rpcMock: rpcMock,
    __resetRpc: () => {
      rpcMock.mockReset()
      rpcMock.mockResolvedValue({ data: [], error: null })
    },
  }
})

vi.mock('react', () => ({
  cache: vi.fn((fn) => fn),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((error, context, fallback) => fallback),
}))

vi.mock('@/lib/utils', () => ({
  formatFinishTime: vi.fn((time: string | null) => time || null),
}))

vi.stubEnv('NEXT_PUBLIC_CURRENT_SEASON', '2025')

import { getLifetimeRecords, getSeasonRecords, getCurrentSeasonDistance } from '@/lib/data/records'

describe('getLifetimeRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty records when no data', async () => {
    const result = await getLifetimeRecords()

    expect(result.mostBrevets).toEqual([])
    expect(result.highestDistance).toEqual([])
    expect(result.mostActiveSeasons).toEqual([])
  })

  it('handles RPC errors gracefully', async () => {
    const mock = await vi.importMock<{ __rpcMock: ReturnType<typeof vi.fn> }>('@/lib/supabase')
    mock.__rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC error' },
    })

    const result = await getLifetimeRecords()

    expect(result.mostBrevets).toEqual([])
  })
})

describe('getSeasonRecords', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty records when no data', async () => {
    const result = await getSeasonRecords()

    expect(result.mostBrevetsInSeason).toEqual([])
    expect(result.highestDistanceInSeason).toEqual([])
  })
})

describe('getCurrentSeasonDistance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns empty array when no data', async () => {
    const result = await getCurrentSeasonDistance()

    expect(result).toEqual([])
  })

  it('calls RPC with current season', async () => {
    const mock = await vi.importMock<{ __rpcMock: ReturnType<typeof vi.fn> }>('@/lib/supabase')
    await getCurrentSeasonDistance()

    expect(mock.__rpcMock).toHaveBeenCalledWith(
      'get_current_season_distances',
      expect.objectContaining({
        p_season: 2025,
      })
    )
  })
})
