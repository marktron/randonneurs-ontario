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

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { formatEventType } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import { searchRiderCandidates, type RiderMatchCandidate } from './rider-match'
import type {
  RiderInsert,
  RiderUpdate,
  RegistrationInsert,
  EventInsert,
  EventWithChapter,
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
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
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
  const { eventId, firstName, lastName, email, gender, shareRegistration, notes, emergencyContactName, emergencyContactPhone } = data

  // Step 1: Validate required fields
  if (!eventId || !firstName.trim() || !lastName.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()

  // Check if event exists and is scheduled (fetch details for confirmation email)
  const { data: eventData, error: eventError } = await getSupabaseAdmin()
    .from('events')
    .select(`
      id, slug, status, name, event_date, start_time,
      start_location, distance_km, event_type,
      chapters (slug, name)
    `)
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    return { success: false, error: 'Event not found' }
  }

  const event = eventData as EventWithChapter

  if (event.status !== 'scheduled') {
    return { success: false, error: 'Registration is not open for this event' }
  }

  // Find or create rider
  let riderId: string

  const { data: existingRider } = await getSupabaseAdmin()
    .from('riders')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  if (existingRider) {
    const typedRider = existingRider as RiderIdOnly
    riderId = typedRider.id

    // Update rider info if they provided more details
    const updateData: RiderUpdate = {
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      gender: parsedGender,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
    }
    await getSupabaseAdmin().from('riders').update(updateData).eq('id', riderId)
  } else {
    // Email not found - search for fuzzy name matches among riders without email
    const { candidates } = await searchRiderCandidates(trimmedFirstName, trimmedLastName)

    // If there are potential matches, return them for user selection
    if (candidates.length > 0) {
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: candidates,
        pendingData: data,
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
      console.error('Error creating rider:', riderError)
      return { success: false, error: 'Failed to create rider profile' }
    }

    const typedNewRider = newRider as RiderIdOnly
    riderId = typedNewRider.id
  }

  // Check if already registered
  const { data: existingRegistration } = await getSupabaseAdmin()
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existingRegistration) {
    return { success: false, error: 'You are already registered for this event' }
  }

  // Create registration
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
    share_registration: shareRegistration,
    notes: notes || null,
  }
  const { error: registrationError } = await getSupabaseAdmin()
    .from('registrations')
    .insert(insertRegistration)

  if (registrationError) {
    console.error('Error creating registration:', registrationError)
    return { success: false, error: 'Failed to complete registration' }
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
    notes: notes || undefined,
  }).catch((error) => {
    console.error('Email sending failed:', error)
  })

  // Revalidate the registration page to show the new registration
  revalidatePath(`/register/${event.slug}`)

  return { success: true }
}

export interface PermanentRegistrationData {
  routeId: string
  eventDate: string       // YYYY-MM-DD
  startTime: string       // HH:MM
  startLocation?: string  // Optional - only if different from route start
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


export async function registerForPermanent(data: PermanentRegistrationData): Promise<RegistrationResult> {
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
  if (!routeId || !eventDate || !startTime || !firstName.trim() || !lastName.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()

  // Validate date is at least 2 weeks in the future
  const eventDateObj = parseISO(eventDate)
  const twoWeeksFromNow = new Date()
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
  twoWeeksFromNow.setHours(0, 0, 0, 0)

  if (eventDateObj < twoWeeksFromNow) {
    return { success: false, error: 'Permanent rides must be scheduled at least 2 weeks in advance' }
  }

  // Fetch route details
  const { data: routeData, error: routeError } = await getSupabaseAdmin()
    .from('routes')
    .select(`
      id, name, slug, distance_km, chapter_id,
      chapters (slug, name)
    `)
    .eq('id', routeId)
    .eq('is_active', true)
    .single()

  if (routeError || !routeData) {
    return { success: false, error: 'Route not found or is not active' }
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

  // Find or create rider (reusing same logic as registerForEvent)
  const normalizedEmail = email.toLowerCase().trim()

  let riderId: string

  const { data: existingRider } = await getSupabaseAdmin()
    .from('riders')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  if (existingRider) {
    const typedRider = existingRider as RiderIdOnly
    riderId = typedRider.id

    // Update rider info if they provided more details
    const updateData: RiderUpdate = {
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      gender: parsedGender,
      emergency_contact_name: emergencyContactName || null,
      emergency_contact_phone: emergencyContactPhone || null,
    }
    await getSupabaseAdmin().from('riders').update(updateData).eq('id', riderId)
  } else {
    // Email not found - search for fuzzy name matches among riders without email
    const { candidates } = await searchRiderCandidates(trimmedFirstName, trimmedLastName)

    // If there are potential matches, return them for user selection
    if (candidates.length > 0) {
      return {
        success: false,
        needsRiderMatch: true,
        matchCandidates: candidates,
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
      console.error('Error creating rider:', riderError)
      return { success: false, error: 'Failed to create rider profile' }
    }

    const typedNewRider = newRider as RiderIdOnly
    riderId = typedNewRider.id
  }

  // Check if already registered
  const { data: existingRegistration } = await getSupabaseAdmin()
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existingRegistration) {
    return { success: false, error: 'You are already registered for this permanent ride' }
  }

  // Create registration
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
    share_registration: shareRegistration,
    notes: notes || null,
  }
  const { error: registrationError } = await getSupabaseAdmin()
    .from('registrations')
    .insert(insertRegistration)

  if (registrationError) {
    console.error('Error creating registration:', registrationError)
    return { success: false, error: 'Failed to complete registration' }
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
    notes: notes || undefined,
  }).catch((error) => {
    console.error('Email sending failed:', error)
  })

  // Revalidate the registration page to show the new registration
  revalidatePath(`/register/${eventSlug}`)

  return { success: true }
}

// ============================================================================
// COMPLETE REGISTRATION WITH SELECTED RIDER
// ============================================================================

export interface CompleteRegistrationData {
  eventId: string
  selectedRiderId: string | null  // null = create new rider
  firstName: string
  lastName: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
  emergencyContactName: string
  emergencyContactPhone: string
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
  const { eventId, selectedRiderId, firstName, lastName, email, gender, shareRegistration, notes, emergencyContactName, emergencyContactPhone } = data

  // Validate required fields
  if (!eventId || !firstName.trim() || !lastName.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  // Check if event exists and is scheduled
  const { data: eventData, error: eventError } = await getSupabaseAdmin()
    .from('events')
    .select(`
      id, slug, status, name, event_date, start_time,
      start_location, distance_km, event_type,
      chapters (slug, name)
    `)
    .eq('id', eventId)
    .single()

  if (eventError || !eventData) {
    return { success: false, error: 'Event not found' }
  }

  const event = eventData as EventWithChapter

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

  // Check if already registered
  const { data: existingRegistration } = await getSupabaseAdmin()
    .from('registrations')
    .select('id')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .single()

  if (existingRegistration) {
    return { success: false, error: 'You are already registered for this event' }
  }

  // Create registration
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
    share_registration: shareRegistration,
    notes: notes || null,
  }
  const { error: registrationError } = await getSupabaseAdmin()
    .from('registrations')
    .insert(insertRegistration)

  if (registrationError) {
    console.error('Error creating registration:', registrationError)
    return { success: false, error: 'Failed to complete registration' }
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
    notes: notes || undefined,
  }).catch((error) => {
    console.error('Email sending failed:', error)
  })

  // Revalidate the registration page
  revalidatePath(`/register/${event.slug}`)

  return { success: true }
}
