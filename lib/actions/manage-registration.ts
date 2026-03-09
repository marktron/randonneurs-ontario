'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { createTorontoDate } from '@/lib/brmTimes'
import { sendCancellationConfirmationEmail } from '@/lib/email/send-registration-email'
import { logError } from '@/lib/errors'
import { parseISO } from 'date-fns'
import type { ResultInsert } from '@/types/queries'

// ============================================================================
// Types
// ============================================================================

export interface RegistrationManagementData {
  registration: {
    id: string
    status: string | null
    cancelled_at: string | null
    management_token: string
    is_team_captain: boolean
  }
  event: {
    id: string
    slug: string
    status: string | null
    name: string
    event_date: string
    start_time: string | null
    start_location: string | null
    distance_km: number
    event_type: string | null
    chapter_name: string | null
    chapter_slug: string | null
  }
  rider: {
    first_name: string
    last_name: string
    email: string | null
  }
  existingResultToken: string | null
}

// ============================================================================
// Queries
// ============================================================================

export async function getRegistrationByToken(
  token: string
): Promise<RegistrationManagementData | null> {
  const supabase = getSupabaseAdmin()

  const { data: registration, error } = await supabase
    .from('registrations')
    .select(
      `
      id, status, cancelled_at, management_token, is_team_captain,
      events!inner (
        id, slug, status, name, event_date, start_time,
        start_location, distance_km, event_type,
        chapters (name, slug)
      ),
      riders!inner (first_name, last_name, email)
    `
    )
    .eq('management_token', token)
    .single()

  if (error || !registration) {
    return null
  }

  // Cast from Supabase's nested join types
  const reg = registration as {
    id: string
    status: string | null
    cancelled_at: string | null
    management_token: string
    is_team_captain: boolean
    events: {
      id: string
      slug: string
      status: string | null
      name: string
      event_date: string
      start_time: string | null
      start_location: string | null
      distance_km: number
      event_type: string | null
      chapters: { name: string; slug: string } | null
    }
    riders: {
      first_name: string
      last_name: string
      email: string | null
    }
  }

  // Check for existing result with matching submission_token
  const { data: existingResult } = await supabase
    .from('results')
    .select('submission_token')
    .eq('submission_token', token)
    .single()

  return {
    registration: {
      id: reg.id,
      status: reg.status,
      cancelled_at: reg.cancelled_at,
      management_token: reg.management_token,
      is_team_captain: reg.is_team_captain,
    },
    event: {
      id: reg.events.id,
      slug: reg.events.slug,
      status: reg.events.status,
      name: reg.events.name,
      event_date: reg.events.event_date,
      start_time: reg.events.start_time,
      start_location: reg.events.start_location,
      distance_km: reg.events.distance_km,
      event_type: reg.events.event_type,
      chapter_name: reg.events.chapters?.name || null,
      chapter_slug: reg.events.chapters?.slug || null,
    },
    rider: {
      first_name: reg.riders.first_name,
      last_name: reg.riders.last_name,
      email: reg.riders.email,
    },
    existingResultToken: existingResult
      ? (existingResult as { submission_token: string }).submission_token
      : null,
  }
}

// ============================================================================
// Cancel Registration
// ============================================================================

export async function cancelRegistration(
  token: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()

  // Fetch registration with event status
  const { data: registration, error: fetchError } = await supabase
    .from('registrations')
    .select(
      `
      id, status, rider_id, event_id,
      events!inner (id, slug, status, name, event_date, start_time, distance_km, event_type,
        chapters (name, slug)),
      riders!inner (first_name, last_name, email)
    `
    )
    .eq('management_token', token)
    .single()

  if (fetchError || !registration) {
    return { success: false, error: 'Registration not found' }
  }

  const reg = registration as {
    id: string
    status: string | null
    rider_id: string
    event_id: string
    events: {
      id: string
      slug: string
      status: string | null
      name: string
      event_date: string
      start_time: string | null
      distance_km: number
      event_type: string | null
      chapters: { name: string; slug: string } | null
    }
    riders: {
      first_name: string
      last_name: string
      email: string | null
    }
  }

  // Verify registration can be cancelled
  if (reg.status !== 'registered' && reg.status !== 'incomplete: membership') {
    return { success: false, error: 'This registration has already been cancelled' }
  }

  // Verify event is still scheduled
  if (reg.events.status !== 'scheduled') {
    return { success: false, error: 'This event is no longer open for changes' }
  }

  // Update registration
  const { error: updateError } = await supabase
    .from('registrations')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', reg.id)

  if (updateError) {
    logError(updateError, { operation: 'cancelRegistration' })
    return { success: false, error: 'Failed to cancel registration' }
  }

  // Send cancellation email (fire-and-forget)
  if (reg.riders.email) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://randonneursontario.ca'
    const riderName = `${reg.riders.first_name} ${reg.riders.last_name}`
    sendCancellationConfirmationEmail({
      registrantName: riderName,
      registrantEmail: reg.riders.email,
      eventName: reg.events.name,
      eventDate: reg.events.event_date,
      eventDistance: reg.events.distance_km,
      eventType: reg.events.event_type || 'brevet',
      chapterName: reg.events.chapters?.name || '',
      chapterSlug: reg.events.chapters?.slug || '',
      registerUrl: `${baseUrl}/register/${reg.events.slug}`,
    }).catch((error) => {
      logError(error, {
        operation: 'cancelRegistration.sendEmail',
        context: { registrationId: reg.id },
      })
    })
  }

  // Revalidate caches
  revalidateTag('registrations', 'max')
  revalidateTag('events', 'max')
  revalidateTag(`event-${reg.events.slug}`, 'max')
  revalidatePath(`/register/${reg.events.slug}`)

  return { success: true }
}

// ============================================================================
// Create Early Result (rider submitting before cron fires)
// ============================================================================

export async function createEarlyResult(
  token: string
): Promise<{ success: boolean; error?: string; submissionToken?: string }> {
  const supabase = getSupabaseAdmin()

  // Look up registration by management_token
  const { data: registration, error: fetchError } = await supabase
    .from('registrations')
    .select(
      `
      id, status, rider_id, event_id, management_token,
      events!inner (id, event_date, start_time, distance_km, status)
    `
    )
    .eq('management_token', token)
    .single()

  if (fetchError || !registration) {
    return { success: false, error: 'Registration not found' }
  }

  const reg = registration as {
    id: string
    status: string | null
    rider_id: string
    event_id: string
    management_token: string
    events: {
      id: string
      event_date: string
      start_time: string | null
      distance_km: number
      status: string | null
    }
  }

  // Check for existing result — idempotent
  const { data: existingResult } = await supabase
    .from('results')
    .select('submission_token')
    .eq('event_id', reg.event_id)
    .eq('rider_id', reg.rider_id)
    .single()

  if (existingResult) {
    const typed = existingResult as { submission_token: string | null }
    return { success: true, submissionToken: typed.submission_token || undefined }
  }

  // Verify event start time has passed
  const eventDate = parseISO(reg.events.event_date)
  const [hours, minutes] = (reg.events.start_time || '0:00').split(':').map(Number)
  const eventStart = createTorontoDate(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate(),
    hours,
    minutes
  )

  if (new Date() < eventStart) {
    return { success: false, error: 'Results can only be submitted after the event has started' }
  }

  // Verify registration is valid
  if (reg.status !== 'registered') {
    return { success: false, error: 'Only active registrations can submit results' }
  }

  // Calculate season from event date
  const eventYear = parseInt(reg.events.event_date.split('-')[0])

  // Create pending result with submission_token = management_token (shared value)
  const insertData: ResultInsert = {
    event_id: reg.event_id,
    rider_id: reg.rider_id,
    status: 'pending',
    season: eventYear,
    distance_km: reg.events.distance_km,
    submission_token: reg.management_token,
  }

  const { error: createError } = await supabase.from('results').insert(insertData)

  if (createError) {
    logError(createError, { operation: 'createEarlyResult' })
    return { success: false, error: 'Failed to create result' }
  }

  return { success: true, submissionToken: reg.management_token }
}
