/**
 * Event Registration Server Actions
 *
 * This module handles all event registration logic including:
 * - Registering for scheduled events (brevets, populaires)
 * - Registering for permanent rides
 * - Finding or creating rider records
 * - Sending confirmation emails
 *
 * REGISTRATION FLOW:
 * 1. Validate input data
 * 2. Verify event exists and is open for registration
 * 3. Find existing rider by email OR create new rider
 * 4. Check for duplicate registration
 * 5. Create registration record
 * 6. Send confirmation email (async, non-blocking)
 * 7. Revalidate cache to update UI
 *
 * PERMANENT RIDES:
 * Permanent rides are self-scheduled events. When a rider registers:
 * 1. System creates an event record for that route/date if needed
 * 2. Multiple riders can share the same event if same route/date
 * 3. Must be scheduled at least 2 weeks in advance
 *
 * @see docs/DATA_LAYER.md for more on server actions
 */
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { formatEventType } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { searchRiderCandidates, type RiderMatchCandidate } from './rider-match'
import { fuzzyNameScore } from '@/lib/utils/fuzzy-match'
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
import { isRateLimited } from '@/lib/rate-limit'

/** Chapter slugs that represent real geographic chapters (not pseudo-chapters like 'permanent' or 'other') */
const REAL_CHAPTER_SLUGS = ['huron', 'ottawa', 'simcoe', 'toronto']
import { handleActionError, handleSupabaseError, createActionResult, logError } from '@/lib/errors'
import type {
  RiderInsert,
  RiderUpdate,
  RegistrationInsert,
  EventInsert,
  EventWithRelations,
  RouteWithChapter,
  RiderIdOnly,
  EventIdOnly,
  RiderMergeInsert,
} from '@/types/queries'

export interface RegistrationData {
  eventId: string
  firstName: string
  lastName: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
  teamName?: string
  isTeamCaptain?: boolean
}

export interface RegistrationResult {
  success: boolean
  error?: string
  /** Set when email not found but fuzzy name matches exist */
  needsRiderMatch?: boolean
  /** Potential rider matches for user to select from */
  matchCandidates?: RiderMatchCandidate[]
  /** Original form data to resubmit after selection */
  pendingData?: RegistrationData
  /** Set when membership verification fails */
  membershipError?: 'no-membership' | 'trial-used'
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a URL-safe slug for a new rider based on their email.
 * Adds a random suffix to ensure uniqueness.
 *
 * @example
 * createRiderSlug("john.doe@example.com") → "john-doe-a3f2b1"
 */
function createRiderSlug(email: string): string {
  const prefix = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${suffix}`
}

/**
 * Format a date string for display in confirmation emails.
 * @example formatEventDate("2025-06-15") → "Sunday, June 15, 2025"
 */
function formatEventDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

/**
 * Format a time string (HH:MM) for display in 12-hour format.
 * @example formatEventTime("14:30") → "2:30 PM"
 */
function formatEventTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD'
  const [hours, minutes] = timeStr.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

/**
 * Build a URL to the route page if route info is available.
 */
function buildRouteUrl(
  chapterSlug: string | undefined,
  routeSlug: string | undefined
): string | undefined {
  if (!chapterSlug || !routeSlug) return undefined
  return `https://randonneursontario.ca/routes/${chapterSlug}/${routeSlug}`
}

function buildManagementUrl(managementToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://randonneursontario.ca'
  return `${baseUrl}/registration/manage/${managementToken}`
}

/**
 * Result type for findOrCreateRider helper
 */
interface FindOrCreateRiderResult {
  success: true
  riderId: string
}

interface FindOrCreateRiderMatchResult {
  success: false
  needsRiderMatch: true
  matchCandidates: RiderMatchCandidate[]
}

type FindOrCreateRiderReturn = FindOrCreateRiderResult | FindOrCreateRiderMatchResult

/**
 * Find an existing rider by email or create a new one.
 * If no rider exists and fuzzy name matches are found, returns match candidates.
 *
 * @param email - Normalized email address
 * @param firstName - First name
 * @param lastName - Last name
 * @param gender - Optional gender (M, F, or X)
 * @param emergencyContactName - Optional emergency contact name
 * @param emergencyContactPhone - Optional emergency contact phone
 * @returns Either a riderId or match candidates for user selection
 */
async function findOrCreateRider(
  email: string,
  firstName: string,
  lastName: string,
  gender?: string,
  emergencyContactName?: string,
  emergencyContactPhone?: string
): Promise<FindOrCreateRiderReturn> {
  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  // Find existing rider(s) by email — multiple riders can share an email (family members)
  const { data: emailRiders } = await getSupabaseAdmin()
    .from('riders')
    .select('id, first_name, last_name')
    .eq('email', normalizedEmail)

  if (emailRiders && emailRiders.length > 0) {
    // Score each email-matched rider against the submitted name and pick the best
    type RiderRow = { id: string; first_name: string; last_name: string }
    let bestRider: RiderRow | null = null
    let bestScore = 0

    for (const r of emailRiders as RiderRow[]) {
      const score = fuzzyNameScore(trimmedFirstName, trimmedLastName, r.first_name, r.last_name)
      if (score > bestScore) {
        bestScore = score
        bestRider = r
      }
    }

    if (bestRider && bestScore >= 0.8) {
      // Name matches well — same person, proceed automatically
      // Only log to rider_merges if something actually differs (e.g. slight name variation)
      const nameChanged =
        trimmedFirstName !== bestRider.first_name || trimmedLastName !== bestRider.last_name
      if (nameChanged) {
        const mergeInsert: RiderMergeInsert = {
          rider_id: bestRider.id,
          submitted_first_name: trimmedFirstName,
          submitted_last_name: trimmedLastName,
          submitted_email: normalizedEmail,
          previous_first_name: bestRider.first_name,
          previous_last_name: bestRider.last_name,
          previous_email: normalizedEmail,
          merge_source: 'registration',
        }
        await getSupabaseAdmin().from('rider_merges').insert(mergeInsert)
      }

      // Update supplementary rider info only — never overwrite the name
      const updateData: RiderUpdate = {
        gender: parsedGender,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
      }
      await getSupabaseAdmin().from('riders').update(updateData).eq('id', bestRider.id)

      return { success: true, riderId: bestRider.id }
    }

    // No good name match among email-matched riders — fall through to fuzzy search
    // so the user can confirm which rider they are (or create a new one)
  }

  // Email not found - search for fuzzy name matches
  const { candidates } = await searchRiderCandidates(
    trimmedFirstName,
    trimmedLastName,
    normalizedEmail
  )

  // If there are potential matches, return them for user selection
  if (candidates.length > 0) {
    return {
      success: false,
      needsRiderMatch: true,
      matchCandidates: candidates,
    }
  }

  // No matches found - create new rider
  const insertRider: RiderInsert = {
    slug: createRiderSlug(normalizedEmail),
    first_name: trimmedFirstName,
    last_name: trimmedLastName,
    email: normalizedEmail,
    gender: parsedGender,
    emergency_contact_name: emergencyContactName || null,
    emergency_contact_phone: emergencyContactPhone || null,
  }
  const { data: newRider, error: riderError } = await getSupabaseAdmin()
    .from('riders')
    .insert(insertRider)
    .select('id')
    .single()

  if (riderError || !newRider) {
    console.error('🚨 Error creating rider:', riderError)
    throw new Error('Failed to create rider profile')
  }

  const typedNewRider = newRider as RiderIdOnly
  return { success: true, riderId: typedNewRider.id }
}

/**
 * Create or update a registration record for a rider and event.
 *
 * Tries an INSERT first. On conflict (event_id, rider_id):
 * - If existing row is 'incomplete: membership', updates it (re-registration after membership fix)
 * - If existing row is 'registered', returns 'duplicate' (already registered)
 *
 * @returns The management token, or 'duplicate' if already fully registered
 * @throws Error if registration creation fails for other reasons
 */
async function createRegistrationRecord(
  eventId: string,
  riderId: string,
  shareRegistration: boolean,
  notes?: string,
  status: 'registered' | 'incomplete: membership' = 'registered',
  teamName?: string,
  isTeamCaptain?: boolean
): Promise<string | 'duplicate'> {
  const supabase = getSupabaseAdmin()

  // First, try a plain INSERT
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status,
    share_registration: shareRegistration,
    notes: notes || null,
    team_name: teamName || null,
    is_team_captain: isTeamCaptain || false,
  }
  const { data: inserted, error: insertError } = await supabase
    .from('registrations')
    .insert(insertRegistration)
    .select('management_token')
    .single()

  if (!insertError && inserted) {
    return (inserted as { management_token: string }).management_token
  }

  // If the error is NOT a unique violation, it's a real failure
  if (insertError.code !== '23505') {
    console.error('🚨 Error creating registration:', insertError)
    throw new Error('Failed to complete registration')
  }

  // Unique violation — a row already exists for this (event_id, rider_id).
  // Only update if it's an incomplete registration (membership re-check).
  const { data: updated, error: updateError } = await supabase
    .from('registrations')
    .update({
      status,
      share_registration: shareRegistration,
      notes: notes || null,
      team_name: teamName || null,
      is_team_captain: isTeamCaptain || false,
    })
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .eq('status', 'incomplete: membership')
    .select('management_token')
    .maybeSingle()

  if (updateError) {
    console.error('🚨 Error updating registration:', updateError)
    throw new Error('Failed to complete registration')
  }

  if (!updated) {
    // No row matched the update — the existing registration is already 'registered'
    return 'duplicate'
  }

  return (updated as { management_token: string }).management_token
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Register a rider for a scheduled event (brevet, populaire, etc.)
 *
 * This is the main registration handler called from the registration form.
 * It handles the complete flow: validation → rider lookup/creation →
 * registration creation → email confirmation.
 *
 * @param data - Registration form data
 * @returns Success/error result
 */
export async function registerForEvent(data: RegistrationData): Promise<RegistrationResult> {
  const {
    eventId,
    firstName,
    lastName,
    email,
    gender,
    shareRegistration,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    teamName,
    isTeamCaptain,
  } = data

  // Step 1: Validate required fields
  if (!eventId || !firstName.trim() || !lastName.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()
  const trimmedTeamName = teamName?.trim() || undefined

  // Rate limit: 10 registration attempts per email per 15 minutes
  if (isRateLimited('registration', normalizedEmail, 10, 15 * 60 * 1000)) {
    return { success: false, error: 'Too many registration attempts. Please try again later.' }
  }

  // Block duplicate team names with a helpful message
  if (trimmedTeamName && isTeamCaptain) {
    const { data: existingTeam } = await getSupabaseAdmin()
      .from('registrations')
      .select('id')
      .eq('event_id', eventId)
      .ilike('team_name', trimmedTeamName)
      .eq('status', 'registered')
      .limit(1)
      .maybeSingle()

    if (existingTeam) {
      return {
        success: false,
        error: `A team named "${trimmedTeamName}" already exists. Use "Join team" to register with this team.`,
      }
    }
  }

  // Check if event exists and is scheduled (fetch details for confirmation email)
  const { data: eventData, error: eventError } = await getSupabaseAdmin()
    .from('events')
    .select(
      `
      id, slug, status, name, event_date, start_time,
      start_location, distance_km, event_type, chapter_id,
      chapters (slug, name),
      routes (slug)
    `
    )
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    return handleSupabaseError(
      eventError,
      { operation: 'registerForEvent.eventLookup', userMessage: 'Event not found' },
      'Event not found'
    )
  }

  const event = eventData as EventWithRelations

  if (event.status !== 'scheduled') {
    return { success: false, error: 'Registration is not open for this event' }
  }

  // Find or create rider
  try {
    const riderResult = await findOrCreateRider(
      email,
      firstName,
      lastName,
      gender,
      emergencyContactName,
      emergencyContactPhone
    )

    if (!riderResult.success) {
      // TypeScript type narrowing: when success is false, it's FindOrCreateRiderMatchResult
      const matchResult = riderResult as FindOrCreateRiderMatchResult
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: matchResult.matchCandidates,
        pendingData: data,
      }
    }

    const riderId = riderResult.riderId

    // Step: Verify membership
    // Only pass chapter_id for real geographic chapters
    const chapterSlug = event.chapters?.slug
    const realChapterId =
      chapterSlug && REAL_CHAPTER_SLUGS.includes(chapterSlug)
        ? (event.chapter_id ?? undefined)
        : undefined
    const membershipResult = await getMembershipForRider(
      riderId,
      trimmedFirstName,
      trimmedLastName,
      realChapterId
    )

    if (!membershipResult.found) {
      // Create incomplete registration
      const mgmtToken = await createRegistrationRecord(
        eventId,
        riderId,
        shareRegistration,
        notes,
        'incomplete: membership',
        trimmedTeamName,
        isTeamCaptain
      )

      if (mgmtToken === 'duplicate') {
        return { success: false, error: 'You are already registered for this event' }
      }

      // Send warning email (fire-and-forget)
      const chapter = event.chapters
      const fullName = `${trimmedFirstName} ${trimmedLastName}`
      sendRegistrationConfirmationEmail({
        registrantName: fullName,
        registrantEmail: normalizedEmail,
        eventName: event.name,
        eventDate: formatEventDate(event.event_date),
        eventTime: formatEventTime(event.start_time),
        eventLocation: event.start_location || 'TBD',
        eventDistance: event.distance_km,
        eventType: formatEventType(event.event_type),
        chapterName: chapter?.name || '',
        chapterSlug: chapter?.slug || '',
        routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
        notes: notes || undefined,
        membershipStatus: 'none',
        managementUrl: buildManagementUrl(mgmtToken),
      }).catch((error) => {
        logError(error, {
          operation: 'registerForEvent.sendEmail',
          context: { eventId, email: normalizedEmail },
        })
      })

      return {
        success: false,
        membershipError: 'no-membership',
        error: 'Membership verification failed',
      }
    }

    // Check Trial Member usage
    if (membershipResult.type === 'Trial Member') {
      const trialUsed = await isTrialUsed(riderId)
      if (trialUsed) {
        const mgmtToken = await createRegistrationRecord(
          eventId,
          riderId,
          shareRegistration,
          notes,
          'incomplete: membership',
          trimmedTeamName,
          isTeamCaptain
        )

        if (mgmtToken === 'duplicate') {
          return { success: false, error: 'You are already registered for this event' }
        }

        const chapter = event.chapters
        const fullName = `${trimmedFirstName} ${trimmedLastName}`
        sendRegistrationConfirmationEmail({
          registrantName: fullName,
          registrantEmail: normalizedEmail,
          eventName: event.name,
          eventDate: formatEventDate(event.event_date),
          eventTime: formatEventTime(event.start_time),
          eventLocation: event.start_location || 'TBD',
          eventDistance: event.distance_km,
          eventType: formatEventType(event.event_type),
          chapterName: chapter?.name || '',
          chapterSlug: chapter?.slug || '',
          routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
          notes: notes || undefined,
          membershipStatus: 'trial-used',
          managementUrl: buildManagementUrl(mgmtToken),
        }).catch((error) => {
          logError(error, {
            operation: 'registerForEvent.sendEmail',
            context: { eventId, email: normalizedEmail },
          })
        })

        return {
          success: false,
          membershipError: 'trial-used',
          error: 'Trial membership already used',
        }
      }
    }

    // Create registration (atomically checks for duplicates)
    const mgmtToken = await createRegistrationRecord(
      eventId,
      riderId,
      shareRegistration,
      notes,
      'registered',
      trimmedTeamName,
      isTeamCaptain
    )

    if (mgmtToken === 'duplicate') {
      return { success: false, error: 'You are already registered for this event' }
    }

    // Send confirmation email (fire-and-forget - don't block registration on email)
    const chapter = event.chapters
    const fullName = `${trimmedFirstName} ${trimmedLastName}`
    sendRegistrationConfirmationEmail({
      registrantName: fullName,
      registrantEmail: normalizedEmail,
      eventName: event.name,
      eventDate: formatEventDate(event.event_date),
      eventTime: formatEventTime(event.start_time),
      eventLocation: event.start_location || 'TBD',
      eventDistance: event.distance_km,
      eventType: formatEventType(event.event_type),
      chapterName: chapter?.name || '',
      chapterSlug: chapter?.slug || '',
      routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
      notes: notes || undefined,
      membershipType: membershipResult.type,
      membershipStatus: 'valid',
      managementUrl: buildManagementUrl(mgmtToken),
    }).catch((error) => {
      logError(error, {
        operation: 'registerForEvent.sendEmail',
        context: { eventId, email: normalizedEmail },
      })
    })

    // Revalidate cache tags for registration data
    revalidateTag('registrations', 'max')
    revalidateTag('events', 'max') // Revalidate chapter calendar caches (registration counts)
    revalidateTag(`event-${event.slug}`, 'max')
    // Also revalidate the path for immediate UI update
    revalidatePath(`/register/${event.slug}`)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'registerForEvent' }, 'Registration failed')
  }
}

export interface PermanentRegistrationData {
  routeId: string
  eventDate: string // YYYY-MM-DD
  startTime: string // HH:MM
  startLocation?: string // Optional - only if different from route start
  direction: 'as_posted' | 'reversed'
  firstName: string
  lastName: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
}

export async function registerForPermanent(
  data: PermanentRegistrationData
): Promise<RegistrationResult> {
  const {
    routeId,
    eventDate,
    startTime,
    startLocation,
    direction,
    firstName,
    lastName,
    email,
    gender,
    shareRegistration,
    notes,
    emergencyContactName,
    emergencyContactPhone,
  } = data

  // Validate required fields
  if (
    !routeId ||
    !eventDate ||
    !startTime ||
    !firstName.trim() ||
    !lastName.trim() ||
    !email.trim()
  ) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()

  // Rate limit: 10 registration attempts per email per 15 minutes
  if (isRateLimited('registration', normalizedEmail, 10, 15 * 60 * 1000)) {
    return { success: false, error: 'Too many registration attempts. Please try again later.' }
  }

  // Validate date is at least 2 weeks in the future
  const eventDateObj = parseISO(eventDate)
  const twoWeeksFromNow = new Date()
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
  twoWeeksFromNow.setHours(0, 0, 0, 0)

  if (eventDateObj < twoWeeksFromNow) {
    return {
      success: false,
      error: 'Permanent rides must be scheduled at least 2 weeks in advance',
    }
  }

  // Fetch route details
  const { data: routeData, error: routeError } = await getSupabaseAdmin()
    .from('routes')
    .select(
      `
      id, name, slug, distance_km, chapter_id,
      chapters (slug, name)
    `
    )
    .eq('id', routeId)
    .eq('is_active', true)
    .single()

  if (routeError || !routeData) {
    return handleSupabaseError(
      routeError,
      { operation: 'registerForPermanent.routeLookup' },
      'Route not found or is not active'
    )
  }

  const route = routeData as RouteWithChapter

  if (!route.chapter_id) {
    return { success: false, error: 'Route does not have an assigned chapter' }
  }

  // Generate event name and slug
  const eventName = direction === 'reversed' ? `${route.name} (Reversed)` : route.name
  const eventSlug = `permanent-${route.slug}-${eventDate}`

  // Check if an event with this slug already exists
  const { data: existingEvent } = await getSupabaseAdmin()
    .from('events')
    .select('id')
    .eq('slug', eventSlug)
    .single()

  let eventId: string

  if (existingEvent) {
    // Use existing event (another rider might have created it for the same route/date)
    const typedExistingEvent = existingEvent as EventIdOnly
    eventId = typedExistingEvent.id
  } else {
    // Create new event
    const insertEvent: EventInsert = {
      slug: eventSlug,
      name: eventName,
      event_type: 'permanent',
      status: 'scheduled',
      route_id: route.id,
      chapter_id: route.chapter_id,
      distance_km: route.distance_km || 0,
      event_date: eventDate,
      start_time: startTime,
      start_location: startLocation?.trim() || null,
    }

    const { data: newEvent, error: eventError } = await getSupabaseAdmin()
      .from('events')
      .insert(insertEvent)
      .select('id')
      .single()

    if (eventError || !newEvent) {
      console.error('Error creating permanent event:', eventError)
      return { success: false, error: 'Failed to create permanent ride event' }
    }

    const typedNewEvent = newEvent as EventIdOnly
    eventId = typedNewEvent.id
  }

  // Find or create rider
  try {
    const riderResult = await findOrCreateRider(
      email,
      firstName,
      lastName,
      gender,
      emergencyContactName,
      emergencyContactPhone
    )

    if (!riderResult.success) {
      // TypeScript type narrowing: when success is false, it's FindOrCreateRiderMatchResult
      const matchResult = riderResult as FindOrCreateRiderMatchResult
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: matchResult.matchCandidates,
        pendingData: {
          eventId, // Event has already been created/found at this point
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          email,
          gender,
          shareRegistration,
          notes,
          emergencyContactName,
          emergencyContactPhone,
        },
      }
    }

    const riderId = riderResult.riderId

    // Step: Verify membership
    // Permanent rides use the route's chapter — only pass if it's a real chapter
    const permChapterSlug = route.chapters?.slug
    const permRealChapterId =
      permChapterSlug && REAL_CHAPTER_SLUGS.includes(permChapterSlug) ? route.chapter_id : undefined
    const membershipResult = await getMembershipForRider(
      riderId,
      trimmedFirstName,
      trimmedLastName,
      permRealChapterId
    )

    if (!membershipResult.found) {
      // Create incomplete registration
      const mgmtToken = await createRegistrationRecord(
        eventId,
        riderId,
        shareRegistration,
        notes,
        'incomplete: membership'
      )

      if (mgmtToken === 'duplicate') {
        return { success: false, error: 'You are already registered for this permanent ride' }
      }

      // Send warning email (fire-and-forget)
      const chapter = route.chapters
      const fullName = `${trimmedFirstName} ${trimmedLastName}`
      sendRegistrationConfirmationEmail({
        registrantName: fullName,
        registrantEmail: normalizedEmail,
        eventName: eventName,
        eventDate: formatEventDate(eventDate),
        eventTime: formatEventTime(startTime),
        eventLocation: startLocation?.trim() || 'Start control per route',
        eventDistance: route.distance_km || 0,
        eventType: 'Permanent',
        chapterName: chapter?.name || '',
        chapterSlug: chapter?.slug || '',
        routeUrl: buildRouteUrl(chapter?.slug, route.slug),
        notes: notes || undefined,
        membershipStatus: 'none',
        managementUrl: buildManagementUrl(mgmtToken),
      }).catch((error) => {
        logError(error, {
          operation: 'registerForPermanent.sendEmail',
          context: { routeId, email: normalizedEmail },
        })
      })

      return {
        success: false,
        membershipError: 'no-membership',
        error: 'Membership verification failed',
      }
    }

    // Check Trial Member usage
    if (membershipResult.type === 'Trial Member') {
      const trialUsed = await isTrialUsed(riderId)
      if (trialUsed) {
        const mgmtToken = await createRegistrationRecord(
          eventId,
          riderId,
          shareRegistration,
          notes,
          'incomplete: membership'
        )

        if (mgmtToken === 'duplicate') {
          return { success: false, error: 'You are already registered for this permanent ride' }
        }

        const chapter = route.chapters
        const fullName = `${trimmedFirstName} ${trimmedLastName}`
        sendRegistrationConfirmationEmail({
          registrantName: fullName,
          registrantEmail: normalizedEmail,
          eventName: eventName,
          eventDate: formatEventDate(eventDate),
          eventTime: formatEventTime(startTime),
          eventLocation: startLocation?.trim() || 'Start control per route',
          eventDistance: route.distance_km || 0,
          eventType: 'Permanent',
          chapterName: chapter?.name || '',
          chapterSlug: chapter?.slug || '',
          routeUrl: buildRouteUrl(chapter?.slug, route.slug),
          notes: notes || undefined,
          membershipStatus: 'trial-used',
          managementUrl: buildManagementUrl(mgmtToken),
        }).catch((error) => {
          logError(error, {
            operation: 'registerForPermanent.sendEmail',
            context: { routeId, email: normalizedEmail },
          })
        })

        return {
          success: false,
          membershipError: 'trial-used',
          error: 'Trial membership already used',
        }
      }
    }

    // Create registration (atomically checks for duplicates)
    const mgmtToken = await createRegistrationRecord(eventId, riderId, shareRegistration, notes)

    if (mgmtToken === 'duplicate') {
      return { success: false, error: 'You are already registered for this permanent ride' }
    }

    // Send confirmation email (fire-and-forget)
    const chapter = route.chapters
    const fullName = `${trimmedFirstName} ${trimmedLastName}`
    sendRegistrationConfirmationEmail({
      registrantName: fullName,
      registrantEmail: normalizedEmail,
      eventName: eventName,
      eventDate: formatEventDate(eventDate),
      eventTime: formatEventTime(startTime),
      eventLocation: startLocation?.trim() || 'Start control per route',
      eventDistance: route.distance_km || 0,
      eventType: 'Permanent',
      chapterName: chapter?.name || '',
      chapterSlug: chapter?.slug || '',
      routeUrl: buildRouteUrl(chapter?.slug, route.slug),
      notes: notes || undefined,
      membershipType: membershipResult.type,
      membershipStatus: 'valid',
      managementUrl: buildManagementUrl(mgmtToken),
    }).catch((error) => {
      logError(error, {
        operation: 'registerForPermanent.sendEmail',
        context: { routeId, email: normalizedEmail },
      })
    })

    // Revalidate cache tags for registration data
    revalidateTag('registrations', 'max')
    revalidateTag('events', 'max') // Revalidate events cache (used by getPermanentEvents)
    revalidateTag('permanents', 'max') // Revalidate permanents calendar cache
    revalidateTag(`event-${eventSlug}`, 'max')
    // Also revalidate the paths for immediate UI update
    revalidatePath(`/register/${eventSlug}`)
    revalidatePath('/calendar/permanents')

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'registerForPermanent' }, 'Registration failed')
  }
}

// ============================================================================
// COMPLETE REGISTRATION WITH SELECTED RIDER
// ============================================================================

export interface CompleteRegistrationData {
  eventId: string
  selectedRiderId: string | null // null = create new rider
  firstName: string
  lastName: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
  teamName?: string
  isTeamCaptain?: boolean
}

/**
 * Complete a registration after user has selected a rider from fuzzy matches.
 * Called when email wasn't found and user chose from potential matches.
 *
 * If selectedRiderId is provided:
 * - Updates that rider's email/name/gender
 * - Creates audit log entry in rider_merges
 * - Uses that rider for registration
 *
 * If selectedRiderId is null:
 * - Creates a new rider (user confirmed they're new)
 */
export async function completeRegistrationWithRider(
  data: CompleteRegistrationData
): Promise<RegistrationResult> {
  const {
    eventId,
    selectedRiderId,
    firstName,
    lastName,
    email,
    gender,
    shareRegistration,
    notes,
    emergencyContactName,
    emergencyContactPhone,
    teamName,
    isTeamCaptain,
  } = data

  // Validate required fields
  if (!eventId || !firstName.trim() || !lastName.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null
  const trimmedTeamName = teamName?.trim() || undefined

  // Check if event exists and is scheduled
  const { data: eventData, error: eventError } = await getSupabaseAdmin()
    .from('events')
    .select(
      `
      id, slug, status, name, event_date, start_time,
      start_location, distance_km, event_type, chapter_id,
      chapters (slug, name),
      routes (slug)
    `
    )
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    return { success: false, error: 'Event not found' }
  }

  const event = eventData as EventWithRelations

  if (event.status !== 'scheduled') {
    return { success: false, error: 'Registration is not open for this event' }
  }

  let riderId: string

  if (selectedRiderId) {
    // User selected an existing rider - update their email and create audit log
    riderId = selectedRiderId

    // Fetch current rider data for audit log
    const { data: currentRider, error: fetchError } = await getSupabaseAdmin()
      .from('riders')
      .select('first_name, last_name, email')
      .eq('id', selectedRiderId)
      .single()

    if (fetchError || !currentRider) {
      return { success: false, error: 'Selected rider not found' }
    }

    const rider = currentRider as { first_name: string; last_name: string; email: string | null }

    // Verify the submitted name matches the selected rider to prevent
    // someone from claiming another rider's profile via the match picker
    const nameScore = fuzzyNameScore(
      trimmedFirstName,
      trimmedLastName,
      rider.first_name,
      rider.last_name
    )
    if (nameScore < 0.7) {
      return { success: false, error: 'Selected rider does not match the submitted name' }
    }

    // Create audit log entry in rider_merges table
    const mergeInsert: RiderMergeInsert = {
      rider_id: selectedRiderId,
      submitted_first_name: trimmedFirstName,
      submitted_last_name: trimmedLastName,
      submitted_email: normalizedEmail,
      previous_first_name: rider.first_name,
      previous_last_name: rider.last_name,
      previous_email: rider.email,
      merge_source: 'registration',
    }
    await getSupabaseAdmin().from('rider_merges').insert(mergeInsert)

    // Update rider with new email and info
    const updateData: RiderUpdate = {
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      email: normalizedEmail,
      gender: parsedGender,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
    }
    await getSupabaseAdmin().from('riders').update(updateData).eq('id', selectedRiderId)
  } else {
    // User confirmed they're a new rider - create new rider record
    const insertRider: RiderInsert = {
      slug: createRiderSlug(normalizedEmail),
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      email: normalizedEmail,
      gender: parsedGender,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
    }
    const { data: newRider, error: riderError } = await getSupabaseAdmin()
      .from('riders')
      .insert(insertRider)
      .select('id')
      .single()

    if (riderError || !newRider) {
      console.error('Error creating rider:', riderError)
      return { success: false, error: 'Failed to create rider profile' }
    }

    const typedNewRider = newRider as RiderIdOnly
    riderId = typedNewRider.id
  }

  // Verify membership (same as registerForEvent / registerForPermanent)
  const completeChapterSlug = event.chapters?.slug
  const completeRealChapterId =
    completeChapterSlug && REAL_CHAPTER_SLUGS.includes(completeChapterSlug)
      ? (event.chapter_id ?? undefined)
      : undefined
  const membershipResult = await getMembershipForRider(
    riderId,
    trimmedFirstName,
    trimmedLastName,
    completeRealChapterId
  )

  if (!membershipResult.found) {
    const mgmtToken = await createRegistrationRecord(
      eventId,
      riderId,
      shareRegistration,
      notes,
      'incomplete: membership',
      trimmedTeamName,
      isTeamCaptain
    )
    if (mgmtToken === 'duplicate') {
      return { success: false, error: 'You are already registered for this event' }
    }
    const chapter = event.chapters
    const fullName = `${trimmedFirstName} ${trimmedLastName}`
    sendRegistrationConfirmationEmail({
      registrantName: fullName,
      registrantEmail: normalizedEmail,
      eventName: event.name,
      eventDate: formatEventDate(event.event_date),
      eventTime: formatEventTime(event.start_time),
      eventLocation: event.start_location || 'TBD',
      eventDistance: event.distance_km,
      eventType: formatEventType(event.event_type),
      chapterName: chapter?.name || '',
      chapterSlug: chapter?.slug || '',
      routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
      notes: notes || undefined,
      membershipStatus: 'none',
      managementUrl: buildManagementUrl(mgmtToken),
    }).catch((error) => {
      logError(error, {
        operation: 'completeRegistrationWithRider.sendEmail',
        context: { eventId, email: normalizedEmail },
      })
    })
    return {
      success: false,
      membershipError: 'no-membership',
      error: 'Membership verification failed',
    }
  }

  if (membershipResult.type === 'Trial Member') {
    const trialUsed = await isTrialUsed(riderId)
    if (trialUsed) {
      const mgmtToken = await createRegistrationRecord(
        eventId,
        riderId,
        shareRegistration,
        notes,
        'incomplete: membership',
        trimmedTeamName,
        isTeamCaptain
      )
      if (mgmtToken === 'duplicate') {
        return { success: false, error: 'You are already registered for this event' }
      }
      const chapter = event.chapters
      const fullName = `${trimmedFirstName} ${trimmedLastName}`
      sendRegistrationConfirmationEmail({
        registrantName: fullName,
        registrantEmail: normalizedEmail,
        eventName: event.name,
        eventDate: formatEventDate(event.event_date),
        eventTime: formatEventTime(event.start_time),
        eventLocation: event.start_location || 'TBD',
        eventDistance: event.distance_km,
        eventType: formatEventType(event.event_type),
        chapterName: chapter?.name || '',
        chapterSlug: chapter?.slug || '',
        routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
        notes: notes || undefined,
        membershipStatus: 'trial-used',
        managementUrl: buildManagementUrl(mgmtToken),
      }).catch((error) => {
        logError(error, {
          operation: 'completeRegistrationWithRider.sendEmail',
          context: { eventId, email: normalizedEmail },
        })
      })
      return {
        success: false,
        membershipError: 'trial-used',
        error: 'Trial membership already used',
      }
    }
  }

  // Create registration (atomically checks for duplicates)
  let mgmtToken: string | 'duplicate'
  try {
    mgmtToken = await createRegistrationRecord(
      eventId,
      riderId,
      shareRegistration,
      notes,
      'registered',
      trimmedTeamName,
      isTeamCaptain
    )
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to complete registration'
    return { success: false, error: errorMessage }
  }

  if (mgmtToken === 'duplicate') {
    return { success: false, error: 'You are already registered for this event' }
  }

  // Send confirmation email (fire-and-forget)
  const chapter = event.chapters
  const fullName = `${trimmedFirstName} ${trimmedLastName}`
  sendRegistrationConfirmationEmail({
    registrantName: fullName,
    registrantEmail: normalizedEmail,
    eventName: event.name,
    eventDate: formatEventDate(event.event_date),
    eventTime: formatEventTime(event.start_time),
    eventLocation: event.start_location || 'TBD',
    eventDistance: event.distance_km,
    eventType: formatEventType(event.event_type),
    chapterName: chapter?.name || '',
    chapterSlug: chapter?.slug || '',
    routeUrl: buildRouteUrl(chapter?.slug, event.routes?.slug),
    notes: notes || undefined,
    membershipType: membershipResult.type,
    membershipStatus: 'valid',
    managementUrl: buildManagementUrl(mgmtToken),
  }).catch((error) => {
    logError(error, {
      operation: 'completeRegistrationWithRider.sendEmail',
      context: { eventId, email: normalizedEmail },
    })
  })

  // Revalidate cache tags for registration data
  revalidateTag('registrations', 'max')
  revalidateTag('events', 'max') // Revalidate chapter calendar caches (registration counts)
  revalidateTag(`event-${event.slug}`, 'max')
  // Also revalidate the path for immediate UI update
  revalidatePath(`/register/${event.slug}`)

  return { success: true }
}
