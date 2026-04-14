import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'
import MailComposer from 'nodemailer/lib/mail-composer'

const client = new SESv2Client({
  region: process.env.AWS_REGION || 'us-east-1',
})

export const fromEmail = process.env.SES_FROM_EMAIL || 'no-reply@randonneurs.to'
export const suppressAdminEmails = process.env.SUPPRESS_ADMIN_EMAILS === 'true'

if (suppressAdminEmails) {
  console.warn('SUPPRESS_ADMIN_EMAILS is enabled — emails will only be sent to end users')
}

export function isEmailConfigured(): boolean {
  return !!process.env.AWS_ACCESS_KEY_ID
}

interface EmailAttachment {
  content: string // base64 encoded
  filename: string
  type: string
  disposition?: string
}

interface SendEmailOptions {
  to: string
  from: string
  cc?: string | string[]
  replyTo?: string
  subject: string
  text: string
  html?: string
  attachments?: EmailAttachment[]
}

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const msg = error.message
  return (
    msg.includes('socket disconnected') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ThrottlingException') ||
    msg.includes('TooManyRequestsException')
  )
}

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1000

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  const ccList = options.cc ? (Array.isArray(options.cc) ? options.cc : [options.cc]) : undefined

  const mail = new MailComposer({
    from: options.from,
    to: options.to,
    cc: ccList,
    replyTo: options.replyTo,
    subject: options.subject,
    text: options.text,
    html: options.html,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.type,
    })),
  })

  const message = await mail.compile().build()
  const command = new SendEmailCommand({
    ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
    Content: {
      Raw: { Data: message },
    },
  })

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await client.send(command)
      return
    } catch (error) {
      lastError = error
      if (attempt < MAX_RETRIES && isTransientError(error)) {
        const delay = RETRY_DELAY_MS * 2 ** attempt
        console.warn(`Transient email error, retrying in ${delay}ms (attempt ${attempt + 1})`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastError
}
