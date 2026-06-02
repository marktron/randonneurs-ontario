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
 * 3. Registration closes at 8 p.m. Eastern the day before the ride
 *
 * @see docs/DATA_LAYER.md for more on server actions
 */
'use server'

import { createHash } from 'node:crypto'
import * as Sentry from '@sentry/nextjs'
import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { createSlug, formatEventType } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { searchRiderCandidates, type RiderMatchCandidate } from './rider-match'
import { fuzzyNameScore } from '@/lib/utils/fuzzy-match'
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
import { isRateLimited } from '@/lib/rate-limit'
import { createTorontoDate } from '@/lib/brmTimes'
import { validateEmail, normalizePhone, emailIlikePattern } from '@/lib/utils/validation'
import { isRealChapterDbSlug } from '@/lib/chapter-config'
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
  /** Honeypot field — must be empty. Non-empty value means bot; we silently drop. */
  homepageUrl?: string
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
 * Truncated SHA-256 of an email, for forensic correlation in telemetry
 * without leaking PII. 12 hex chars is enough to disambiguate users in
 * practice but too short for offline lookup.
 */
function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 12)
}

/**
 * Emit a Sentry warning when a silent spam guard drops a submission. The
 * response to the client is still { success: true } so bots can't probe the
 * boundary — this is server-only telemetry to correlate real-user reports
 * ("I see the success screen but no row exists") with the guard that fired.
 */
function logSilentDrop(
  guard: 'honeypot',
  action: 'registerForEvent' | 'registerForPermanent' | 'completeRegistrationWithRider',
  extra: Record<string, unknown>
): void {
  Sentry.captureMessage('Registration silently dropped by spam guard', {
    level: 'warning',
    tags: { guard, action },
    extra,
  })
}

/**
 * Insert a new rider with a `firstName-lastName` slug, retrying with `-2`,
 * `-3`, etc. on slug-uniqueness collisions. Mirrors the admin path in
 * `lib/actions/riders.ts:createRider`.
 */
async function insertNewRider(
  insertData: Omit<RiderInsert, 'slug'> & { first_name: string; last_name: string }
): Promise<RiderIdOnly> {
  const baseSlug = createSlug(`${insertData.first_name} ${insertData.last_name}`)
  let slug = baseSlug
  let lastError: { code: string; message: string } | null = null

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      slug = `${baseSlug}-${attempt + 1}`
    }

    const { data, error } = await getSupabaseAdmin()
      .from('riders')
      .insert({ ...insertData, slug })
      .select('id')
      .single()

    if (!error && data) {
      return data as RiderIdOnly
    }

    if (error?.code === '23505' && error.message?.includes('riders_slug_key')) {
      lastError = error
      continue
    }

    throw new Error(error?.message || 'Failed to create rider profile')
  }

  throw new Error(lastError?.message || 'Failed to create rider profile after 5 attempts')
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
function buildRouteUrl(rwgpsId: string | null | undefined): string | undefined {
  if (!rwgpsId) return undefined
  return `https://ridewithgps.com/routes/${rwgpsId}`
}

function buildManagementUrl(managementToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
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

  // Find existing rider(s) by email — multiple riders can share an email (family members).
  // Match case-insensitively because legacy rows may have mixed-case emails.
  const { data: emailRiders } = await getSupabaseAdmin()
    .from('riders')
    .select('id, first_name, last_name')
    .ilike('email', emailIlikePattern(normalizedEmail))

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
  try {
    const newRider = await insertNewRider({
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      email: normalizedEmail,
      gender: parsedGender,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
    })
    return { success: true, riderId: newRider.id }
  } catch (error) {
    console.error('🚨 Error creating rider:', error)
    throw new Error('Failed to create rider profile')
  }
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
  // Try updating if it's an incomplete registration (membership re-check)
  // or a cancelled registration (re-registration).
  for (const revivableStatus of ['incomplete: membership', 'cancelled'] as const) {
    const { data: updated, error: updateError } = await supabase
      .from('registrations')
      .update({
        status,
        share_registration: shareRegistration,
        notes: notes || null,
        team_name: teamName || null,
        is_team_captain: isTeamCaptain || false,
        ...(revivableStatus === 'cancelled' ? { cancelled_at: null } : {}),
      })
      .eq('event_id', eventId)
      .eq('rider_id', riderId)
      .eq('status', revivableStatus)
      .select('management_token')
      .maybeSingle()

    if (updateError) {
      console.error('🚨 Error updating registration:', updateError)
      throw new Error('Failed to complete registration')
    }

    if (updated) {
      return (updated as { management_token: string }).management_token
    }
  }

  // No row matched either update — the existing registration is already 'registered'
  return 'duplicate'
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
  // Silent honeypot guard. Bots that fill the hidden field see a success
  // response; no DB write happens and no email is sent.
  if (data.homepageUrl && data.homepageUrl.trim() !== '') {
    logSilentDrop('honeypot', 'registerForEvent', {
      eventId: data.eventId,
      emailHash: emailFingerprint(data.email),
    })
    return { success: true }
  }

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

  if (!emergencyContactName?.trim() || !emergencyContactPhone?.trim()) {
    return { success: false, error: 'Emergency contact name and phone are required' }
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 254) {
    return { success: false, error: 'Name or email is too long' }
  }
  if (notes && notes.length > 2000) {
    return { success: false, error: 'Notes must be under 2000 characters' }
  }
  if (emergencyContactName && emergencyContactName.length > 200) {
    return { success: false, error: 'Emergency contact name is too long' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const trimmedTeamName = teamName?.trim() || undefined

  const emailResult = validateEmail(email)
  if (!emailResult.valid) {
    return { success: false, error: 'Please enter a valid email address' }
  }
  const normalizedEmail = emailResult.normalized

  const phoneResult = normalizePhone(emergencyContactPhone)
  if (!phoneResult.valid) {
    return { success: false, error: 'Please enter a valid emergency contact phone number' }
  }
  const normalizedPhone = phoneResult.formatted

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
      routes (slug, rwgps_id)
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
      normalizedEmail,
      trimmedFirstName,
      trimmedLastName,
      gender,
      emergencyContactName.trim(),
      normalizedPhone
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
    const realChapterId = isRealChapterDbSlug(chapterSlug)
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
        routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
          routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
      routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
    revalidateTag('registrations', { expire: 0 })
    revalidateTag('events', { expire: 0 }) // Revalidate chapter calendar caches (registration counts)
    revalidateTag(`event-${event.slug}`, { expire: 0 })
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
  /** Honeypot field — must be empty. Non-empty value means bot; we silently drop. */
  homepageUrl?: string
}

export async function registerForPermanent(
  data: PermanentRegistrationData
): Promise<RegistrationResult> {
  if (data.homepageUrl && data.homepageUrl.trim() !== '') {
    logSilentDrop('honeypot', 'registerForPermanent', {
      routeId: data.routeId,
      eventDate: data.eventDate,
      emailHash: emailFingerprint(data.email),
    })
    return { success: true }
  }

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

  if (!emergencyContactName?.trim() || !emergencyContactPhone?.trim()) {
    return { success: false, error: 'Emergency contact name and phone are required' }
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 254) {
    return { success: false, error: 'Name or email is too long' }
  }
  if (notes && notes.length > 2000) {
    return { success: false, error: 'Notes must be under 2000 characters' }
  }
  if (emergencyContactName && emergencyContactName.length > 200) {
    return { success: false, error: 'Emergency contact name is too long' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()

  const emailResult = validateEmail(email)
  if (!emailResult.valid) {
    return { success: false, error: 'Please enter a valid email address' }
  }
  const normalizedEmail = emailResult.normalized

  const phoneResult = normalizePhone(emergencyContactPhone)
  if (!phoneResult.valid) {
    return { success: false, error: 'Please enter a valid emergency contact phone number' }
  }
  const normalizedPhone = phoneResult.formatted

  // Rate limit: 10 registration attempts per email per 15 minutes
  if (isRateLimited('registration', normalizedEmail, 10, 15 * 60 * 1000)) {
    return { success: false, error: 'Too many registration attempts. Please try again later.' }
  }

  // Validate registration deadline: 8 p.m. Eastern the day before the ride
  const [eyear, emonth, eday] = eventDate.split('-').map(Number)
  const deadline = createTorontoDate(eyear, emonth - 1, eday - 1, 20, 0)

  if (new Date() > deadline) {
    return {
      success: false,
      error: 'Registration for permanent rides closes at 8 p.m. Eastern the day before the ride',
    }
  }

  // Fetch route details
  const { data: routeData, error: routeError } = await getSupabaseAdmin()
    .from('routes')
    .select(
      `
      id, name, slug, distance_km, chapter_id, rwgps_id,
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

  // Generate event name and slug (reversed rides get a distinct slug)
  const eventName = direction === 'reversed' ? `${route.name} (Reversed)` : route.name
  const eventSlug =
    direction === 'reversed'
      ? `permanent-${route.slug}-${eventDate}-reverse`
      : `permanent-${route.slug}-${eventDate}`

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
      normalizedEmail,
      trimmedFirstName,
      trimmedLastName,
      gender,
      emergencyContactName.trim(),
      normalizedPhone
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
    const permRealChapterId = isRealChapterDbSlug(permChapterSlug) ? route.chapter_id : undefined
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
        routeUrl: buildRouteUrl(route.rwgps_id),
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
          routeUrl: buildRouteUrl(route.rwgps_id),
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
      routeUrl: buildRouteUrl(route.rwgps_id),
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
    revalidateTag('registrations', { expire: 0 })
    revalidateTag('events', { expire: 0 }) // Revalidate events cache (used by getPermanentEvents)
    revalidateTag('permanents', { expire: 0 }) // Revalidate permanents calendar cache
    revalidateTag(`event-${eventSlug}`, { expire: 0 })
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
  /** Honeypot field — must be empty. Non-empty value means bot; we silently drop. */
  homepageUrl?: string
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
  if (data.homepageUrl && data.homepageUrl.trim() !== '') {
    logSilentDrop('honeypot', 'completeRegistrationWithRider', {
      eventId: data.eventId,
      emailHash: emailFingerprint(data.email),
    })
    return { success: true }
  }

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

  if (!emergencyContactName?.trim() || !emergencyContactPhone?.trim()) {
    return { success: false, error: 'Emergency contact name and phone are required' }
  }

  if (firstName.length > 100 || lastName.length > 100 || email.length > 254) {
    return { success: false, error: 'Name or email is too long' }
  }
  if (notes && notes.length > 2000) {
    return { success: false, error: 'Notes must be under 2000 characters' }
  }
  if (emergencyContactName && emergencyContactName.length > 200) {
    return { success: false, error: 'Emergency contact name is too long' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null
  const trimmedTeamName = teamName?.trim() || undefined

  const emailResult = validateEmail(email)
  if (!emailResult.valid) {
    return { success: false, error: 'Please enter a valid email address' }
  }
  const normalizedEmail = emailResult.normalized

  const phoneResult = normalizePhone(emergencyContactPhone)
  if (!phoneResult.valid) {
    return { success: false, error: 'Please enter a valid emergency contact phone number' }
  }
  const normalizedPhone = phoneResult.formatted

  // Check if event exists and is scheduled
  const { data: eventData, error: eventError } = await getSupabaseAdmin()
    .from('events')
    .select(
      `
      id, slug, status, name, event_date, start_time,
      start_location, distance_km, event_type, chapter_id,
      chapters (slug, name),
      routes (slug, rwgps_id)
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
      emergency_contact_name: emergencyContactName?.trim() || null,
      emergency_contact_phone: normalizedPhone || null,
    }
    await getSupabaseAdmin().from('riders').update(updateData).eq('id', selectedRiderId)
  } else {
    // User confirmed they're a new rider - create new rider record
    try {
      const newRider = await insertNewRider({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        email: normalizedEmail,
        gender: parsedGender,
        emergency_contact_name: emergencyContactName?.trim() || null,
        emergency_contact_phone: normalizedPhone || null,
      })
      riderId = newRider.id
    } catch (error) {
      console.error('Error creating rider:', error)
      return { success: false, error: 'Failed to create rider profile' }
    }
  }

  // Verify membership (same as registerForEvent / registerForPermanent)
  const completeChapterSlug = event.chapters?.slug
  const completeRealChapterId = isRealChapterDbSlug(completeChapterSlug)
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
      routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
        routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
    routeUrl: buildRouteUrl(event.routes?.rwgps_id),
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
  revalidateTag('registrations', { expire: 0 })
  revalidateTag('events', { expire: 0 }) // Revalidate chapter calendar caches (registration counts)
  revalidateTag(`event-${event.slug}`, { expire: 0 })
  // Also revalidate the path for immediate UI update
  revalidatePath(`/register/${event.slug}`)

  return { success: true }
}
