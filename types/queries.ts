/**
 * Type definitions for Supabase query results
 *
 * These types represent the structure of data returned from complex Supabase queries
 * that include joins and nested selects. They provide type safety without needing
 * to use `as any` casts.
 */

import type { Database } from './supabase'

// Base table types
export type Chapter = Database['public']['Tables']['chapters']['Row']
export type Event = Database['public']['Tables']['events']['Row']
export type Route = Database['public']['Tables']['routes']['Row']
export type Rider = Database['public']['Tables']['riders']['Row']
// Override finish_time from unknown to string | null (PostgreSQL interval -> JS string)
export type Result = Omit<Database['public']['Tables']['results']['Row'], 'finish_time'> & {
  finish_time: string | null
}
export type Registration = Database['public']['Tables']['registrations']['Row']
export type Membership = Database['public']['Tables']['memberships']['Row']
export type MembershipInsert = Database['public']['Tables']['memberships']['Insert']

// Membership type enum for type safety
export type MembershipType =
  | 'Individual Membership'
  | 'Additional Family Member'
  | 'Family Membership > PRIMARY FAMILY MEMBER'
  | 'Trial Member'

// View types
export type PublicResult = Database['public']['Views']['public_results']['Row']
export type PublicRider = Database['public']['Views']['public_riders']['Row']

// Query result types for complex queries with joins

/**
 * Event with chapter information
 */
export type EventWithChapter = Event & {
  chapters: Pick<Chapter, 'id' | 'name' | 'slug'> | null
}

/**
 * Event with chapter and route information
 */
export type EventWithRelations = Event & {
  chapters: Pick<Chapter, 'id' | 'name' | 'slug'> | null
  routes: Pick<Route, 'id' | 'slug' | 'rwgps_id' | 'cue_sheet_url'> | null
}

/**
 * Event with registration count
 */
export type EventWithRegistrationCount = Event & {
  registrations: Array<{ count: number }> | null
}

/**
 * Event with route slug for results queries
 */
export type EventWithRouteSlug = Pick<Event, 'id' | 'name' | 'event_date' | 'distance_km'> & {
  routes: Pick<Route, 'slug'> | null
}

/**
 * Event with public results for results pages
 */
export type EventWithPublicResults = EventWithRouteSlug & {
  public_results: Array<
    Pick<
      PublicResult,
      'id' | 'finish_time' | 'status' | 'team_name' | 'rider_slug' | 'first_name' | 'last_name'
    >
  > | null
}

/**
 * Event with public results for route results (simpler structure)
 */
export type EventWithPublicResultsForRoute = Pick<Event, 'name' | 'event_date'> & {
  public_results: Array<
    Pick<PublicResult, 'finish_time' | 'status' | 'rider_slug' | 'first_name' | 'last_name'>
  > | null
}

/**
 * Route with basic fields for chapter listings
 */
export type RouteBasic = Pick<Route, 'name' | 'distance_km' | 'rwgps_id'>

/**
 * Event with results for rider profile pages
 */
export type EventWithResultsForRider = Pick<
  Event,
  'name' | 'event_date' | 'distance_km' | 'event_type'
> & {
  chapters: Pick<Chapter, 'slug'> | null
}

/**
 * Result with event information for rider profiles
 */
export type ResultWithEvent = Pick<Result, 'finish_time' | 'status' | 'note' | 'season'> & {
  events: EventWithResultsForRider | null
}

/**
 * Route with chapter information
 */
export type RouteWithChapter = Route & {
  chapters: Pick<Chapter, 'slug' | 'name'> | null
}

/**
 * Route with chapter name (for active routes list)
 */
export type RouteWithChapterName = Pick<
  Route,
  'id' | 'name' | 'slug' | 'distance_km' | 'chapter_id'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Route with just chapter_id (for lookups)
 */
export type RouteWithChapterId = Pick<Route, 'chapter_id'>

/**
 * Route update type
 */
export type RouteUpdate = Database['public']['Tables']['routes']['Update']

/**
 * Chapter with just ID (for lookups)
 */
export type ChapterId = Pick<Chapter, 'id'>

/**
 * Route with just ID (for lookups)
 */
export type RouteId = Pick<Route, 'id'>

/**
 * Rider with just ID (for lookups)
 */
export type RiderId = Pick<Rider, 'id'>

/**
 * Event with just slug (for static generation)
 */
export type EventSlug = Pick<Event, 'slug'>

/**
 * Event with season and results for year queries
 */
export type EventWithSeasonAndResults = Pick<Event, 'id' | 'season'> & {
  results: Array<Pick<Result, 'season'>> | null
}

/**
 * RPC function return types
 */
export type GetRegisteredRidersResult =
  Database['public']['Functions']['get_registered_riders']['Returns'][number]

export type GetDistinctSeasonsResult =
  Database['public']['Functions']['get_distinct_seasons']['Returns'][number]

/**
 * Insert types (for create operations)
 */
export type AdminInsert = Database['public']['Tables']['admins']['Insert']
export type AdminUpdate = Database['public']['Tables']['admins']['Update']
export type RiderInsert = Database['public']['Tables']['riders']['Insert']
export type RiderUpdate = Database['public']['Tables']['riders']['Update']
export type RegistrationInsert = Database['public']['Tables']['registrations']['Insert']
export type EventInsert = Database['public']['Tables']['events']['Insert']
export type EventUpdate = Database['public']['Tables']['events']['Update']
export type RouteInsert = Database['public']['Tables']['routes']['Insert']
export type ResultInsert = Database['public']['Tables']['results']['Insert']

/**
 * Rider merge audit log insert type
 */
export type RiderMergeInsert = Database['public']['Tables']['rider_merges']['Insert']

/**
 * Single field select types (for lookups)
 */
export type RiderIdOnly = Pick<Rider, 'id'>
export type EventIdOnly = Pick<Event, 'id'>
export type RouteIdOnly = Pick<Route, 'id'>

/**
 * Event with minimal fields for status updates
 */
export type EventForStatusUpdate = Pick<Event, 'chapter_id' | 'event_type'>

/**
 * Event with chapter name for admin display
 */
export type EventWithChapterName = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'distance_km' | 'chapter_id' | 'event_type' | 'status'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Event with chapter for admin events list
 */
export type EventForAdminList = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'distance_km' | 'event_type' | 'status' | 'chapter_id'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Event with chapter for dashboard (needs results)
 */
export type EventForDashboard = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'distance_km' | 'event_type'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Event with start time for dashboard
 */
export type UpcomingEventForDashboard = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'start_time' | 'distance_km' | 'event_type'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Registration with event_id and rider_id for counting
 */
export type RegistrationForCounting = Pick<Registration, 'event_id' | 'rider_id'>

/**
 * Result with event_id and rider_id for counting
 */
export type ResultForCounting = Pick<Result, 'event_id' | 'rider_id'>

/**
 * Result with rider and event for admin results page
 */
export type ResultForAdminList = Pick<
  Result,
  'id' | 'finish_time' | 'status' | 'team_name' | 'season' | 'distance_km' | 'created_at'
> & {
  riders: Pick<Rider, 'id' | 'first_name' | 'last_name'>
  events: Pick<Event, 'id' | 'name' | 'event_date' | 'chapter_id'> & {
    chapters: Pick<Chapter, 'name'> | null
  }
}

/**
 * Event detail for admin event page
 */
export type EventDetailForAdmin = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'start_time' | 'distance_km' | 'event_type' | 'status' | 'season'
> & {
  chapters: Pick<Chapter, 'id' | 'name'> | null
}

/**
 * Registration with rider for admin event page
 */
export type RegistrationWithRiderForAdmin = Pick<
  Registration,
  'id' | 'rider_id' | 'registered_at' | 'status' | 'notes'
> & {
  riders:
    | (Pick<
        Rider,
        | 'id'
        | 'first_name'
        | 'last_name'
        | 'email'
        | 'emergency_contact_name'
        | 'emergency_contact_phone'
      > & {
        memberships: Array<{ type: string; season: number }> | null
      })
    | null
}

/**
 * Result with rider for admin event page
 */
export type ResultWithRiderForAdmin = Pick<
  Result,
  | 'id'
  | 'rider_id'
  | 'finish_time'
  | 'status'
  | 'team_name'
  | 'note'
  | 'gpx_url'
  | 'gpx_file_path'
  | 'control_card_front_path'
  | 'control_card_back_path'
  | 'rider_notes'
  | 'submitted_at'
> & {
  riders: Pick<Rider, 'id' | 'first_name' | 'last_name' | 'email'> | null
}

/**
 * Chapter for admin dropdowns
 */
export type ChapterForAdmin = Pick<Chapter, 'id' | 'name' | 'slug'>

/**
 * Route with chapter for admin routes list
 */
export type RouteWithChapterForAdmin = Route & {
  chapters: Pick<Chapter, 'id' | 'name'> | null
}

/**
 * Rider with stats for admin riders list
 */
export type RiderWithStats = Pick<
  Rider,
  'id' | 'slug' | 'first_name' | 'last_name' | 'email' | 'gender' | 'created_at'
> & {
  registrations: Array<{ count: number }> | null
  results: Array<{ count: number }> | null
  memberships: Array<{ type: string; season: number }> | null
}

/**
 * Event detail for edit form
 */
export type EventDetailForEdit = Pick<
  Event,
  | 'id'
  | 'name'
  | 'chapter_id'
  | 'route_id'
  | 'event_type'
  | 'distance_km'
  | 'event_date'
  | 'start_time'
  | 'start_location'
  | 'description'
  | 'image_url'
>

/**
 * Admin user type
 */
export type AdminUser = Database['public']['Tables']['admins']['Row']

/**
 * Event with route for control cards
 */
export type EventForControlCards = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'start_time' | 'start_location' | 'distance_km' | 'event_type'
> & {
  chapters: Pick<Chapter, 'id' | 'name'> | null
  routes: Pick<Route, 'id' | 'name' | 'rwgps_id'> | null
}

/**
 * Registration with rider for control cards
 */
export type RegistrationForControlCards = Pick<Registration, 'id' | 'rider_id'> & {
  riders: Pick<Rider, 'id' | 'first_name' | 'last_name'> | null
}

/**
 * Rider detail for admin rider page
 */
export type RiderDetail = Rider

/**
 * Registration with event for rider page
 */
export type RegistrationWithEvent = Pick<Registration, 'id' | 'registered_at' | 'status'> & {
  events: Pick<Event, 'id' | 'name' | 'event_date' | 'distance_km'> | null
}

/**
 * Result with event for rider page
 */
export type ResultWithEventForRider = Pick<
  Result,
  'id' | 'finish_time' | 'status' | 'team_name' | 'season' | 'distance_km'
> & {
  events: Pick<Event, 'id' | 'name' | 'event_date'> | null
}

/**
 * Event for calendar iCal export
 */
export type EventForCalendar = Pick<
  Event,
  | 'id'
  | 'slug'
  | 'name'
  | 'event_date'
  | 'start_time'
  | 'start_location'
  | 'distance_km'
  | 'event_type'
  | 'description'
>

/**
 * Event for cron completion check
 */
export type EventForCronCompletion = Pick<
  Event,
  'id' | 'name' | 'event_date' | 'start_time' | 'distance_km'
> & {
  chapters: Pick<Chapter, 'name'> | null
}

/**
 * Event with season and chapter slug for results revalidation
 */
export type EventForResultsRevalidation = Pick<Event, 'season'> & {
  chapters: Pick<Chapter, 'slug'> | null
}

/**
 * Result with just event_id (for lookups)
 */
export type ResultWithEventId = Pick<Result, 'event_id'>

/**
 * Result update type
 */
export type ResultUpdate = Database['public']['Tables']['results']['Update']

/**
 * Registration with just rider_id (for lookups)
 */
export type RegistrationWithRiderId = Pick<Registration, 'rider_id'>

/**
 * Result with just rider_id (for lookups)
 */
export type ResultWithRiderId = Pick<Result, 'rider_id'>

/**
 * Registration update type
 */
export type RegistrationUpdate = Database['public']['Tables']['registrations']['Update']

/**
 * Registration with rider for event completion
 */
export type RegistrationWithRider = Pick<Registration, 'id' | 'rider_id'> & {
  riders: Pick<Rider, 'id' | 'first_name' | 'last_name' | 'email'> | null
}

/**
 * Result with submission token for event completion
 */
export type ResultWithSubmissionToken = Pick<Result, 'submission_token'>

/**
 * Result with event and rider for submission page
 */
export type ResultForSubmission = Pick<
  Result,
  | 'id'
  | 'event_id'
  | 'rider_id'
  | 'status'
  | 'finish_time'
  | 'gpx_url'
  | 'gpx_file_path'
  | 'control_card_front_path'
  | 'control_card_back_path'
  | 'rider_notes'
  | 'submitted_at'
> & {
  events:
    | (Pick<Event, 'id' | 'name' | 'event_date' | 'distance_km' | 'status'> & {
        chapters: Pick<Chapter, 'name'> | null
      })
    | null
  riders: Pick<Rider, 'first_name' | 'last_name' | 'email'> | null
}

/**
 * Result with event status for validation
 */
export type ResultWithEventStatus = Pick<Result, 'id'> & {
  events: Pick<Event, 'status'> | null
}

/**
 * Result with event status and IDs for file uploads
 */
export type ResultForFileUpload = Pick<
  Result,
  | 'id'
  | 'event_id'
  | 'rider_id'
  | 'gpx_file_path'
  | 'control_card_front_path'
  | 'control_card_back_path'
> & {
  events: Pick<Event, 'status'> | null
}

/**
 * Chapter slug only (for revalidation)
 */
export type ChapterSlugOnly = Pick<Chapter, 'slug'>
