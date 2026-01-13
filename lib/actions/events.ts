'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { sendgrid } from '@/lib/email/sendgrid'
import { parseLocalDate, createSlug } from '@/lib/utils'
import { getUrlSlugFromDbSlug } from '@/lib/chapter-config'
import { createPendingResultsAndSendEmails } from '@/lib/events/complete-event'
import {
  handleActionError,
  handleSupabaseError,
  createActionResult,
} from '@/lib/errors'
import type { ActionResult } from '@/types/actions'
import type {
  ChapterSlugOnly,
  Event,
  EventInsert,
  EventUpdate,
  EventIdOnly,
  EventForStatusUpdate,
  EventWithChapterName,
} from '@/types/queries'

// Helper to revalidate cache tags for calendar pages
async function revalidateCalendarTags(chapterId: string, eventType: string, eventSlug?: string) {
  // Get chapter slug
  const { data: chapter } = await getSupabaseAdmin()
    .from('chapters')
    .select('slug')
    .eq('id', chapterId)
    .single()

  if (chapter) {
    const typedChapter = chapter as ChapterSlugOnly
    if (typedChapter.slug) {
      const urlSlug = getUrlSlugFromDbSlug(typedChapter.slug)
      if (urlSlug) {
        // Revalidate chapter-specific events cache
        revalidateTag(`chapter-${urlSlug}`, 'max')
      }
    }
  }

  // Revalidate general events cache
  revalidateTag('events', 'max')

  // Revalidate specific event if slug provided
  if (eventSlug) {
    revalidateTag(`event-${eventSlug}`, 'max')
  }

  // Also revalidate permanents cache if it's a permanent event
  if (eventType === 'permanent') {
    revalidateTag('permanents', 'max')
  }
}

export type EventStatus = 'scheduled' | 'completed' | 'cancelled' | 'submitted'
export type EventType = 'brevet' | 'populaire' | 'fleche' | 'permanent'

export interface CreateEventData {
  name: string
  chapterId: string
  routeId?: string | null
  eventType: EventType
  distanceKm: number
  eventDate: string  // YYYY-MM-DD
  startTime?: string | null  // HH:MM
  startLocation?: string | null
  description?: string | null  // Markdown-formatted description
  imageUrl?: string | null  // URL to event image from Supabase Storage
}

export async function createEvent(data: CreateEventData): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const {
      name,
      chapterId,
      routeId,
      eventType,
      distanceKm,
      eventDate,
      startTime,
      startLocation,
      description,
      imageUrl,
    } = data

    // Validate required fields
    if (!name.trim() || !chapterId || !eventDate || !distanceKm) {
      return { success: false, error: 'Missing required fields' }
    }

    // Generate slug from name, distance, and date
    const slug = createSlug(`${name}-${distanceKm}-${eventDate}`)

    const insertData: EventInsert = {
      slug,
      name: name.trim(),
      chapter_id: chapterId,
      route_id: routeId || null,
      event_type: eventType,
      distance_km: distanceKm,
      event_date: eventDate,
      start_time: startTime || null,
      start_location: startLocation || null,
      description: description || null,
      image_url: imageUrl || null,
      status: 'scheduled',
      // Note: season is a generated column computed from event_date
    }

    const { data: newEvent, error } = await getSupabaseAdmin()
      .from('events')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'createEvent', userMessage: 'An event with this slug already exists' },
        'Failed to create event'
      )
    }

    if (!newEvent) {
      return handleActionError(
        new Error('Event creation returned no data'),
        { operation: 'createEvent' },
        'Failed to create event'
      )
    }

    const typedNewEvent = newEvent as EventIdOnly

    // Revalidate admin pages (still use revalidatePath for admin routes)
    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Revalidate cache tags for calendar pages
    await revalidateCalendarTags(chapterId, eventType)

    return createActionResult({ id: typedNewEvent.id })
  } catch (error) {
    return handleActionError(error, { operation: 'createEvent' }, 'Failed to create event')
  }
}

export interface UpdateEventData {
  name?: string
  chapterId?: string
  routeId?: string | null
  eventType?: EventType
  distanceKm?: number
  eventDate?: string  // YYYY-MM-DD
  startTime?: string | null  // HH:MM
  startLocation?: string | null
  description?: string | null  // Markdown-formatted description
  imageUrl?: string | null  // URL to event image from Supabase Storage
}

export async function updateEvent(
  eventId: string,
  data: UpdateEventData
): Promise<ActionResult> {
  try {
    await requireAdmin()

    const updateData: Record<string, unknown> = {}

    if (data.name !== undefined) {
      updateData.name = data.name.trim()
    }
    if (data.chapterId !== undefined) {
      updateData.chapter_id = data.chapterId
    }
    if (data.routeId !== undefined) {
      updateData.route_id = data.routeId || null
    }
    if (data.eventType !== undefined) {
      updateData.event_type = data.eventType
    }
    if (data.distanceKm !== undefined) {
      updateData.distance_km = data.distanceKm
    }
    if (data.eventDate !== undefined) {
      updateData.event_date = data.eventDate
      // Note: season is a generated column, auto-updated from event_date
    }
    if (data.startTime !== undefined) {
      updateData.start_time = data.startTime || null
    }
    if (data.startLocation !== undefined) {
      updateData.start_location = data.startLocation || null
    }
    if (data.description !== undefined) {
      updateData.description = data.description || null
    }
    if (data.imageUrl !== undefined) {
      updateData.image_url = data.imageUrl || null
    }

    const typedUpdateData: EventUpdate = updateData

    const { error } = await getSupabaseAdmin()
      .from('events')
      .update(typedUpdateData)
      .eq('id', eventId)

    if (error) {
      return handleSupabaseError(
        error,
        { operation: 'updateEvent' },
        'Failed to update event'
      )
    }

    // Revalidate admin pages (still use revalidatePath for admin routes)
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Fetch event to get chapter, type, and slug for cache tag revalidation
    const { data: event } = await getSupabaseAdmin()
      .from('events')
      .select('chapter_id, event_type, slug')
      .eq('id', eventId)
      .single()

    if (event) {
      await revalidateCalendarTags(event.chapter_id, event.event_type, event.slug)
    }

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'updateEvent' }, 'Failed to update event')
  }
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  try {
    await requireAdmin()

    // Fetch the event to check the date and get chapter info for revalidation
    const { data: event, error: fetchError } = await getSupabaseAdmin()
      .from('events')
      .select('id, event_date, chapter_id, event_type')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      return { success: false, error: 'Event not found' }
    }

    const typedEvent = event as Pick<Event, 'id' | 'event_date' | 'chapter_id' | 'event_type'>

    // Check if event is in the past
    const today = new Date().toISOString().split('T')[0]
    if (typedEvent.event_date < today) {
      return { success: false, error: 'Cannot delete past events' }
    }

    // Delete registrations for this event first
    const { error: regDeleteError } = await getSupabaseAdmin()
      .from('registrations')
      .delete()
      .eq('event_id', eventId)

    if (regDeleteError) {
      return handleSupabaseError(
        regDeleteError,
        { operation: 'deleteEvent.registrations' },
        'Failed to delete event registrations'
      )
    }

    // Delete results for this event (shouldn't exist for future events, but just in case)
    const { error: resultsDeleteError } = await getSupabaseAdmin()
      .from('results')
      .delete()
      .eq('event_id', eventId)

    if (resultsDeleteError) {
      return handleSupabaseError(
        resultsDeleteError,
        { operation: 'deleteEvent.results' },
        'Failed to delete event results'
      )
    }

    // Delete the event
    const { error: deleteError } = await getSupabaseAdmin()
      .from('events')
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      return handleSupabaseError(
        deleteError,
        { operation: 'deleteEvent' },
        'Failed to delete event'
      )
    }

    // Revalidate admin pages (still use revalidatePath for admin routes)
    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Revalidate cache tags for calendar pages
    await revalidateCalendarTags(typedEvent.chapter_id, typedEvent.event_type)

    return createActionResult()
  } catch (error) {
    return handleActionError(error, { operation: 'deleteEvent' }, 'Failed to delete event')
  }
}

export async function updateEventStatus(
  eventId: string,
  status: EventStatus
): Promise<ActionResult> {
  try {
    await requireAdmin()

    // If cancelling, delete all results for this event first
    if (status === 'cancelled') {
      const { error: deleteError } = await getSupabaseAdmin()
        .from('results')
        .delete()
        .eq('event_id', eventId)

      if (deleteError) {
        console.error('Error deleting results:', deleteError)
        return { success: false, error: 'Failed to delete results' }
      }
    }

    // Fetch event details before updating (needed for completion emails)
    const { data: event, error: fetchError } = await getSupabaseAdmin()
      .from('events')
      .select('id, name, event_date, distance_km, chapter_id, event_type, status, chapters(name)')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      console.error('Error fetching event:', fetchError)
      return { success: false, error: 'Event not found' }
    }

    const typedEvent = event as EventWithChapterName

    const updateData: EventUpdate = { status }
    const { error } = await getSupabaseAdmin()
      .from('events')
      .update(updateData)
      .eq('id', eventId)

    if (error) {
      console.error('Error updating event status:', error)
      return { success: false, error: 'Failed to update event status' }
    }

    // If transitioning to "completed", create pending results and send emails
    if (status === 'completed' && typedEvent.status === 'scheduled') {
      const { resultsCreated, emailsSent, errors } = await createPendingResultsAndSendEmails({
        id: typedEvent.id,
        name: typedEvent.name,
        event_date: typedEvent.event_date,
        distance_km: typedEvent.distance_km,
        chapters: typedEvent.chapters,
      })

      console.log(`Event ${typedEvent.name} completed: ${resultsCreated} results created, ${emailsSent} emails sent`)

      if (errors.length > 0) {
        console.error('Errors during completion:', errors)
      }
    }

    // Revalidate admin pages (still use revalidatePath for admin routes)
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/admin/events')
    revalidatePath('/admin')
    revalidatePath('/admin/results')

    // Revalidate cache tags for calendar pages
    if (event) {
      await revalidateCalendarTags(event.chapter_id, event.event_type)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in updateEventStatus:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

interface ResultForEmail {
  riders: {
    first_name: string
    last_name: string
  }
  status: string
  finish_time: string | null
  note: string | null
}

interface EventForSubmission {
  id: string
  name: string
  event_date: string
  status: string | null
  chapters: {
    name: string
  } | null
}

export async function submitEventResults(eventId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    // Fetch event details
    const { data: event, error: eventError } = await getSupabaseAdmin()
      .from('events')
      .select(`
        id,
        name,
        event_date,
        status,
        chapters (name)
      `)
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return { success: false, error: 'Event not found' }
    }

    const typedEvent = event as EventForSubmission

    if (typedEvent.status === 'submitted') {
      return { success: false, error: 'Results have already been submitted' }
    }

    if (typedEvent.status !== 'completed') {
      return { success: false, error: 'Only completed events can have results submitted' }
    }

    // Fetch all results for this event
    const { data: results, error: resultsError } = await getSupabaseAdmin()
      .from('results')
      .select(`
        riders (first_name, last_name),
        status,
        finish_time,
        note
      `)
      .eq('event_id', eventId)
      .order('finish_time', { ascending: true, nullsFirst: false })

    if (resultsError) {
      return { success: false, error: 'Failed to fetch results' }
    }

    const typedResults = (results || []) as ResultForEmail[]

    // Build email content
    const eventDate = parseLocalDate(typedEvent.event_date).toLocaleDateString('en-CA', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })

    const chapterName = typedEvent.chapters?.name || 'Unknown'
    const subject = `Results for ${typedEvent.name} - ${eventDate} (${chapterName} chapter)`

    const resultLines = typedResults.map((r) => {
      const name = `${r.riders.first_name} ${r.riders.last_name}`
      const status = r.status.toUpperCase()
      const time = r.finish_time || '-'
      const note = r.note ? ` | Note: ${r.note}` : ''
      return `${name}: ${status}${r.status === 'finished' ? ` (${time})` : ''}${note}`
    })

    const emailBody = `Results for ${typedEvent.name}
${eventDate}
${chapterName} chapter

Submitted by: ${admin.name} (${admin.email})

---

RESULTS (${typedResults.length} rider${typedResults.length !== 1 ? 's' : ''}):

${resultLines.length > 0 ? resultLines.join('\n') : 'No results recorded.'}

---
This email was sent from the Randonneurs Ontario admin system.
`

    // Send email
    if (!process.env.SENDGRID_API_KEY) {
      console.warn('SendGrid API key not configured, skipping email')
    } else {
      try {
        await sendgrid.send({
          to: 'vp-toronto@randonneursontario.ca',
          from: admin.email,
          subject,
          text: emailBody,
        })
      } catch (emailError) {
        console.error('Failed to send results email:', emailError)
        return { success: false, error: 'Failed to send email. Please try again.' }
      }
    }

    // Update event status to submitted
    const updateData: EventUpdate = { status: 'submitted' }
    const { error: updateError } = await getSupabaseAdmin()
      .from('events')
      .update(updateData)
      .eq('id', eventId)

    if (updateError) {
      console.error('Error updating event status:', updateError)
      return { success: false, error: 'Email sent but failed to update event status' }
    }

    // Revalidate admin pages (still use revalidatePath for admin routes)
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/admin/events')
    revalidatePath('/admin')
    revalidatePath('/admin/results')

    return { success: true }
  } catch (error) {
    console.error('Error in submitEventResults:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
