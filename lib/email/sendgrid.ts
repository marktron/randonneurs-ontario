import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY

if (apiKey) {
  sgMail.setApiKey(apiKey)
}

export const sendgrid = sgMail
export const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'no-reply@randonneurs.to'
export const suppressAdminEmails = process.env.SUPPRESS_ADMIN_EMAILS === 'true'

if (suppressAdminEmails) {
  console.warn('SUPPRESS_ADMIN_EMAILS is enabled — emails will only be sent to end users')
}
