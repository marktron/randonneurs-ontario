'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { formatEventType } from '@/lib/utils'
import { format, parseISO } from 'date-fns'
import type { Database } from '@/types/supabase'

type RidersUpdate = Database['public']['Tables']['riders']['Update']
type RidersInsert = Database['public']['Tables']['riders']['Insert']
type RegistrationsInsert = Database['public']['Tables']['registrations']['Insert']
type EventsInsert = Database['public']['Tables']['events']['Insert']

interface EventWithChapter {
  id: string
  slug: string
  status: string
  name: string
  event_date: string
  start_time: string | null
  start_location: string | null
  distance_km: number
  event_type: string
  chapters: { slug: string; name: string } | null
}

export interface RegistrationData {
  eventId: string
  name: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
}

export interface RegistrationResult {
  success: boolean
  error?: string
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  const firstName = parts[0]
  const lastName = parts.slice(1).join(' ')
  return { firstName, lastName }
}

function createRiderSlug(email: string): string {
  const prefix = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')
  const suffix = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${suffix}`
}

function formatEventDate(dateStr: string): string {
  return format(parseISO(dateStr), 'EEEE, MMMM d, yyyy')
}

function formatEventTime(timeStr: string | null): string {
  if (!timeStr) return 'TBD'
  const [hours, minutes] = timeStr.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

export async function registerForEvent(data: RegistrationData): Promise<RegistrationResult> {
  const { eventId, name, email, gender, shareRegistration, notes } = data

  // Validate required fields
  if (!eventId || !name.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  const { firstName, lastName } = splitName(name)
  const normalizedEmail = email.toLowerCase().trim()

  // Check if event exists and is scheduled (fetch details for confirmation email)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: eventData, error: eventError } = await (getSupabaseAdmin().from('events') as any)
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
    riderId = (existingRider as { id: string }).id

    // Update rider info if they provided more details
    const updateData: RidersUpdate = {
      first_name: firstName,
      last_name: lastName,
      gender: parsedGender,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabaseAdmin().from('riders') as any).update(updateData).eq('id', riderId)
  } else {
    // Create new rider
    const insertRider: RidersInsert = {
      slug: createRiderSlug(normalizedEmail),
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      gender: parsedGender,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRider, error: riderError } = await (getSupabaseAdmin().from('riders') as any)
      .insert(insertRider)
      .select('id')
      .single()

    if (riderError || !newRider) {
      console.error('Error creating rider:', riderError)
      return { success: false, error: 'Failed to create rider profile' }
    }

    riderId = (newRider as { id: string }).id
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
  const insertRegistration: RegistrationsInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
    share_registration: shareRegistration,
    notes: notes || null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: registrationError } = await (getSupabaseAdmin().from('registrations') as any)
    .insert(insertRegistration)

  if (registrationError) {
    console.error('Error creating registration:', registrationError)
    return { success: false, error: 'Failed to complete registration' }
  }

  // Send confirmation email (fire-and-forget - don't block registration on email)
  const chapter = event.chapters
  sendRegistrationConfirmationEmail({
    registrantName: name,
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
  name: string
  email: string
  gender?: string
  shareRegistration: boolean
  notes?: string
}

interface RouteWithChapter {
  id: string
  name: string
  slug: string
  distance_km: number | null
  chapter_id: string | null
  chapters: { slug: string; name: string } | null
}

export async function registerForPermanent(data: PermanentRegistrationData): Promise<RegistrationResult> {
  const {
    routeId,
    eventDate,
    startTime,
    startLocation,
    direction,
    name,
    email,
    gender,
    shareRegistration,
    notes,
  } = data

  // Validate required fields
  if (!routeId || !eventDate || !startTime || !name.trim() || !email.trim()) {
    return { success: false, error: 'Missing required fields' }
  }

  // Validate date is at least 2 weeks in the future
  const eventDateObj = parseISO(eventDate)
  const twoWeeksFromNow = new Date()
  twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
  twoWeeksFromNow.setHours(0, 0, 0, 0)

  if (eventDateObj < twoWeeksFromNow) {
    return { success: false, error: 'Permanent rides must be scheduled at least 2 weeks in advance' }
  }

  // Fetch route details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: routeData, error: routeError } = await (getSupabaseAdmin().from('routes') as any)
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

  // Get the permanent chapter ID
  const { data: permanentChapter, error: chapterError } = await getSupabaseAdmin()
    .from('chapters')
    .select('id')
    .eq('slug', 'permanent')
    .single()

  if (chapterError || !permanentChapter) {
    console.error('Error fetching permanent chapter:', chapterError)
    return { success: false, error: 'Failed to find permanent chapter' }
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
    eventId = (existingEvent as { id: string }).id
  } else {
    // Create new event
    const insertEvent: EventsInsert = {
      slug: eventSlug,
      name: eventName,
      event_type: 'permanent',
      status: 'scheduled',
      route_id: route.id,
      chapter_id: (permanentChapter as { id: string }).id,
      distance_km: route.distance_km || 0,
      event_date: eventDate,
      start_time: startTime,
      start_location: startLocation?.trim() || null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newEvent, error: eventError } = await (getSupabaseAdmin().from('events') as any)
      .insert(insertEvent)
      .select('id')
      .single()

    if (eventError || !newEvent) {
      console.error('Error creating permanent event:', eventError)
      return { success: false, error: 'Failed to create permanent ride event' }
    }

    eventId = (newEvent as { id: string }).id
  }

  // Find or create rider (reusing same logic as registerForEvent)
  const { firstName, lastName } = splitName(name)
  const normalizedEmail = email.toLowerCase().trim()

  let riderId: string

  const { data: existingRider } = await getSupabaseAdmin()
    .from('riders')
    .select('id')
    .eq('email', normalizedEmail)
    .single()

  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  if (existingRider) {
    riderId = (existingRider as { id: string }).id

    // Update rider info if they provided more details
    const updateData: RidersUpdate = {
      first_name: firstName,
      last_name: lastName,
      gender: parsedGender,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabaseAdmin().from('riders') as any).update(updateData).eq('id', riderId)
  } else {
    // Create new rider
    const insertRider: RidersInsert = {
      slug: createRiderSlug(normalizedEmail),
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      gender: parsedGender,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRider, error: riderError } = await (getSupabaseAdmin().from('riders') as any)
      .insert(insertRider)
      .select('id')
      .single()

    if (riderError || !newRider) {
      console.error('Error creating rider:', riderError)
      return { success: false, error: 'Failed to create rider profile' }
    }

    riderId = (newRider as { id: string }).id
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
  const insertRegistration: RegistrationsInsert = {
    event_id: eventId,
    rider_id: riderId,
    status: 'registered',
    share_registration: shareRegistration,
    notes: notes || null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: registrationError } = await (getSupabaseAdmin().from('registrations') as any)
    .insert(insertRegistration)

  if (registrationError) {
    console.error('Error creating registration:', registrationError)
    return { success: false, error: 'Failed to complete registration' }
  }

  // Send confirmation email (fire-and-forget)
  const chapter = route.chapters
  sendRegistrationConfirmationEmail({
    registrantName: name,
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
