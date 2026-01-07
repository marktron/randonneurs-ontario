import sgMail from '@sendgrid/mail'

const apiKey = process.env.SENDGRID_API_KEY

if (apiKey) {
  sgMail.setApiKey(apiKey)
}

export const sendgrid = sgMail
export const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@randonneursontario.ca'
