import { sendgrid, fromEmail } from './sendgrid'
import { buildRegistrationConfirmationEmail, type RegistrationEmailData } from './templates'
import { getVpEmail } from './vp-emails'

export interface SendEmailResult {
  success: boolean
  error?: string
}

export async function sendRegistrationConfirmationEmail(
  data: RegistrationEmailData
): Promise<SendEmailResult> {
  // Check if SendGrid is configured
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email')
    return { success: true }
  }

  const { subject, text, html } = buildRegistrationConfirmationEmail(data)
  const vpEmail = getVpEmail(data.chapterSlug)

  try {
    await sendgrid.send({
      to: data.registrantEmail,
      from: fromEmail,
      cc: vpEmail || undefined,
      subject,
      text,
      html,
    })

    console.log(`Registration email sent to ${data.registrantEmail}${vpEmail ? ` (cc: ${vpEmail})` : ''}`)
    return { success: true }
  } catch (error) {
    console.error('Failed to send registration email:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    }
  }
}
