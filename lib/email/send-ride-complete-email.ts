import { buildRideCompleteEmail } from '@/lib/email/templates'
import { resolveSiteBaseUrl, sendEventFlowEmail } from '@/lib/email/send-result-flow-email'
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
  const baseUrl = resolveSiteBaseUrl()

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

  return sendEventFlowEmail({
    event,
    to: params.riderEmail,
    subject,
    text,
    html,
    emailKind: 'ride complete',
  })
}
