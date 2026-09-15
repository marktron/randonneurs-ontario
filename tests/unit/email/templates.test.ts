import { describe, it, expect } from 'vitest'
import {
  buildRegistrationConfirmationEmail,
  buildResultSubmissionRequestEmail,
  buildCancellationConfirmationEmail,
  buildRideCompleteEmail,
  buildCardReminderEmail,
  type RegistrationEmailData,
  type ResultSubmissionEmailData,
  type CancellationEmailData,
  type CardReminderEmailData,
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

  it('permanent registration subject is prefixed with Permanent', () => {
    const email = buildRegistrationConfirmationEmail({
      ...baseRegistration,
      eventName: 'Gentle Start 120',
      eventType: 'Permanent',
    })
    expect(email.subject).toBe('Permanent Registration Received: Gentle Start 120')
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

  it('links to the digital control cards help page from the card section', () => {
    const email = buildRegistrationConfirmationEmail({
      ...baseRegistration,
      digitalCardUrl: cardUrl,
    })
    expect(email.text).toContain('/digital-control-cards')
    expect(email.html).toMatch(/href="[^"]*\/digital-control-cards"[^>]*>Learn more</)
  })

  it('omits the card section when no url is provided', () => {
    const email = buildRegistrationConfirmationEmail(baseRegistration)
    expect(email.text).not.toContain('Digital brevet card')
    expect(email.html).not.toContain('Open your brevet card')
    expect(email.html).not.toContain('/digital-control-cards')
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

  it('omits the recorded time row when finishTime is empty', () => {
    const email = buildRideCompleteEmail({ ...baseRideComplete, finishTime: '' })
    expect(email.text).not.toContain('Recorded time')
    expect(email.html).not.toContain('Recorded time')
  })
})

describe('card reminder email', () => {
  const baseCardReminder: CardReminderEmailData = {
    riderName: 'Jane Rider',
    eventName: 'Gentle Start',
    eventDistance: 120,
    eventDate: 'Saturday, June 6, 2026',
    eventTime: '7:00 AM',
    eventLocation: 'Toronto',
    chapterName: 'Toronto',
    cardUrl: 'https://example.com/card/token-123',
  }

  it('subject uses the formatted ride name', () => {
    const email = buildCardReminderEmail(baseCardReminder)
    expect(email.subject).toBe('Your digital brevet card: Gentle Start 120km')
  })

  it('text and html both contain the card url', () => {
    const email = buildCardReminderEmail(baseCardReminder)
    expect(email.text).toContain(baseCardReminder.cardUrl)
    expect(email.html).toContain(baseCardReminder.cardUrl)
  })

  it('html contains the open-card button and the learn-more link', () => {
    const email = buildCardReminderEmail(baseCardReminder)
    expect(email.html).toContain('Open your brevet card')
    expect(email.html).toMatch(/href="[^"]*\/digital-control-cards"[^>]*>Learn more</)
  })

  it('escapes a rider name containing a script tag in html but leaves it raw in text', () => {
    const email = buildCardReminderEmail({
      ...baseCardReminder,
      riderName: '<script>alert(1)</script>',
    })
    expect(email.html).not.toContain('<script>alert(1)</script>')
    expect(email.text).toContain('<script>alert(1)</script>')
  })

  it('names the start time, date and location when all three are known', () => {
    const email = buildCardReminderEmail(baseCardReminder)
    expect(email.text).toContain(
      'Gentle Start 120km starts at 7:00 AM on Saturday, June 6, 2026 from Toronto.'
    )
    expect(email.html).toContain('starts at 7:00 AM on Saturday, June 6, 2026 from Toronto.')
  })

  it('drops the time clause rather than saying "at TBD"', () => {
    const email = buildCardReminderEmail({ ...baseCardReminder, eventTime: 'TBD' })

    expect(email.text).toContain('starts on Saturday, June 6, 2026 from Toronto.')
    expect(email.text).not.toContain('at TBD')
    expect(email.html).toContain('starts on Saturday, June 6, 2026 from Toronto.')
    expect(email.html).not.toContain('at TBD')
  })

  it('drops the location clause rather than saying "from TBD"', () => {
    const email = buildCardReminderEmail({
      ...baseCardReminder,
      eventTime: 'TBD',
      eventLocation: 'TBD',
    })

    expect(email.text).toContain('starts on Saturday, June 6, 2026.')
    expect(email.text).not.toContain('TBD')
    expect(email.html).toContain('starts on Saturday, June 6, 2026.')
    expect(email.html).not.toContain('TBD')
  })

  it('keeps the time when only the location is unknown', () => {
    const email = buildCardReminderEmail({ ...baseCardReminder, eventLocation: 'TBD' })

    expect(email.text).toContain('starts at 7:00 AM on Saturday, June 6, 2026.')
    expect(email.text).not.toContain('from TBD')
  })

  it('signs off the way the other chapter emails do', () => {
    const email = buildCardReminderEmail(baseCardReminder)

    expect(email.text).toContain(
      'The Toronto Chapter VP is included in this email. Just hit reply if you have any questions.'
    )
    expect(email.html).toContain(
      'The Toronto Chapter VP is included in this email. Just hit reply if you have any questions.'
    )
    expect(email.text).not.toContain('Toronto Chapter\n')
  })

  it('does not promise a reply when the event has no chapter', () => {
    // With no chapter there is no VP on reply-to, so "hit reply" would send the
    // rider to an unmonitored mailbox.
    const email = buildCardReminderEmail({ ...baseCardReminder, chapterName: null })

    expect(email.text).toContain('Questions? Contact your ride organizer.')
    expect(email.html).toContain('Questions? Contact your ride organizer.')
    expect(email.text).not.toContain('hit reply')
    expect(email.text).not.toContain('Chapter')
    expect(email.html).not.toContain('Chapter')
    // The Randonneurs Ontario footer still closes the email.
    expect(email.text).toContain('Randonneurs Ontario')
    expect(email.html).toContain('Randonneurs Ontario')
  })
})
