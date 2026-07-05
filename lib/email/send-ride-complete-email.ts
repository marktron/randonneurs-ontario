import { sendEmail, fromEmail, isEmailConfigured } from '@/lib/email/ses'
import { buildRideCompleteEmail } from '@/lib/email/templates'
import { getVpEmail } from '@/lib/email/vp-emails'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/utils'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'

/**
 * Builds and sends the digital-card finish email (or its "still missing
 * your track" reminder variant) for one rider, with the chapter VP as
 * reply-to. Shared by the final check-in flow and the admin reminders.
 */
export async function sendRideCompleteEmail(params: {
  event: EventForSubmissionEmail
  riderName: string
  riderEmail: string
  submissionToken: string
  finishTime: string
  reminder?: boolean
}): Promise<{ sent: boolean; error?: string }> {
  const { event } = params
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'
  const vpEmail = event.chapters?.slug ? getVpEmail(event.chapters.slug) : null

  const { subject, text, html } = buildRideCompleteEmail({
    riderName: params.riderName,
    eventName: event.name,
    eventDate: format(parseLocalDate(event.event_date), 'MMMM d, yyyy'),
    eventDistance: event.distance_km,
    chapterName: event.chapters?.name || 'Randonneurs Ontario',
    submissionUrl: `${baseUrl}/results/submit/${params.submissionToken}`,
    finishTime: params.finishTime,
    reminder: params.reminder,
  })

  if (!isEmailConfigured()) {
    console.warn('AWS SES not configured, skipping ride complete email')
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
