'use server'

import { supabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { format, parseISO } from 'date-fns'
import type { Database } from '@/types/supabase'

type RidersUpdate = Database['public']['Tables']['riders']['Update']
type RidersInsert = Database['public']['Tables']['riders']['Insert']
type RegistrationsInsert = Database['public']['Tables']['registrations']['Insert']

interface EventWithChapter {
  id: string
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

function formatEventType(eventType: string): string {
  const typeMap: Record<string, string> = {
    brevet: 'Brevet',
    populaire: 'Populaire',
    fleche: 'Fleche',
    permanent: 'Permanent',
  }
  return typeMap[eventType] || 'Brevet'
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
  const { data: eventData, error: eventError } = await (supabaseAdmin.from('events') as any)
    .select(`
      id, status, name, event_date, start_time,
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

  const { data: existingRider } = await supabaseAdmin
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
    await (supabaseAdmin.from('riders') as any).update(updateData).eq('id', riderId)
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
    const { data: newRider, error: riderError } = await (supabaseAdmin.from('riders') as any)
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
  const { data: existingRegistration } = await supabaseAdmin
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
  const { error: registrationError } = await (supabaseAdmin.from('registrations') as any)
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

  return { success: true }
}
