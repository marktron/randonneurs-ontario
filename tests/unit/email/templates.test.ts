import { describe, it, expect } from 'vitest'
import {
  buildRegistrationConfirmationEmail,
  buildResultSubmissionRequestEmail,
  buildCancellationConfirmationEmail,
  type RegistrationEmailData,
  type ResultSubmissionEmailData,
  type CancellationEmailData,
} from '@/lib/email/templates'

const baseRegistration: RegistrationEmailData = {
  registrantName: 'Jane Rider',
  registrantEmail: 'jane@test.com',
  eventName: 'Gentle Start',
  eventDate: 'April 18, 2026',
  eventTime: '8:00 AM',
  eventLocation: 'Toronto',
  eventDistance: 120,
  eventType: 'brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
}

const baseResult: ResultSubmissionEmailData = {
  riderName: 'Jane Rider',
  riderEmail: 'jane@test.com',
  eventName: 'Gentle Start',
  eventDate: 'April 18, 2026',
  eventDistance: 120,
  chapterName: 'Toronto',
  submissionUrl: 'https://example.com/submit',
}

const baseCancellation: CancellationEmailData = {
  registrantName: 'Jane Rider',
  registrantEmail: 'jane@test.com',
  eventName: 'Gentle Start',
  eventDate: 'April 18, 2026',
  eventDistance: 120,
  eventType: 'brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
  registerUrl: 'https://example.com/register',
}

describe('email templates render ride name via formatRideName', () => {
  it('registration subject, text, and html use the formatted ride name', () => {
    const email = buildRegistrationConfirmationEmail({
      ...baseRegistration,
      eventName: 'Gentle Start 120',
    })
    expect(email.subject).toBe('Registration Received: Gentle Start 120')
    expect(email.text).toContain('Gentle Start 120')
    expect(email.html).toContain('Gentle Start 120')
    expect(email.text).not.toMatch(/120\s+120/)
    expect(email.html).not.toMatch(/120\s+120/)
  })

  it('result submission subject uses the formatted ride name', () => {
    const email = buildResultSubmissionRequestEmail({
      ...baseResult,
      eventName: 'Gentle Start 120',
    })
    expect(email.subject).toBe('Submit Your Results: Gentle Start 120')
  })

  it('cancellation subject uses the formatted ride name', () => {
    const email = buildCancellationConfirmationEmail({
      ...baseCancellation,
      eventName: 'Gentle Start 120',
    })
    expect(email.subject).toBe('Registration Cancelled: Gentle Start 120')
  })
})

describe('result submission reminder variant', () => {
  it('prefixes the subject with Reminder:', () => {
    const email = buildResultSubmissionRequestEmail({ ...baseResult, reminder: true })
    expect(email.subject).toBe('Reminder: Submit Your Results: Gentle Start 120km')
  })

  it('acknowledges the missing results in text and html', () => {
    const email = buildResultSubmissionRequestEmail({ ...baseResult, reminder: true })
    expect(email.text).toContain("haven't received your results yet")
    expect(email.html).toContain("haven't received your results yet")
  })

  it('does not change the default email', () => {
    const email = buildResultSubmissionRequestEmail(baseResult)
    expect(email.subject).toBe('Submit Your Results: Gentle Start 120km')
    expect(email.text).not.toContain("haven't received your results yet")
    expect(email.html).not.toContain("haven't received your results yet")
  })
})

describe('registration confirmation digital brevet card link', () => {
  const cardUrl = 'https://example.com/card/token-123'

  it('includes the card link in text and html when provided', () => {
    const email = buildRegistrationConfirmationEmail({
      ...baseRegistration,
      digitalCardUrl: cardUrl,
    })
    expect(email.text).toContain(cardUrl)
    expect(email.html).toContain(cardUrl)
    expect(email.html).toContain('Open your brevet card')
  })

  it('omits the card section when no url is provided', () => {
    const email = buildRegistrationConfirmationEmail(baseRegistration)
    expect(email.text).not.toContain('Digital brevet card')
    expect(email.html).not.toContain('Open your brevet card')
  })
})
