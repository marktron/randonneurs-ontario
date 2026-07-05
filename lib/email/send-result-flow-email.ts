import { sendEmail, fromEmail, isEmailConfigured } from '@/lib/email/ses'
import { getVpEmail } from '@/lib/email/vp-emails'
import type { EventForSubmissionEmail } from '@/lib/email/send-result-submission-email'

/** Fallback base URL when `NEXT_PUBLIC_SITE_URL` isn't set. */
const DEFAULT_SITE_URL = 'https://randonneursontario.ca'

/** Base URL for submission links, e.g. `${resolveSiteBaseUrl()}/results/submit/{token}`. */
export function resolveSiteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL
}

/**
 * Shared send scaffolding for the result-flow emails
 * (`sendResultSubmissionEmail`, `sendRideCompleteEmail`) and their reminder
 * variants: resolves the chapter VP as reply-to, guards on
 * `isEmailConfigured()`, and wraps the actual send in a try/catch mapped to
 * `{ sent, error }`. Callers build their own subject/text/html from the
 * event and pass them in.
 */
export async function sendEventFlowEmail(params: {
  event: EventForSubmissionEmail
  to: string
  subject: string
  text: string
  html: string
  /** Used in the console warning when SES isn't configured, e.g. "result submission". */
  emailKind: string
}): Promise<{ sent: boolean; error?: string }> {
  const vpEmail = params.event.chapters?.slug ? getVpEmail(params.event.chapters.slug) : null

  if (!isEmailConfigured()) {
    console.warn(`AWS SES not configured, skipping ${params.emailKind} email`)
    return { sent: false }
  }

  try {
    await sendEmail({
      to: params.to,
      from: fromEmail,
      replyTo: vpEmail || undefined,
      subject: params.subject,
      text: params.text,
      html: params.html,
    })
    return { sent: true }
  } catch (emailError) {
    return {
      sent: false,
      error: emailError instanceof Error ? emailError.message : 'Unknown error',
    }
  }
}
