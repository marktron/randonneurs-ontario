'use server'

import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { sendgrid } from '@/lib/email/sendgrid'
import { parseLocalDate } from '@/lib/utils'
import type { ActionResult } from '@/types/actions'

export type EventStatus = 'scheduled' | 'completed' | 'cancelled' | 'submitted'

export async function updateEventStatus(
  eventId: string,
  status: EventStatus
): Promise<ActionResult> {
  try {
    await requireAdmin()

    // If cancelling, delete all results for this event first
    if (status === 'cancelled') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: deleteError } = await (supabaseAdmin.from('results') as any)
        .delete()
        .eq('event_id', eventId)

      if (deleteError) {
        console.error('Error deleting results:', deleteError)
        return { success: false, error: 'Failed to delete results' }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin.from('events') as any)
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
    const { data: event, error: eventError } = await (supabaseAdmin.from('events') as any)
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
    const { data: results, error: resultsError } = await (supabaseAdmin.from('results') as any)
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
          to: 'vp-admin@randonneursontario.ca',
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
    const { error: updateError } = await (supabaseAdmin.from('events') as any)
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
