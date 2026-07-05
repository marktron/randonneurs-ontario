import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendEmail, mockSupabaseAdmin, mockSendRideComplete } = vi.hoisted(() => ({
  mockSendEmail: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
  mockSendRideComplete: vi.fn(),
}))

vi.mock('@/lib/email/ses', () => ({
  sendEmail: mockSendEmail,
  fromEmail: 'no-reply@randonneurs.to',
  isEmailConfigured: () => true,
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: mockSupabaseAdmin,
}))

vi.mock('@/lib/email/send-ride-complete-email', () => ({
  sendRideCompleteEmail: mockSendRideComplete,
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
  results,
  checkins = [],
  checkinError = null,
  checkinAttempts,
}: {
  registrations: Array<{
    id: string
    rider_id: string
    riders: { id: string; first_name: string; last_name: string; email: string | null } | null
  }>
  results: Array<{
    rider_id: string
    submission_token: string | null
    status: string | null
    finish_time?: string | null
    gpx_url?: string | null
    gpx_file_path?: string | null
    submitted_at?: string | null
  }>
  checkins?: string[]
  checkinError?: { message: string } | null
  /**
   * When provided, overrides `checkins`/`checkinError`: each entry is the
   * result of one successive call to the control_checkins fetch, letting
   * tests simulate a fetch that fails on the first attempt and succeeds (or
   * fails again) on the retry. The last entry repeats for any extra calls.
   */
  checkinAttempts?: Array<{ data: string[] | null; error: { message: string } | null }>
}) {
  const resultRows = results.map((r) => ({
    finish_time: null,
    gpx_url: null,
    gpx_file_path: null,
    submitted_at: null,
    ...r,
  }))

  let checkinCallCount = 0

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
            eq: vi.fn(() => Promise.resolve({ data: resultRows, error: null })),
          })),
        }
      }
      if (table === 'control_checkins') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => {
              if (checkinAttempts) {
                const attempt =
                  checkinAttempts[Math.min(checkinCallCount, checkinAttempts.length - 1)]
                checkinCallCount++
                return Promise.resolve(
                  attempt.error
                    ? { data: null, error: attempt.error }
                    : {
                        data: (attempt.data || []).map((registration_id) => ({
                          registration_id,
                        })),
                        error: null,
                      }
                )
              }
              return Promise.resolve(
                checkinError
                  ? { data: null, error: checkinError }
                  : {
                      data: checkins.map((registration_id) => ({ registration_id })),
                      error: null,
                    }
              )
            }),
          })),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

const rider = (n: number, email: string | null = `rider${n}@test.com`) => ({
  id: `reg-${n}`,
  rider_id: `rider-${n}`,
  riders: { id: `rider-${n}`, first_name: 'Test', last_name: `Rider${n}`, email },
})

describe('sendResultSubmissionReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendEmail.mockResolvedValue(undefined)
    mockSendRideComplete.mockResolvedValue({ sent: true })
  })

  it('sends a reminder to a registered rider with a pending result', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        results: [{ rider_id: 'rider-1', submission_token: 'token-abc', status: 'pending' }],
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
        results: [{ rider_id: 'rider-2', submission_token: 'token-2', status: 'pending' }],
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
        results: [{ rider_id: 'rider-1', submission_token: 'token-abc', status: 'pending' }],
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
        results: [{ rider_id: 'rider-1', submission_token: null, status: 'pending' }],
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
        results: [{ rider_id: 'rider-1', submission_token: 'token-abc', status: 'pending' }],
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
        results: [
          { rider_id: 'rider-1', submission_token: 'token-1', status: 'pending' },
          { rider_id: 'rider-2', submission_token: 'token-2', status: 'pending' },
        ],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('SES exploded')
  })

  it('sends the track-only reminder to finished riders with check-ins and no track', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        results: [
          {
            rider_id: 'rider-1',
            submission_token: 'token-abc',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
          },
        ],
        checkins: ['reg-1'],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(1)
    expect(result.errors).toEqual([])
    expect(mockSendRideComplete).toHaveBeenCalledTimes(1)
    expect(mockSendRideComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        reminder: true,
        finishTime: '13:07',
        submissionToken: 'token-abc',
      })
    )
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('skips finished riders who already have a strava link or a gpx file', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        results: [
          {
            rider_id: 'rider-1',
            submission_token: 'token-1',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: 'https://strava.com/activities/1',
            gpx_file_path: null,
          },
          {
            rider_id: 'rider-2',
            submission_token: 'token-2',
            status: 'finished',
            finish_time: '14:00:00',
            gpx_url: null,
            gpx_file_path: 'gpx/rider-2.gpx',
          },
        ],
        checkins: ['reg-1', 'reg-2'],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(mockSendRideComplete).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('skips finished riders without any check-ins (paper card riders)', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1)],
        results: [
          {
            rider_id: 'rider-1',
            submission_token: 'token-abc',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
          },
        ],
        checkins: [],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(mockSendRideComplete).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('still sends the plain reminder to pending riders alongside track-only reminders', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        results: [
          { rider_id: 'rider-1', submission_token: 'token-1', status: 'pending' },
          {
            rider_id: 'rider-2',
            submission_token: 'token-2',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
          },
        ],
        checkins: ['reg-2'],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(2)
    expect(result.errors).toEqual([])
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rider1@test.com' }))
    expect(mockSendRideComplete).toHaveBeenCalledTimes(1)
    expect(mockSendRideComplete).toHaveBeenCalledWith(
      expect.objectContaining({ riderEmail: 'rider2@test.com', reminder: true })
    )
  })

  it('never re-emails a rider who has already submitted, finished or not', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        results: [
          {
            rider_id: 'rider-1',
            submission_token: 'token-1',
            status: 'pending',
            submitted_at: '2026-05-11T00:00:00Z',
          },
          {
            rider_id: 'rider-2',
            submission_token: 'token-2',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
            submitted_at: '2026-05-11T00:00:00Z',
          },
        ],
        checkins: ['reg-1', 'reg-2'],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(result.errors).toEqual([])
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendRideComplete).not.toHaveBeenCalled()
  })

  it('sends nothing and records the error when the check-in fetch fails twice in a row', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        results: [
          { rider_id: 'rider-1', submission_token: 'token-1', status: 'pending' },
          {
            rider_id: 'rider-2',
            submission_token: 'token-2',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
          },
        ],
        checkinError: { message: 'connection reset' },
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendRideComplete).not.toHaveBeenCalled()
    expect(result.errors).toEqual(
      expect.arrayContaining([expect.stringContaining('connection reset')])
    )
  })

  it('retries the check-in fetch once and sends normally when the retry succeeds', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [rider(1), rider(2)],
        results: [
          { rider_id: 'rider-1', submission_token: 'token-1', status: 'pending' },
          {
            rider_id: 'rider-2',
            submission_token: 'token-2',
            status: 'finished',
            finish_time: '13:07:00',
            gpx_url: null,
            gpx_file_path: null,
          },
        ],
        checkinAttempts: [
          { data: null, error: { message: 'transient connection reset' } },
          { data: ['reg-2'], error: null },
        ],
      })
    )

    const result = await sendResultSubmissionReminders(testEvent)

    expect(result.errors).toEqual([])
    expect(result.emailsSent).toBe(2)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'rider1@test.com' }))
    expect(mockSendRideComplete).toHaveBeenCalledTimes(1)
    expect(mockSendRideComplete).toHaveBeenCalledWith(
      expect.objectContaining({ riderEmail: 'rider2@test.com', reminder: true })
    )
  })
})
