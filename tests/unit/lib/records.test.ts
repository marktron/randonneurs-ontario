import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for records data fetching module.
 *
 * These tests verify the correct structure and behavior of record queries
 * using RPC functions for database-side aggregation.
 */

// Track RPC calls
const rpcCalls: { functionName: string; params: unknown }[] = []

// Mock RPC response data
const mockRiderRecords = [
  { rank: 1, rider_slug: 'john-doe', rider_name: 'John Doe', value: 10 },
  { rank: 2, rider_slug: 'jane-smith', rider_name: 'Jane Smith', value: 5 },
]

const mockSeasonRiderRecords = [
  { rank: 1, season: 2024, rider_slug: 'john-doe', rider_name: 'John Doe', value: 10 },
  { rank: 2, season: 2023, rider_slug: 'jane-smith', rider_name: 'Jane Smith', value: 5 },
]

const mockClubSeasonRecords = [
  { rank: 1, season: 2024, value: 150 },
  { rank: 2, season: 2023, value: 120 },
]

const mockRouteRecords = [
  {
    rank: 1,
    route_slug: 'gentle-start',
    route_name: 'Gentle Start',
    distance_km: 200,
    chapter_name: 'Toronto',
    value: 50,
  },
  {
    rank: 2,
    route_slug: 'hills-of-hockley',
    route_name: 'Hills of Hockley',
    distance_km: 200,
    chapter_name: 'Toronto',
    value: 30,
  },
]

const mockTimeRecords = [
  {
    rank: 1,
    rider_slug: 'john-doe',
    rider_name: 'John Doe',
    finish_time: '45:30:00',
    event_date: '2024-08-01',
  },
  {
    rank: 2,
    rider_slug: 'jane-smith',
    rider_name: 'Jane Smith',
    finish_time: '50:00:00',
    event_date: '2023-08-01',
  },
]

const mockStreakRecords = [
  {
    rank: 1,
    rider_slug: 'john-doe',
    rider_name: 'John Doe',
    streak_length: 8,
    streak_end_season: 2026,
  },
  {
    rank: 2,
    rider_slug: 'jane-smith',
    rider_name: 'Jane Smith',
    streak_length: 5,
    streak_end_season: 2025,
  },
]

// RPC response mapping
const rpcResponses: Record<string, unknown[]> = {
  get_rider_completion_counts: mockRiderRecords,
  get_rider_distance_totals: mockRiderRecords,
  get_rider_active_seasons: mockRiderRecords,
  get_rider_permanent_counts: mockRiderRecords,
  get_rider_award_counts: mockRiderRecords,
  get_best_season_event_counts: mockSeasonRiderRecords,
  get_best_season_distances: mockSeasonRiderRecords,
  get_current_season_distances: mockRiderRecords,
  get_season_unique_rider_counts: mockClubSeasonRecords,
  get_season_event_counts: mockClubSeasonRecords,
  get_season_total_distances: mockClubSeasonRecords,
  get_route_frequency_counts: mockRouteRecords,
  get_route_participant_counts: mockRouteRecords,
  get_pbp_completion_counts: mockRiderRecords,
  get_pbp_fastest_times: mockTimeRecords,
  get_granite_anvil_completion_counts: mockRiderRecords,
  get_granite_anvil_fastest_times: mockTimeRecords,
  get_rider_longest_streaks: mockStreakRecords,
  get_rider_sr_streaks: mockStreakRecords,
}

// Mock supabase module
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    rpc: vi.fn((functionName: string, params: unknown) => {
      rpcCalls.push({ functionName, params })
      const data = rpcResponses[functionName] ?? []
      return Promise.resolve({ data, error: null })
    }),
  })),
}))

// Import after mocks
import {
  getLifetimeRecords,
  getSeasonRecords,
  getCurrentSeasonDistance,
  getClubAchievements,
  getRouteRecords,
  getPbpRecords,
  getGraniteAnvilRecords,
} from '@/lib/data/records'

describe('Records Data Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls.length = 0
  })

  describe('getLifetimeRecords', () => {
    it('returns correctly structured lifetime records', async () => {
      const result = await getLifetimeRecords()

      expect(result).toHaveProperty('mostBrevets')
      expect(result).toHaveProperty('highestDistance')
      expect(result).toHaveProperty('mostActiveSeasons')
      expect(result).toHaveProperty('mostPermanents')
      expect(result).toHaveProperty('mostDevilWeeks')
      expect(result).toHaveProperty('mostSuperRandonneurs')
      expect(result).toHaveProperty('longestStreaks')
      expect(result).toHaveProperty('srStreaks')

      // Check structure of a record
      expect(result.mostBrevets[0]).toMatchObject({
        rank: expect.any(Number),
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        value: expect.any(Number),
      })

      // Check structure of a streak record
      expect(result.longestStreaks[0]).toMatchObject({
        rank: expect.any(Number),
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        streakLength: expect.any(Number),
        streakEndSeason: expect.any(Number),
      })
    })

    it('calls all expected RPC functions', async () => {
      await getLifetimeRecords()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_rider_completion_counts')
      expect(calledFunctions).toContain('get_rider_distance_totals')
      expect(calledFunctions).toContain('get_rider_active_seasons')
      expect(calledFunctions).toContain('get_rider_permanent_counts')
      expect(calledFunctions).toContain('get_rider_award_counts')
      expect(calledFunctions).toContain('get_rider_longest_streaks')
      expect(calledFunctions).toContain('get_rider_sr_streaks')
    })

    it('passes correct limit to RPC functions', async () => {
      await getLifetimeRecords()

      const completionCall = rpcCalls.find((c) => c.functionName === 'get_rider_completion_counts')
      expect(completionCall?.params).toEqual({ limit_count: 10 })
    })

    it('passes correct award slug for Devil Week', async () => {
      await getLifetimeRecords()

      const awardCalls = rpcCalls.filter((c) => c.functionName === 'get_rider_award_counts')
      const devilWeekCall = awardCalls.find(
        (c) => (c.params as { p_award_slug: string }).p_award_slug === 'completed-devil-week'
      )
      expect(devilWeekCall).toBeDefined()
    })
  })

  describe('getSeasonRecords', () => {
    it('returns correctly structured season records', async () => {
      const result = await getSeasonRecords()

      expect(result).toHaveProperty('mostBrevetsInSeason')
      expect(result).toHaveProperty('highestDistanceInSeason')

      // Check structure includes season
      expect(result.mostBrevetsInSeason[0]).toMatchObject({
        rank: expect.any(Number),
        season: expect.any(Number),
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        value: expect.any(Number),
      })
    })

    it('calls expected RPC functions', async () => {
      await getSeasonRecords()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_best_season_event_counts')
      expect(calledFunctions).toContain('get_best_season_distances')
    })
  })

  describe('getCurrentSeasonDistance', () => {
    it('returns array of rider records', async () => {
      const result = await getCurrentSeasonDistance()

      expect(Array.isArray(result)).toBe(true)
      if (result.length > 0) {
        expect(result[0]).toMatchObject({
          rank: expect.any(Number),
          riderSlug: expect.any(String),
          riderName: expect.any(String),
          value: expect.any(Number),
        })
      }
    })

    it('passes current season as parameter', async () => {
      await getCurrentSeasonDistance()

      const call = rpcCalls.find((c) => c.functionName === 'get_current_season_distances')
      expect(call?.params).toMatchObject({
        p_season: expect.any(Number),
        limit_count: 10,
      })
    })
  })

  describe('getClubAchievements', () => {
    it('returns correctly structured club achievements', async () => {
      const result = await getClubAchievements()

      expect(result).toHaveProperty('mostUniqueRiders')
      expect(result).toHaveProperty('mostBrevetsOrganized')
      expect(result).toHaveProperty('highestCumulativeDistance')

      // Check structure (season-based, no rider info)
      expect(result.mostUniqueRiders[0]).toMatchObject({
        rank: expect.any(Number),
        season: expect.any(Number),
        value: expect.any(Number),
      })
    })

    it('calls expected RPC functions', async () => {
      await getClubAchievements()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_season_unique_rider_counts')
      expect(calledFunctions).toContain('get_season_event_counts')
      expect(calledFunctions).toContain('get_season_total_distances')
    })
  })

  describe('getRouteRecords', () => {
    it('returns correctly structured route records', async () => {
      const result = await getRouteRecords()

      expect(result).toHaveProperty('byFrequency')
      expect(result).toHaveProperty('byParticipants')

      // Check structure includes route info
      expect(result.byFrequency[0]).toMatchObject({
        rank: expect.any(Number),
        routeSlug: expect.any(String),
        routeName: expect.any(String),
        distanceKm: expect.any(Number),
        value: expect.any(Number),
      })
    })

    it('calls expected RPC functions', async () => {
      await getRouteRecords()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_route_frequency_counts')
      expect(calledFunctions).toContain('get_route_participant_counts')
    })
  })

  describe('getPbpRecords', () => {
    it('returns correctly structured PBP records', async () => {
      const result = await getPbpRecords()

      expect(result).toHaveProperty('mostCompletions')
      expect(result).toHaveProperty('fastestTimes')

      // Check completions structure
      expect(result.mostCompletions[0]).toMatchObject({
        rank: expect.any(Number),
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        value: expect.any(Number),
      })

      // Check time records structure
      expect(result.fastestTimes[0]).toMatchObject({
        rank: expect.any(Number),
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        time: expect.any(String),
        eventDate: expect.any(String),
      })
    })

    it('calls expected RPC functions', async () => {
      await getPbpRecords()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_pbp_completion_counts')
      expect(calledFunctions).toContain('get_pbp_fastest_times')
    })
  })

  describe('getGraniteAnvilRecords', () => {
    it('returns correctly structured Granite Anvil records', async () => {
      const result = await getGraniteAnvilRecords()

      expect(result).toHaveProperty('mostCompletions')
      expect(result).toHaveProperty('fastestTimes')
    })

    it('calls expected RPC functions', async () => {
      await getGraniteAnvilRecords()

      const calledFunctions = rpcCalls.map((c) => c.functionName)
      expect(calledFunctions).toContain('get_granite_anvil_completion_counts')
      expect(calledFunctions).toContain('get_granite_anvil_fastest_times')
    })
  })
})
