import { sendEmail, fromEmail, isEmailConfigured } from '@/lib/email/ses'
import { buildResultSubmissionRequestEmail } from '@/lib/email/templates'
import { getVpEmail } from '@/lib/email/vp-emails'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/utils'

export interface EventForSubmissionEmail {
  id: string
  name: string
  event_date: string
  distance_km: number
  chapters: { name: string; slug: string } | null
}

/**
 * Builds and sends the result submission email (or its reminder variant) for
 * one rider, with the chapter VP as reply-to. Shared by the event completion
 * flow and the admin "Send Reminders" action.
 */
export async function sendResultSubmissionEmail(params: {
  event: EventForSubmissionEmail
  riderName: string
  riderEmail: string
  submissionToken: string
  reminder?: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const { event } = params
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
  const vpEmail = event.chapters?.slug ? getVpEmail(event.chapters.slug) : null

  const { subject, text, html } = buildResultSubmissionRequestEmail({
    riderName: params.riderName,
    riderEmail: params.riderEmail,
    eventName: event.name,
    eventDate: format(parseLocalDate(event.event_date), 'MMMM d, yyyy'),
    eventDistance: event.distance_km,
    chapterName: event.chapters?.name || 'Randonneurs Ontario',
    submissionUrl: `${baseUrl}/results/submit/${params.submissionToken}`,
    reminder: params.reminder,
  })

  if (!isEmailConfigured()) {
    console.warn('AWS SES not configured, skipping result submission email')
    return { sent: false }
  }

  try {
    await sendEmail({
      to: params.riderEmail,
      from: fromEmail,
      replyTo: vpEmail || undefined,
      subject,
      text,
      html,
    })
    return { sent: true }
  } catch (emailError) {
    return {
      sent: false,
      error: emailError instanceof Error ? emailError.message : 'Unknown error',
    }
  }
}
