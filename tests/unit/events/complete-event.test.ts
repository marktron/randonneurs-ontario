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

import { createPendingResultsAndSendEmails } from '@/lib/events/complete-event'

function buildSupabase({
  registrations,
  existingResults = [],
  createdToken = 'token-123',
  onInsert,
}: {
  registrations: Array<{
    id: string
    rider_id: string
    management_token: string | null
    riders: { id: string; first_name: string; last_name: string; email: string | null } | null
  }>
  existingResults?: Array<{ rider_id: string }>
  createdToken?: string
  onInsert?: (row: Record<string, unknown>) => void
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
            eq: vi.fn(() => Promise.resolve({ data: existingResults, error: null })),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            onInsert?.(row)
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { submission_token: createdToken },
                    error: null,
                  })
                ),
              })),
            }
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('createPendingResultsAndSendEmails', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets reply-to to the chapter VP email', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: {
              id: 'rider-1',
              first_name: 'Test',
              last_name: 'Rider',
              email: 'rider@test.com',
            },
          },
        ],
      })
    )

    const result = await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    expect(result.resultsCreated).toBe(1)
    expect(result.emailsSent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        replyTo: 'vp-toronto@randonneursontario.ca',
      })
    )
  })

  it('creates a pending result for a rider with no email but skips sending mail', async () => {
    const inserted: Array<Record<string, unknown>> = []
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-token-abc',
            riders: {
              id: 'rider-1',
              first_name: 'No',
              last_name: 'Email',
              email: null,
            },
          },
        ],
        onInsert: (row) => inserted.push(row),
      })
    )

    const result = await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    expect(result.resultsCreated).toBe(1)
    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(inserted[0]).toMatchObject({
      event_id: 'event-1',
      rider_id: 'rider-1',
      status: 'pending',
      submission_token: 'mgmt-token-abc',
    })
  })

  it('omits reply-to when chapter slug has no VP mapping', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: {
              id: 'rider-1',
              first_name: 'Test',
              last_name: 'Rider',
              email: 'rider@test.com',
            },
          },
        ],
      })
    )

    await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Unknown', slug: 'unknown' },
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rider@test.com',
        replyTo: undefined,
      })
    )
  })
})
