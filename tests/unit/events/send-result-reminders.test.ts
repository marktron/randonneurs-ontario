import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendEmail, mockSupabaseAdmin } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
}))

vi.mock('@/lib/email/ses', () => ({
  sendEmail: mockSendEmail,
  fromEmail: 'no-reply@randonneurs.to',
  isEmailConfigured: () => true,
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: mockSupabaseAdmin,
}))

import { sendResultSubmissionReminders } from '@/lib/events/send-result-reminders'

const testEvent = {
  id: 'event-1',
  name: 'Test Brevet',
  event_date: '2026-05-10',
  distance_km: 200,
  chapters: { name: 'Toronto', slug: 'toronto' },
}

function buildSupabase({
  registrations,
  pendingResults,
}: {
  registrations: Array<{
    rider_id: string
    riders: { id: string; first_name: string; last_name: string; email: string | null } | null
  }>
  pendingResults: Array<{
    rider_id: string
    submission_token: string | null
  }>
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'registrations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: registrations, error: null })),
            })),
          })),
        }
      }
      if (table === 'results') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => Promise.resolve({ data: pendingResults, error: null })),
            })),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

const rider = (n: number, email: string | null = `rider${n}@test.com`) => ({
  rider_id: `rider-${n}`,
  riders: { id: `rider-${n}`, first_name: 'Test', last_name: `Rider${n}`, email },
})

describe('sendResultSubmissionReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue(undefined)
  })

  it('sends a reminder to a registered rider with a pending result', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        pendingResults: [{ rider_id: 'rider-1', submission_token: 'token-abc' }],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(1)
    expect(result.errors).toEqual([])
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider1@test.com',
        replyTo: 'vp-toronto@randonneursontario.ca',
        subject: 'Reminder: Submit Your Results: Test Brevet 200km',
      })
    )
    const call = mockSendEmail.mock.calls[0][0]
    expect(call.text).toContain('/results/submit/token-abc')
    expect(call.html).toContain('/results/submit/token-abc')
  })

  it('does not email riders whose results are no longer pending', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        pendingResults: [{ rider_id: 'rider-2', submission_token: 'token-2' }],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rider2@test.com' }))
  })

  it('skips riders without an email address', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1, null)],
        pendingResults: [{ rider_id: 'rider-1', submission_token: 'token-abc' }],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(result.errors).toEqual([])
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('skips pending results without a submission token', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        pendingResults: [{ rider_id: 'rider-1', submission_token: null }],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('omits reply-to when chapter slug has no VP mapping', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        pendingResults: [{ rider_id: 'rider-1', submission_token: 'token-abc' }],
      })
    )

    await sendResultSubmissionReminders({
      ...testEvent,
      chapters: { name: 'Unknown', slug: 'unknown' },
    })

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'rider1@test.com', replyTo: undefined })
    )
  })

  it('accumulates send failures without aborting the batch', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('SES exploded')).mockResolvedValueOnce(undefined)
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        pendingResults: [
          { rider_id: 'rider-1', submission_token: 'token-1' },
          { rider_id: 'rider-2', submission_token: 'token-2' },
        ],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('SES exploded')
  })
})
