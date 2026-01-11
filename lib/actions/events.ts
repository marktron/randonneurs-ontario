'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { sendgrid } from '@/lib/email/sendgrid'
import { parseLocalDate, createSlug } from '@/lib/utils'
import { getUrlSlugFromDbSlug } from '@/lib/chapter-config'
import type { ActionResult } from '@/types/actions'

// Helper to revalidate public calendar pages
async function revalidateCalendarPages(chapterId: string, eventType: string) {
  // Get chapter slug
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chapter } = await (getSupabaseAdmin().from('chapters') as any)
    .select('slug')
    .eq('id', chapterId)
    .single()

  if (chapter?.slug) {
    const urlSlug = getUrlSlugFromDbSlug(chapter.slug)
    if (urlSlug) {
      revalidatePath(`/calendar/${urlSlug}`)
    }
  }

  // Also revalidate permanents page if it's a permanent event
  if (eventType === 'permanent') {
    revalidatePath('/calendar/permanents')
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newEvent, error } = await (getSupabaseAdmin().from('events') as any)
      .insert({
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
      })
      .select('id')
      .single()

    if (error) {
      console.error('Error creating event:', error)
      if (error.code === '23505') {
        return { success: false, error: 'An event with this slug already exists' }
      }
      return { success: false, error: 'Failed to create event' }
    }

    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Revalidate public calendar pages
    await revalidateCalendarPages(chapterId, eventType)

    return { success: true, data: { id: newEvent.id } }
  } catch (error) {
    console.error('Error in createEvent:', error)
    return { success: false, error: 'An unexpected error occurred' }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabaseAdmin().from('events') as any)
      .update(updateData)
      .eq('id', eventId)

    if (error) {
      console.error('Error updating event:', error)
      return { success: false, error: 'Failed to update event' }
    }

    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Fetch event to get chapter and type for calendar revalidation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event } = await (getSupabaseAdmin().from('events') as any)
      .select('chapter_id, event_type')
      .eq('id', eventId)
      .single()

    if (event) {
      await revalidateCalendarPages(event.chapter_id, event.event_type)
    }

    return { success: true }
  } catch (error) {
    console.error('Error in updateEvent:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  try {
    await requireAdmin()

    // Fetch the event to check the date and get chapter info for revalidation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error: fetchError } = await (getSupabaseAdmin().from('events') as any)
      .select('id, event_date, chapter_id, event_type')
      .eq('id', eventId)
      .single()

    if (fetchError || !event) {
      return { success: false, error: 'Event not found' }
    }

    // Check if event is in the past
    const today = new Date().toISOString().split('T')[0]
    if (event.event_date < today) {
      return { success: false, error: 'Cannot delete past events' }
    }

    // Delete registrations for this event first
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: regDeleteError } = await (getSupabaseAdmin().from('registrations') as any)
      .delete()
      .eq('event_id', eventId)

    if (regDeleteError) {
      console.error('Error deleting registrations:', regDeleteError)
      return { success: false, error: 'Failed to delete event registrations' }
    }

    // Delete results for this event (shouldn't exist for future events, but just in case)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: resultsDeleteError } = await (getSupabaseAdmin().from('results') as any)
      .delete()
      .eq('event_id', eventId)

    if (resultsDeleteError) {
      console.error('Error deleting results:', resultsDeleteError)
      return { success: false, error: 'Failed to delete event results' }
    }

    // Delete the event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: deleteError } = await (getSupabaseAdmin().from('events') as any)
      .delete()
      .eq('id', eventId)

    if (deleteError) {
      console.error('Error deleting event:', deleteError)
      return { success: false, error: 'Failed to delete event' }
    }

    revalidatePath('/admin/events')
    revalidatePath('/admin')

    // Revalidate public calendar pages
    await revalidateCalendarPages(event.chapter_id, event.event_type)

    return { success: true }
  } catch (error) {
    console.error('Error in deleteEvent:', error)
    return { success: false, error: 'An unexpected error occurred' }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (getSupabaseAdmin().from('results') as any)
        .delete()
        .eq('event_id', eventId)

      if (deleteError) {
        console.error('Error deleting results:', deleteError)
        return { success: false, error: 'Failed to delete results' }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabaseAdmin().from('events') as any)
      .update({ status })
      .eq('id', eventId)

    if (error) {
      console.error('Error updating event status:', error)
      return { success: false, error: 'Failed to update event status' }
    }

    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath('/admin/events')
    revalidatePath('/admin')
    revalidatePath('/admin/results')

    // Fetch event to get chapter and type for calendar revalidation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event } = await (getSupabaseAdmin().from('events') as any)
      .select('chapter_id, event_type')
      .eq('id', eventId)
      .single()

    if (event) {
      await revalidateCalendarPages(event.chapter_id, event.event_type)
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
  chapters: {
    name: string
  } | null
}

export async function submitEventResults(eventId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin()

    // Fetch event details
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: event, error: eventError } = await (getSupabaseAdmin().from('events') as any)
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

    if (event.status === 'submitted') {
      return { success: false, error: 'Results have already been submitted' }
    }

    if (event.status !== 'completed') {
      return { success: false, error: 'Only completed events can have results submitted' }
    }

    // Fetch all results for this event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: results, error: resultsError } = await (getSupabaseAdmin().from('results') as any)
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

    const typedEvent = event as EventForSubmission
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (getSupabaseAdmin().from('events') as any)
      .update({ status: 'submitted' })
      .eq('id', eventId)

    if (updateError) {
      console.error('Error updating event status:', updateError)
      return { success: false, error: 'Email sent but failed to update event status' }
    }

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
