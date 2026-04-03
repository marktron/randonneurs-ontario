import { sendgrid, fromEmail, suppressAdminEmails } from './sendgrid'
import {
  buildRegistrationConfirmationEmail,
  buildCancellationConfirmationEmail,
  type RegistrationEmailData,
  type CancellationEmailData,
} from './templates'
import { getVpEmail } from './vp-emails'
import { logError } from '@/lib/errors'

export interface SendEmailResult {
  success: boolean
  error?: string
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.message.includes('socket disconnected') ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT')
  )
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 1000): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (retries > 0 && isTransientError(error)) {
      await new Promise((r) => setTimeout(r, delayMs))
      return withRetry(fn, retries - 1, delayMs)
    }
    throw error
  }
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
    await withRetry(() =>
      sendgrid.send({
        to: data.registrantEmail,
        from: fromEmail,
        replyTo: suppressAdminEmails ? undefined : vpEmail || undefined,
        cc: suppressAdminEmails ? undefined : vpEmail || undefined,
        subject,
        text,
        html,
        trackingSettings: {
          clickTracking: { enable: false },
        },
      })
    )

    console.log('Registration email sent successfully')
    return { success: true }
  } catch (error) {
    logError(error, {
      operation: 'sendRegistrationConfirmationEmail',
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    }
  }
}

export async function sendCancellationConfirmationEmail(
  data: CancellationEmailData
): Promise<SendEmailResult> {
  if (!process.env.SENDGRID_API_KEY) {
    console.warn('SendGrid API key not configured, skipping email')
    return { success: true }
  }

  const { subject, text, html } = buildCancellationConfirmationEmail(data)
  const vpEmail = getVpEmail(data.chapterSlug)

  try {
    await withRetry(() =>
      sendgrid.send({
        to: data.registrantEmail,
        from: fromEmail,
        replyTo: suppressAdminEmails ? undefined : vpEmail || undefined,
        cc: suppressAdminEmails ? undefined : vpEmail || undefined,
        subject,
        text,
        html,
        trackingSettings: {
          clickTracking: { enable: false },
        },
      })
    )

    console.log('Cancellation email sent successfully')
    return { success: true }
  } catch (error) {
    logError(error, {
      operation: 'sendCancellationConfirmationEmail',
    })
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error',
    }
  }
}
