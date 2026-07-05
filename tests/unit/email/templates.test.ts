import { describe, it, expect } from 'vitest'
import {
  buildRegistrationConfirmationEmail,
  buildResultSubmissionRequestEmail,
  buildCancellationConfirmationEmail,
  buildRideCompleteEmail,
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

describe('ride complete email', () => {
  const baseRideComplete = {
    riderName: 'Jane Rider',
    eventName: 'Devil Week Classic',
    eventDate: 'July 4, 2026',
    eventDistance: 200,
    chapterName: 'Toronto',
    submissionUrl: 'https://example.com/results/submit/tok-1',
    finishTime: '12:34',
  }

  it('congratulates the rider and shows the recorded elapsed time', () => {
    const email = buildRideCompleteEmail(baseRideComplete)
    expect(email.subject).toContain('Congratulations')
    expect(email.text).toContain('12:34')
    expect(email.html).toContain('12:34')
  })

  it('asks for the GPS track as required and links the submission URL', () => {
    const email = buildRideCompleteEmail(baseRideComplete)
    expect(email.text.toLowerCase()).toContain('strava')
    expect(email.text.toLowerCase()).toContain('required')
    expect(email.html).toContain('https://example.com/results/submit/tok-1')
  })

  it('reminder variant uses a reminder subject, not congratulations', () => {
    const email = buildRideCompleteEmail({ ...baseRideComplete, reminder: true })
    expect(email.subject).toMatch(/^Reminder: Add Your Ride Track/)
    expect(email.subject).not.toContain('Congratulations')
  })

  it('escapes HTML in user-supplied values', () => {
    const email = buildRideCompleteEmail({
      ...baseRideComplete,
      riderName: '<script>alert(1)</script>',
    })
    expect(email.html).not.toContain('<script>alert(1)</script>')
  })
})
