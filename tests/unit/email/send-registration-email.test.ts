import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@/lib/email/sendgrid', () => ({
  sendgrid: { send: mockSend },
  fromEmail: 'no-reply@randonneurs.to',
  suppressAdminEmails: false,
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

  it('sends email successfully on first attempt', async () => {
    mockSend.mockResolvedValueOnce({})

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('retries on transient TLS socket disconnection error', async () => {
    mockSend
      .mockRejectedValueOnce(
        new Error('Client network socket disconnected before secure TLS connection was established')
      )
      .mockResolvedValueOnce({})

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('retries on ECONNRESET error', async () => {
    mockSend.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({})

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('retries on ETIMEDOUT error', async () => {
    mockSend.mockRejectedValueOnce(new Error('ETIMEDOUT')).mockResolvedValueOnce({})

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('does not retry on non-transient errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('Unauthorized'))

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(false)
    expect(result.error).toBe('Unauthorized')
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('fails after retry is exhausted', async () => {
    const tlsError = new Error(
      'Client network socket disconnected before secure TLS connection was established'
    )
    mockSend.mockRejectedValueOnce(tlsError).mockRejectedValueOnce(tlsError)

    const result = await sendRegistrationConfirmationEmail(registrationData)

    expect(result.success).toBe(false)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})

describe('sendCancellationConfirmationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retries on transient error', async () => {
    mockSend.mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValueOnce({})

    const result = await sendCancellationConfirmationEmail(cancellationData)

    expect(result.success).toBe(true)
    expect(mockSend).toHaveBeenCalledTimes(2)
  })
})
