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
 * The three entry points share one flow. Per-step logic lives in
 * `./registration/*`: input validation, rider resolution, and the
 * membership → register → email → revalidate tail (`finalizeRegistration`).
 * The functions below only do what genuinely differs: identifier validation,
 * event/route lookup, and assembling the base email payload.
 *
 * @see docs/DATA_LAYER.md for more on server actions
 */
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { formatEventType } from '@/lib/utils'
import { fuzzyNameScore } from '@/lib/utils/fuzzy-match'
import { isRateLimited } from '@/lib/rate-limit'
import { createTorontoDate } from '@/lib/brmTimes'
import { isRealChapterDbSlug } from '@/lib/chapter-config'
import { handleActionError, handleSupabaseError, logError } from '@/lib/errors'
import type {
  RiderUpdate,
  EventInsert,
  EventWithRelations,
  RouteWithChapter,
  EventIdOnly,
  RiderMergeInsert,
} from '@/types/queries'
import type { RiderMatchCandidate } from './rider-match'
import {
  emailFingerprint,
  logSilentDrop,
  formatEventDate,
  formatEventTime,
  buildRouteUrl,
} from './registration/helpers'
import { validateContactFields } from './registration/validation'
import {
  insertNewRider,
  findOrCreateRider,
  type FindOrCreateRiderMatchResult,
} from './registration/rider'
import { finalizeRegistration } from './registration/finalize'
import type { BaseEmailPayload } from './registration/types'

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

// Fields shared by the scheduled-event confirmation email for a given event.
function eventEmailBase(
  event: EventWithRelations,
  fullName: string,
  normalizedEmail: string,
  notes?: string
): BaseEmailPayload {
  return {
    registrantName: fullName,
    registrantEmail: normalizedEmail,
    eventName: event.name,
    eventDate: formatEventDate(event.event_date),
    eventTime: formatEventTime(event.start_time),
    eventLocation: event.start_location || 'TBD',
    eventDistance: event.distance_km,
    eventType: formatEventType(event.event_type),
    chapterName: event.chapters?.name || '',
    chapterSlug: event.chapters?.slug || '',
    routeUrl: buildRouteUrl(event.routes?.rwgps_id),
    notes: notes || undefined,
  }
}

// Real geographic chapter id for the membership lookup, or undefined when the
// event's chapter is not a real chapter (e.g. permanents/special programs).
function realChapterIdFor(
  chapterSlug: string | null | undefined,
  chapterId: string | null | undefined
): string | undefined {
  return isRealChapterDbSlug(chapterSlug) ? (chapterId ?? undefined) : undefined
}

// Shared event SELECT for the scheduled-event entry points.
const EVENT_SELECT = `
  id, slug, status, name, event_date, start_time,
  start_location, distance_km, event_type, chapter_id,
  chapters (slug, name),
  routes (slug, rwgps_id)
`

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

  const { eventId, gender, shareRegistration, notes, teamName, isTeamCaptain } = data

  // Step 1: Validate required fields
  if (!eventId) {
    return { success: false, error: 'Missing required fields' }
  }

  const validation = validateContactFields(data)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }
  const { trimmedFirstName, trimmedLastName, normalizedEmail, normalizedPhone } = validation.value
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
    .select(EVENT_SELECT)
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

  // Find or create rider, then run the shared finalization flow
  try {
    const riderResult = await findOrCreateRider(
      normalizedEmail,
      trimmedFirstName,
      trimmedLastName,
      gender,
      data.emergencyContactName.trim(),
      normalizedPhone
    )

    if (!riderResult.success) {
      const matchResult = riderResult as FindOrCreateRiderMatchResult
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: matchResult.matchCandidates,
        pendingData: data,
      }
    }

    return await finalizeRegistration({
      eventId,
      riderId: riderResult.riderId,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      realChapterId: realChapterIdFor(event.chapters?.slug, event.chapter_id),
      shareRegistration,
      notes,
      teamName: trimmedTeamName,
      isTeamCaptain,
      emailBase: eventEmailBase(
        event,
        `${trimmedFirstName} ${trimmedLastName}`,
        normalizedEmail,
        notes
      ),
      duplicateMessage: 'You are already registered for this event',
      emailErrorOperation: 'registerForEvent.sendEmail',
      emailErrorContext: { eventId, email: normalizedEmail },
      revalidate: () => {
        revalidateTag('registrations', { expire: 0 })
        revalidateTag('events', { expire: 0 }) // Revalidate chapter calendar caches (registration counts)
        revalidateTag(`event-${event.slug}`, { expire: 0 })
        revalidatePath(`/register/${event.slug}`)
      },
    })
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
    gender,
    shareRegistration,
    notes,
  } = data

  // Validate required fields
  if (!routeId || !eventDate || !startTime) {
    return { success: false, error: 'Missing required fields' }
  }

  const validation = validateContactFields(data)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }
  const { trimmedFirstName, trimmedLastName, normalizedEmail, normalizedPhone } = validation.value

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
    eventId = (existingEvent as EventIdOnly).id
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

    const { data: newEvent, error: createError } = await getSupabaseAdmin()
      .from('events')
      .insert(insertEvent)
      .select('id')
      .single()

    if (createError || !newEvent) {
      return handleSupabaseError(
        createError,
        { operation: 'registerForPermanent.createEvent', context: { routeId, eventSlug } },
        'Failed to create permanent ride event'
      )
    }

    eventId = (newEvent as EventIdOnly).id
  }

  // Find or create rider, then run the shared finalization flow
  try {
    const riderResult = await findOrCreateRider(
      normalizedEmail,
      trimmedFirstName,
      trimmedLastName,
      gender,
      data.emergencyContactName.trim(),
      normalizedPhone
    )

    if (!riderResult.success) {
      const matchResult = riderResult as FindOrCreateRiderMatchResult
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: matchResult.matchCandidates,
        pendingData: {
          eventId, // Event has already been created/found at this point
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          email: data.email,
          gender,
          shareRegistration,
          notes,
          emergencyContactName: data.emergencyContactName,
          emergencyContactPhone: data.emergencyContactPhone,
        },
      }
    }

    return await finalizeRegistration({
      eventId,
      riderId: riderResult.riderId,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      // Permanent rides use the route's chapter — only pass if it's a real chapter
      realChapterId: realChapterIdFor(route.chapters?.slug, route.chapter_id),
      shareRegistration,
      notes,
      // Permanents have no teams; leave team fields unset.
      emailBase: {
        registrantName: `${trimmedFirstName} ${trimmedLastName}`,
        registrantEmail: normalizedEmail,
        eventName,
        eventDate: formatEventDate(eventDate),
        eventTime: formatEventTime(startTime),
        eventLocation: startLocation?.trim() || 'Start control per route',
        eventDistance: route.distance_km || 0,
        eventType: 'Permanent',
        chapterName: route.chapters?.name || '',
        chapterSlug: route.chapters?.slug || '',
        routeUrl: buildRouteUrl(route.rwgps_id),
        notes: notes || undefined,
      },
      duplicateMessage: 'You are already registered for this permanent ride',
      emailErrorOperation: 'registerForPermanent.sendEmail',
      emailErrorContext: { routeId, email: normalizedEmail },
      revalidate: () => {
        revalidateTag('registrations', { expire: 0 })
        revalidateTag('events', { expire: 0 }) // Revalidate events cache (used by getPermanentEvents)
        revalidateTag('permanents', { expire: 0 }) // Revalidate permanents calendar cache
        revalidateTag(`event-${eventSlug}`, { expire: 0 })
        revalidatePath(`/register/${eventSlug}`)
        revalidatePath('/calendar/permanents')
      },
    })
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

  const { eventId, selectedRiderId, gender, shareRegistration, notes, teamName, isTeamCaptain } =
    data

  // Validate required fields
  if (!eventId) {
    return { success: false, error: 'Missing required fields' }
  }

  const validation = validateContactFields(data)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }
  const { trimmedFirstName, trimmedLastName, normalizedEmail, normalizedPhone } = validation.value
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null
  const trimmedTeamName = teamName?.trim() || undefined

  // All DB work is wrapped so any helper throw (insertNewRider,
  // createRegistrationRecord) becomes a clean ActionResult with Sentry logging,
  // matching registerForEvent / registerForPermanent.
  try {
    // Check if event exists and is scheduled
    const { data: eventData, error: eventError } = await getSupabaseAdmin()
      .from('events')
      .select(EVENT_SELECT)
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
        emergency_contact_name: data.emergencyContactName?.trim() || null,
        emergency_contact_phone: normalizedPhone || null,
      }
      await getSupabaseAdmin().from('riders').update(updateData).eq('id', selectedRiderId)
    } else {
      // User confirmed they're a new rider - create new rider record.
      // insertNewRider logs to Sentry and throws on failure; surface a friendly message.
      try {
        const newRider = await insertNewRider({
          first_name: trimmedFirstName,
          last_name: trimmedLastName,
          email: normalizedEmail,
          gender: parsedGender,
          emergency_contact_name: data.emergencyContactName?.trim() || null,
          emergency_contact_phone: normalizedPhone || null,
        })
        riderId = newRider.id
      } catch {
        return { success: false, error: 'Failed to create rider profile' }
      }
    }

    return await finalizeRegistration({
      eventId,
      riderId,
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
      realChapterId: realChapterIdFor(event.chapters?.slug, event.chapter_id),
      shareRegistration,
      notes,
      teamName: trimmedTeamName,
      isTeamCaptain,
      emailBase: eventEmailBase(
        event,
        `${trimmedFirstName} ${trimmedLastName}`,
        normalizedEmail,
        notes
      ),
      duplicateMessage: 'You are already registered for this event',
      emailErrorOperation: 'completeRegistrationWithRider.sendEmail',
      emailErrorContext: { eventId, email: normalizedEmail },
      revalidate: () => {
        revalidateTag('registrations', { expire: 0 })
        revalidateTag('events', { expire: 0 }) // Revalidate chapter calendar caches (registration counts)
        revalidateTag(`event-${event.slug}`, { expire: 0 })
        revalidatePath(`/register/${event.slug}`)
      },
    })
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'completeRegistrationWithRider' },
      'Registration failed'
    )
  }
}
