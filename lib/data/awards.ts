/**
 * Awards Data Fetching Module
 *
 * This module contains all READ operations for club awards.
 * It provides award recipient data for the /awards page: Ontario achievement
 * awards, ACP distance awards, and the club honours voted on by members.
 *
 * CACHING STRATEGY:
 * - All award data: 24 hours (86400 seconds) - historical data
 *
 * Uses the same get_award_recipients RPC as records, fetching by award slug.
 */
import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getSupabase } from '@/lib/supabase'
import { handleDataError } from '@/lib/errors'
import type { AwardRecipient, AwardRecipientWithDistance } from '@/types/records'

const CACHE_TTL_HISTORICAL = 86400 // 24 hours

// Helper to convert RPC result to AwardRecipient array
function toAwardRecipients(
  data: Array<{ rider_slug: string | null; rider_name: string; award_year: number }> | null
): AwardRecipient[] {
  if (!data) return []
  return data.map((row) => ({
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    awardYear: row.award_year,
  }))
}

// Helper to convert RPC result to AwardRecipientWithDistance array
function toAwardRecipientsWithDistance(
  data: Array<{
    rider_slug: string | null
    rider_name: string
    award_year: number
    season_distance: number
  }> | null
): AwardRecipientWithDistance[] {
  if (!data) return []
  return data.map((row) => ({
    riderSlug: row.rider_slug,
    riderName: row.rider_name,
    awardYear: row.award_year,
    seasonDistance: Number(row.season_distance) || 0,
  }))
}

// ============================================================================
// ONTARIO AWARDS
// ============================================================================

export interface OntarioAwards {
  o12: AwardRecipient[]
  ontarioExplorer: AwardRecipient[]
  o5000: AwardRecipientWithDistance[]
  ontarioRouleur: AwardRecipient[]
  ontarioRover: AwardRecipient[]
}

const getOntarioAwardsInner = cache(async (): Promise<OntarioAwards> => {
  const supabase = getSupabase()

  const [o12Result, explorerResult, o5000Result, rouleurResult, roverResult] = await Promise.all([
    supabase.rpc('get_award_recipients', { p_award_slug: 'o-12' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'ontario-explorer' }),
    supabase.rpc('get_award_recipients_with_distance', { p_award_slug: 'o-5000' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'ontario-rouleur' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'ontario-rover' }),
  ])

  if (o12Result.error) {
    return handleDataError(
      o12Result.error,
      { operation: 'getOntarioAwards' },
      { o12: [], ontarioExplorer: [], o5000: [], ontarioRouleur: [], ontarioRover: [] }
    )
  }

  if (o5000Result.error) {
    console.error('Error fetching O-5000 recipients with distance:', o5000Result.error)
  }

  return {
    o12: toAwardRecipients(o12Result.data),
    ontarioExplorer: toAwardRecipients(explorerResult.data),
    o5000: toAwardRecipientsWithDistance(o5000Result.data),
    ontarioRouleur: toAwardRecipients(rouleurResult.data),
    ontarioRover: toAwardRecipients(roverResult.data),
  }
})

export async function getOntarioAwards(): Promise<OntarioAwards> {
  return unstable_cache(async () => getOntarioAwardsInner(), ['awards-ontario-with-distance'], {
    tags: ['awards', 'awards-ontario'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// ACP AWARDS (Randonneur 5000 / 10000)
// ============================================================================

export interface AcpAwards {
  r10000: AwardRecipient[]
  r5000: AwardRecipient[]
}

const getAcpAwardsInner = cache(async (): Promise<AcpAwards> => {
  const supabase = getSupabase()

  const [r10000Result, r5000Result] = await Promise.all([
    supabase.rpc('get_award_recipients', { p_award_slug: 'r-10000' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'r-5000' }),
  ])

  if (r10000Result.error) {
    return handleDataError(
      r10000Result.error,
      { operation: 'getAcpAwards' },
      { r10000: [], r5000: [] }
    )
  }

  return {
    r10000: toAwardRecipients(r10000Result.data),
    r5000: toAwardRecipients(r5000Result.data),
  }
})

export async function getAcpAwards(): Promise<AcpAwards> {
  return unstable_cache(async () => getAcpAwardsInner(), ['awards-acp'], {
    tags: ['awards', 'awards-acp'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}

// ============================================================================
// CLUB HONOURS (voted on by members, presented at the annual banquet)
// ============================================================================

// Keys are in display order. Recipients may be name-only (riderSlug: null).
export interface ClubHonours {
  mikeBarryJockWadley: AwardRecipient[]
  berylBurton: AwardRecipient[]
  coronationCup: AwardRecipient[]
  jimGriffinRookieOfTheYear: AwardRecipient[]
  organiserOfTheYear: AwardRecipient[]
  outstandingPerformance: AwardRecipient[]
  danHerbert: AwardRecipient[]
  halfWheel: AwardRecipient[]
  specialRecognition: AwardRecipient[]
}

const getClubHonoursInner = cache(async (): Promise<ClubHonours> => {
  const supabase = getSupabase()

  const [
    mikeBarryResult,
    berylBurtonResult,
    coronationCupResult,
    rookieResult,
    organiserResult,
    performanceResult,
    danHerbertResult,
    halfWheelResult,
    specialResult,
  ] = await Promise.all([
    supabase.rpc('get_award_recipients', { p_award_slug: 'mike-barry-jock-wadley' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'beryl-burton' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'coronation-cup' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'jim-griffin-rookie-of-the-year' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'organiser-of-the-year' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'outstanding-performance' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'dan-herbert' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'half-wheel' }),
    supabase.rpc('get_award_recipients', { p_award_slug: 'special-recognition' }),
  ])

  if (mikeBarryResult.error) {
    return handleDataError(
      mikeBarryResult.error,
      { operation: 'getClubHonours' },
      {
        mikeBarryJockWadley: [],
        berylBurton: [],
        coronationCup: [],
        jimGriffinRookieOfTheYear: [],
        organiserOfTheYear: [],
        outstandingPerformance: [],
        danHerbert: [],
        halfWheel: [],
        specialRecognition: [],
      }
    )
  }

  return {
    mikeBarryJockWadley: toAwardRecipients(mikeBarryResult.data),
    berylBurton: toAwardRecipients(berylBurtonResult.data),
    coronationCup: toAwardRecipients(coronationCupResult.data),
    jimGriffinRookieOfTheYear: toAwardRecipients(rookieResult.data),
    organiserOfTheYear: toAwardRecipients(organiserResult.data),
    outstandingPerformance: toAwardRecipients(performanceResult.data),
    danHerbert: toAwardRecipients(danHerbertResult.data),
    halfWheel: toAwardRecipients(halfWheelResult.data),
    specialRecognition: toAwardRecipients(specialResult.data),
  }
})

export async function getClubHonours(): Promise<ClubHonours> {
  return unstable_cache(async () => getClubHonoursInner(), ['awards-club-honours'], {
    tags: ['awards', 'awards-club-honours'],
    revalidate: CACHE_TTL_HISTORICAL,
  })()
}
