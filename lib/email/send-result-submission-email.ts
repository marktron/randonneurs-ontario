import { buildResultSubmissionRequestEmail } from '@/lib/email/templates'
import { resolveSiteBaseUrl, sendEventFlowEmail } from '@/lib/email/send-result-flow-email'
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
  const baseUrl = resolveSiteBaseUrl()

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

  return sendEventFlowEmail({
    event,
    to: params.riderEmail,
    subject,
    text,
    html,
    emailKind: 'result submission',
  })
}
