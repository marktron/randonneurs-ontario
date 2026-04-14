import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }))

vi.mock('@/lib/email/ses', () => ({
  sendEmail: mockSendEmail,
  fromEmail: 'no-reply@randonneurs.to',
  isEmailConfigured: () => true,
}))

vi.mock('@/lib/email/templates', () => ({
  buildRegistrationConfirmationEmail: () => ({
    subject: 'Test Subject',
    text: 'Test text',
    html: '<p>Test</p>',
  }),
  buildCancellationConfirmationEmail: () => ({
    subject: 'Cancel Subject',
    text: 'Cancel text',
    html: '<p>Cancel</p>',
  }),
}))

vi.mock('@/lib/email/vp-emails', () => ({
  getVpEmail: () => 'vp@test.com',
}))

vi.mock('@/lib/errors', () => ({
  logError: vi.fn(),
}))

import {
  sendRegistrationConfirmationEmail,
  sendCancellationConfirmationEmail,
} from '@/lib/email/send-registration-email'

const registrationData = {
  registrantName: 'Test Rider',
  registrantEmail: 'rider@test.com',
  eventName: 'Test Brevet',
  eventDate: 'April 18, 2026',
  eventTime: '8:00 AM',
  eventLocation: 'Toronto',
  eventDistance: 200,
  eventType: 'brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
  managementUrl: 'https://example.com/manage',
}

const cancellationData = {
  registrantName: 'Test Rider',
  registrantEmail: 'rider@test.com',
  eventName: 'Test Brevet',
  eventDate: 'April 18, 2026',
  eventDistance: 200,
  eventType: 'brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
  registerUrl: 'https://example.com/register',
}

describe('sendRegistrationConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends email successfully', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        from: 'no-reply@randonneurs.to',
        cc: 'vp@test.com',
        replyTo: 'vp@test.com',
      })
    )
  })

  it('returns error on failure', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SES error'))

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('SES error')
  })
})

describe('sendCancellationConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends email successfully', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    const result = await sendCancellationConfirmationEmail(cancellationData)

    expect(result.success).toBe(true)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        cc: 'vp@test.com',
      })
    )
  })

  it('returns error on failure', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SES error'))

    const result = await sendCancellationConfirmationEmail(cancellationData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('SES error')
  })
})
