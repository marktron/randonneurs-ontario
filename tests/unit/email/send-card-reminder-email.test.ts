import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendEmail, mockIsEmailConfigured } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockIsEmailConfigured: vi.fn(() => true),
}))

vi.mock('@/lib/email/ses', () => ({
  sendEmail: mockSendEmail,
  fromEmail: 'no-reply@randonneurs.to',
  isEmailConfigured: mockIsEmailConfigured,
}))

import { sendCardReminderEmail } from '@/lib/email/send-card-reminder-email'
import type { EventForCardReminder } from '@/lib/email/send-card-reminder-email'
import { createTorontoDate } from '@/lib/brmTimes'

/**
 * A fixed Toronto start: Saturday, June 6 2026 at 07:00. Nothing in the
 * sender compares against the real clock, so a literal date is safe here and
 * lets the test assert the rendered Toronto strings exactly.
 */
const RIDER_START = createTorontoDate(2026, 5, 6, 7, 0)

const event: EventForCardReminder = {
  id: 'event-1',
  name: 'Test Brevet',
  event_date: '2026-06-06',
  start_time: '07:00:00',
  distance_km: 200,
  event_type: 'brevet',
  status: 'scheduled',
  start_location: 'Tim Hortons, Bloor St',
  chapters: { name: 'Toronto', slug: 'toronto' },
}

function send(overrides: Partial<Parameters<typeof sendCardReminderEmail>[0]> = {}) {
  return sendCardReminderEmail({
    event,
    riderName: 'Test Rider',
    riderEmail: 'rider@test.com',
    managementToken: 'tok-abc123',
    riderStart: RIDER_START,
    ...overrides,
  })
}

describe('sendCardReminderEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsEmailConfigured.mockReturnValue(true)
  })

  it('sends to the rider with the card subject and the chapter VP as reply-to', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    const result = await send()

    expect(result).toEqual({ sent: true })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        from: 'no-reply@randonneurs.to',
        replyTo: 'vp-toronto@randonneursontario.ca',
        subject: 'Your digital brevet card: Test Brevet 200km',
      })
    )
  })

  it('links to the rider’s card URL in both html and text', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send()

    const { html, text } = mockSendEmail.mock.calls[0][0]
    expect(html).toContain('/card/tok-abc123')
    expect(text).toContain('/card/tok-abc123')
  })

  it('formats the start date and time from riderStart in Toronto time', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send()

    const { text } = mockSendEmail.mock.calls[0][0]
    expect(text).toContain('Saturday, June 6, 2026')
    expect(text).toContain('7:00 AM')
    expect(text).toContain('Tim Hortons, Bloor St')
  })

  it('formats a pre-ride start rather than the event start time', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send({ riderStart: createTorontoDate(2026, 5, 3, 17, 30) })

    const { text } = mockSendEmail.mock.calls[0][0]
    expect(text).toContain('Wednesday, June 3, 2026')
    expect(text).toContain('5:30 PM')
  })

  it('falls back to TBD for the location and the time when the event has neither', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send({
      event: { ...event, start_time: null, start_location: null },
      riderStart: createTorontoDate(2026, 5, 6, 0, 0),
    })

    const { text } = mockSendEmail.mock.calls[0][0]
    expect(text).toContain('starts at TBD on Saturday, June 6, 2026 from TBD')
    expect(text).not.toContain('12:00 AM')
  })

  it('still shows a pre-ride time when the event itself has no start time', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send({
      event: { ...event, start_time: null },
      riderStart: createTorontoDate(2026, 5, 3, 6, 15),
    })

    const { text } = mockSendEmail.mock.calls[0][0]
    expect(text).toContain('6:15 AM')
  })

  it('omits reply-to when the chapter has no VP address', async () => {
    mockSendEmail.mockResolvedValueOnce(undefined)

    await send({ event: { ...event, chapters: null } })

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: undefined, subject: expect.any(String) })
    )
    const { text } = mockSendEmail.mock.calls[0][0]
    expect(text).toContain('Randonneurs Ontario')
  })

  it('reports { sent: false } without sending when SES is not configured', async () => {
    mockIsEmailConfigured.mockReturnValue(false)

    const result = await send()

    expect(result).toEqual({ sent: false })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('reports the SES error message when the send throws', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SES exploded'))

    const result = await send()

    expect(result).toEqual({ sent: false, error: 'SES exploded' })
  })
})
