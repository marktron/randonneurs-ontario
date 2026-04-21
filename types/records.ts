/**
 * Type definitions for Records page
 *
 * These types represent aggregated statistics and rankings
 * displayed on the /records page.
 */

/**
 * A rider's ranking in a record category
 */
export interface RiderRecord {
  rank: number
  riderSlug: string
  riderName: string
  value: number // count or distance in km
}

/**
 * A rider's ranking with finish time (for PBP/Granite Anvil fastest times)
 */
export interface RiderTimeRecord {
  rank: number
  riderSlug: string
  riderName: string
  time: string // formatted finish time (e.g., "45:30")
  eventDate: string // when the record was set
}

/**
 * A season-based ranking (for single season records)
 */
export interface SeasonRiderRecord {
  rank: number
  season: number
  riderSlug: string
  riderName: string
  value: number // count or distance
}

/**
 * A season's ranking in club achievements
 */
export interface ClubSeasonRecord {
  rank: number
  season: number
  value: number // count or distance
}

/**
 * A route's popularity ranking
 */
export interface RouteRecord {
  rank: number
  routeSlug: string
  routeName: string
  distanceKm: number
  chapterName: string | null
  chapterSlug: string | null
  value: number // event count or participant count
}

/**
 * A rider's streak record (consecutive seasons)
 */
export interface StreakRecord {
  rank: number
  riderSlug: string
  riderName: string
  streakLength: number
  streakStartSeason: number
  streakEndSeason: number
}

/**
 * Lifetime achievement records
 */
export interface LifetimeRecords {
  mostBrevets: RiderRecord[]
  highestDistance: RiderRecord[]
  mostActiveSeasons: RiderRecord[]
  mostDevilWeeks: RiderRecord[]
  mostSuperRandonneurs: RiderRecord[]
  mostPermanents: RiderRecord[]
  longestStreaks: StreakRecord[]
  srStreaks: StreakRecord[]
}

/**
 * Single season records
 */
export interface SeasonRecords {
  mostBrevetsInSeason: SeasonRiderRecord[]
  highestDistanceInSeason: SeasonRiderRecord[]
}

/**
 * Club achievement records (by season)
 */
export interface ClubAchievements {
  mostUniqueRiders: ClubSeasonRecord[]
  mostBrevetsOrganized: ClubSeasonRecord[]
  highestCumulativeDistance: ClubSeasonRecord[]
}

/**
 * Route popularity records
 */
export interface RouteRecords {
  byFrequency: RouteRecord[]
  byParticipants: RouteRecord[]
}

/**
 * Paris-Brest-Paris records
 */
export interface PbpRecords {
  mostCompletions: RiderRecord[]
  fastestTimes: RiderTimeRecord[]
}

/**
 * Granite Anvil records
 */
export interface GraniteAnvilRecords {
  mostCompletions: RiderRecord[]
  fastestTimes: RiderTimeRecord[]
}

/**
 * A recipient of a specific award (e.g., Randonneur 5000/10000)
 */
export interface AwardRecipient {
  riderSlug: string
  riderName: string
  awardYear: number
}

/**
 * A recipient of a distance-based award (e.g., O-5000) with season distance
 */
export interface AwardRecipientWithDistance {
  riderSlug: string
  riderName: string
  awardYear: number
  seasonDistance: number
}

/**
 * All records data combined
 */
export interface AllRecords {
  lifetime: LifetimeRecords
  season: SeasonRecords
  currentSeasonDistance: RiderRecord[]
  club: ClubAchievements
  routes: RouteRecords
  pbp: PbpRecords
  graniteAnvil: GraniteAnvilRecords
}
