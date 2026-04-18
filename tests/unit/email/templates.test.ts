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
