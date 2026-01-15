/**
 * Records Data Fetching Module
 *
 * This module contains all READ operations for club records and rankings.
 * It provides aggregated statistics for the /records page.
 *
 * CACHING STRATEGY:
 * - Historical records: 24 hours (86400 seconds)
 * - Current season data: 1 hour (3600 seconds)
 *
 * All functions use database-side aggregation via PostgreSQL functions
 * for optimal performance (returning only top N results instead of all rows).
 */
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { handleDataError } from '@/lib/errors'
import { formatFinishTime } from '@/lib/utils'
import type {
  LifetimeRecords,
  SeasonRecords,
  ClubAchievements,
  RouteRecords,
  PbpRecords,
  GraniteAnvilRecords,
  RiderRecord,
  RiderTimeRecord,
  SeasonRiderRecord,
  ClubSeasonRecord,
  RouteRecord,
  StreakRecord,
} from '@/types/records'

const RECORD_LIMIT = 10
const CACHE_TTL_HISTORICAL = 86400 // 24 hours
const CACHE_TTL_CURRENT = 3600 // 1 hour

// Helper to convert RPC result to RiderRecord array
function toRiderRecords(
  data: Array<{ rank: number; rider_slug: string; rider_name: string; value: number }> | null
): RiderRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    value: Number(row.value),
  }))
}

// Helper to convert RPC result to SeasonRiderRecord array
function toSeasonRiderRecords(
  data: Array<{
    rank: number
    season: number
    rider_slug: string
    rider_name: string
    value: number
  }> | null
): SeasonRiderRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    season: row.season,
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    value: Number(row.value),
  }))
}

// Helper to convert RPC result to ClubSeasonRecord array
function toClubSeasonRecords(
  data: Array<{ rank: number; season: number; value: number }> | null
): ClubSeasonRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    season: row.season,
    value: Number(row.value),
  }))
}

// Helper to convert RPC result to RouteRecord array
function toRouteRecords(
  data: Array<{
    rank: number
    route_slug: string
    route_name: string
    distance_km: number | null
    chapter_name: string | null
    value: number
  }> | null
): RouteRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    routeSlug: row.route_slug,
    routeName: row.route_name,
    distanceKm: row.distance_km ?? 0,
    chapterName: row.chapter_name,
    value: Number(row.value),
  }))
}

// Helper to convert RPC result to RiderTimeRecord array
function toRiderTimeRecords(
  data: Array<{
    rank: number
    rider_slug: string
    rider_name: string
    finish_time: string
    event_date: string
  }> | null
): RiderTimeRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    time: formatFinishTime(row.finish_time) ?? '',
    eventDate: row.event_date,
  }))
}

// Helper to convert RPC result to StreakRecord array
function toStreakRecords(
  data: Array<{
    rank: number
    rider_slug: string
    rider_name: string
    streak_length: number
    streak_end_season: number
  }> | null
): StreakRecord[] {
  if (!data) return []
  return data.map((row) => ({
    rank: row.rank,
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    streakLength: row.streak_length,
    streakEndSeason: row.streak_end_season,
  }))
}

// ============================================================================
// LIFETIME ACHIEVEMENTS
// ============================================================================

const getLifetimeRecordsInner = cache(async (): Promise<LifetimeRecords> => {
  const supabase = getSupabase()
  const currentSeason = parseInt(process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026', 10)

  // Fetch all lifetime records in parallel using database functions
  const [
    completionsResult,
    distanceResult,
    seasonsResult,
    permanentsResult,
    devilWeekResult,
    superRandonneurResult,
    longestStreaksResult,
    srStreaksResult,
  ] = await Promise.all([
    supabase.rpc('get_rider_completion_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_rider_distance_totals', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_rider_active_seasons', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_rider_permanent_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_rider_award_counts', {
      p_award_slug: 'completed-devil-week',
      limit_count: RECORD_LIMIT,
    }),
    supabase.rpc('get_rider_award_counts', {
      p_award_slug: 'super-randonneur',
      limit_count: RECORD_LIMIT,
    }),
    supabase.rpc('get_rider_longest_streaks', {
      p_current_season: currentSeason,
      limit_count: RECORD_LIMIT,
    }),
    supabase.rpc('get_rider_sr_streaks', {
      p_current_season: currentSeason,
      limit_count: RECORD_LIMIT,
    }),
  ])

  // Handle errors
  if (completionsResult.error) {
    return handleDataError(
      completionsResult.error,
      { operation: 'getLifetimeRecords.completions' },
      {
        mostBrevets: [],
        highestDistance: [],
        mostActiveSeasons: [],
        mostDevilWeeks: [],
        mostSuperRandonneurs: [],
        mostPermanents: [],
        longestStreaks: [],
        srStreaks: [],
      }
    )
  }

  // Log streak errors but don't fail the whole request
  if (longestStreaksResult.error) {
    console.error('Error fetching longest streaks:', longestStreaksResult.error)
  }
  if (srStreaksResult.error) {
    console.error('Error fetching SR streaks:', srStreaksResult.error)
  }

  return {
    mostBrevets: toRiderRecords(completionsResult.data),
    highestDistance: toRiderRecords(distanceResult.data),
    mostActiveSeasons: toRiderRecords(seasonsResult.data),
    mostPermanents: toRiderRecords(permanentsResult.data),
    mostDevilWeeks: toRiderRecords(devilWeekResult.data),
    mostSuperRandonneurs: toRiderRecords(superRandonneurResult.data),
    longestStreaks: toStreakRecords(longestStreaksResult.data ?? null),
    srStreaks: toStreakRecords(srStreaksResult.data ?? null),
  }
})

export async function getLifetimeRecords(): Promise<LifetimeRecords> {
  return unstable_cache(async () => getLifetimeRecordsInner(), ['records-lifetime'], {
    tags: ['records', 'records-lifetime'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// SEASON RECORDS
// ============================================================================

const getSeasonRecordsInner = cache(async (): Promise<SeasonRecords> => {
  const supabase = getSupabase()

  const [eventsResult, distanceResult] = await Promise.all([
    supabase.rpc('get_best_season_event_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_best_season_distances', { limit_count: RECORD_LIMIT }),
  ])

  if (eventsResult.error) {
    return handleDataError(
      eventsResult.error,
      { operation: 'getSeasonRecords' },
      {
        mostBrevetsInSeason: [],
        highestDistanceInSeason: [],
      }
    )
  }

  return {
    mostBrevetsInSeason: toSeasonRiderRecords(eventsResult.data),
    highestDistanceInSeason: toSeasonRiderRecords(distanceResult.data),
  }
})

export async function getSeasonRecords(): Promise<SeasonRecords> {
  return unstable_cache(async () => getSeasonRecordsInner(), ['records-season'], {
    tags: ['records', 'records-season'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// CURRENT SEASON DISTANCE
// ============================================================================

const getCurrentSeasonDistanceInner = cache(async (): Promise<RiderRecord[]> => {
  const currentSeason = parseInt(process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026', 10)
  const supabase = getSupabase()

  const { data, error } = await supabase.rpc('get_current_season_distances', {
    p_season: currentSeason,
    limit_count: RECORD_LIMIT,
  })

  if (error) {
    return handleDataError(error, { operation: 'getCurrentSeasonDistance' }, [])
  }

  return toRiderRecords(data)
})

export async function getCurrentSeasonDistance(): Promise<RiderRecord[]> {
  return unstable_cache(async () => getCurrentSeasonDistanceInner(), ['records-current-season'], {
    tags: ['records', 'records-current-season'],
    revalidate: CACHE_TTL_CURRENT,
  })()
}

// ============================================================================
// CLUB ACHIEVEMENTS
// ============================================================================

const getClubAchievementsInner = cache(async (): Promise<ClubAchievements> => {
  const supabase = getSupabase()

  const [ridersResult, eventsResult, distanceResult] = await Promise.all([
    supabase.rpc('get_season_unique_rider_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_season_event_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_season_total_distances', { limit_count: RECORD_LIMIT }),
  ])

  if (ridersResult.error) {
    return handleDataError(
      ridersResult.error,
      { operation: 'getClubAchievements' },
      {
        mostUniqueRiders: [],
        mostBrevetsOrganized: [],
        highestCumulativeDistance: [],
      }
    )
  }

  return {
    mostUniqueRiders: toClubSeasonRecords(ridersResult.data),
    mostBrevetsOrganized: toClubSeasonRecords(eventsResult.data),
    highestCumulativeDistance: toClubSeasonRecords(distanceResult.data),
  }
})

export async function getClubAchievements(): Promise<ClubAchievements> {
  return unstable_cache(async () => getClubAchievementsInner(), ['records-club'], {
    tags: ['records', 'records-club'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// ROUTE POPULARITY
// ============================================================================

const getRouteRecordsInner = cache(async (): Promise<RouteRecords> => {
  const supabase = getSupabase()

  const [frequencyResult, participantsResult] = await Promise.all([
    supabase.rpc('get_route_frequency_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_route_participant_counts', { limit_count: RECORD_LIMIT }),
  ])

  if (frequencyResult.error) {
    return handleDataError(
      frequencyResult.error,
      { operation: 'getRouteRecords' },
      {
        byFrequency: [],
        byParticipants: [],
      }
    )
  }

  return {
    byFrequency: toRouteRecords(frequencyResult.data),
    byParticipants: toRouteRecords(participantsResult.data),
  }
})

export async function getRouteRecords(): Promise<RouteRecords> {
  return unstable_cache(async () => getRouteRecordsInner(), ['records-routes'], {
    tags: ['records', 'records-routes'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// PARIS-BREST-PARIS RECORDS
// ============================================================================

const getPbpRecordsInner = cache(async (): Promise<PbpRecords> => {
  const supabase = getSupabase()

  const [completionsResult, timesResult] = await Promise.all([
    supabase.rpc('get_pbp_completion_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_pbp_fastest_times', { limit_count: RECORD_LIMIT }),
  ])

  if (completionsResult.error) {
    return handleDataError(
      completionsResult.error,
      { operation: 'getPbpRecords' },
      {
        mostCompletions: [],
        fastestTimes: [],
      }
    )
  }

  return {
    mostCompletions: toRiderRecords(completionsResult.data),
    fastestTimes: toRiderTimeRecords(timesResult.data),
  }
})

export async function getPbpRecords(): Promise<PbpRecords> {
  return unstable_cache(async () => getPbpRecordsInner(), ['records-pbp'], {
    tags: ['records', 'records-pbp'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// GRANITE ANVIL RECORDS
// ============================================================================

const getGraniteAnvilRecordsInner = cache(async (): Promise<GraniteAnvilRecords> => {
  const supabase = getSupabase()

  const [completionsResult, timesResult] = await Promise.all([
    supabase.rpc('get_granite_anvil_completion_counts', { limit_count: RECORD_LIMIT }),
    supabase.rpc('get_granite_anvil_fastest_times', { limit_count: RECORD_LIMIT }),
  ])

  if (completionsResult.error) {
    return handleDataError(
      completionsResult.error,
      { operation: 'getGraniteAnvilRecords' },
      {
        mostCompletions: [],
        fastestTimes: [],
      }
    )
  }

  return {
    mostCompletions: toRiderRecords(completionsResult.data),
    fastestTimes: toRiderTimeRecords(timesResult.data),
  }
})

export async function getGraniteAnvilRecords(): Promise<GraniteAnvilRecords> {
  return unstable_cache(async () => getGraniteAnvilRecordsInner(), ['records-granite-anvil'], {
    tags: ['records', 'records-granite-anvil'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}
