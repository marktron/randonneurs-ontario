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

/** One `.update(...)` call's recorded payload and accumulated filter args. */
interface UpdateCall {
  row: Record<string, unknown>
  eqArgs: unknown[][]
  isArgs: unknown[][]
  isClaim: boolean
}

function buildSupabase({
  registrations,
  existingResults = [],
  createdToken = 'token-123',
  backfilledToken,
  claimSucceeds = true,
  onInsert,
  onUpdate,
  onUpdateCall,
}: {
  registrations: Array<{
    id: string
    rider_id: string
    management_token: string | null
    riders: { id: string; first_name: string; last_name: string; email: string | null } | null
  }>
  existingResults?: Array<{
    rider_id: string
    status?: string
    submitted_at?: string | null
    submission_token?: string | null
  }>
  createdToken?: string
  /** Value the backfill update's `.select().maybeSingle()` reports back. */
  backfilledToken?: string | null
  /** Whether the submission_email_sent_at claim update reports a matched row. */
  claimSucceeds?: boolean
  onInsert?: (row: Record<string, unknown>) => void
  onUpdate?: (row: Record<string, unknown>) => void
  /** Fires with the full filter chain each time `.update()` on `results` resolves. */
  onUpdateCall?: (call: UpdateCall) => void
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
          // Both the token-backfill update and the submission_email_sent_at
          // claim update flow through here — they use different filter-chain
          // lengths and payload shapes, so the chain accumulates eq/is args
          // generically and the terminal maybeSingle() branches on the
          // payload to decide which response to report.
          update: vi.fn((row: Record<string, unknown>) => {
            onUpdate?.(row)
            const isClaim = 'submission_email_sent_at' in row
            const eqArgs: unknown[][] = []
            const isArgs: unknown[][] = []
            const chain: Record<string, unknown> = {
              eq: vi.fn((...args: unknown[]) => {
                eqArgs.push(args)
                return chain
              }),
              is: vi.fn((...args: unknown[]) => {
                isArgs.push(args)
                return chain
              }),
              select: vi.fn(() => chain),
              maybeSingle: vi.fn(() => {
                onUpdateCall?.({ row, eqArgs, isArgs, isClaim })
                if (isClaim) {
                  return Promise.resolve({
                    data: claimSucceeds ? { id: 'result-id' } : null,
                    error: null,
                  })
                }
                return Promise.resolve({
                  data: {
                    submission_token: backfilledToken ?? (row.submission_token as string),
                  },
                  error: null,
                })
              }),
            }
            return chain
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

  it('does not email a rider whose result was pre-filled by the digital card finish flow', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: {
              id: 'rider-1',
              first_name: 'Card',
              last_name: 'Finisher',
              email: 'finisher@test.com',
            },
          },
        ],
        existingResults: [
          {
            rider_id: 'rider-1',
            status: 'finished',
            submitted_at: null,
            submission_token: 'tok-existing',
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

    expect(result.resultsCreated).toBe(0)
    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('still emails riders without results when a card finisher is also registered', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: null,
            riders: {
              id: 'rider-1',
              first_name: 'Card',
              last_name: 'Finisher',
              email: 'finisher@test.com',
            },
          },
          {
            id: 'reg-2',
            rider_id: 'rider-2',
            management_token: null,
            riders: {
              id: 'rider-2',
              first_name: 'Regular',
              last_name: 'Rider',
              email: 'regular@test.com',
            },
          },
        ],
        existingResults: [
          {
            rider_id: 'rider-1',
            status: 'finished',
            submitted_at: null,
            submission_token: 'tok-existing',
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
        to: 'regular@test.com',
        replyTo: 'vp-toronto@randonneursontario.ca',
      })
    )
  })

  it('emails a rider whose existing pending row already carries a submission token', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-1',
            riders: {
              id: 'rider-1',
              first_name: 'Undo',
              last_name: 'Rider',
              email: 'undo@test.com',
            },
          },
        ],
        existingResults: [
          {
            rider_id: 'rider-1',
            status: 'pending',
            submitted_at: null,
            submission_token: 'tok-existing',
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

    expect(result.resultsCreated).toBe(0)
    expect(result.emailsSent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'undo@test.com',
        html: expect.stringContaining('tok-existing'),
      })
    )
  })

  it('backfills a NULL submission token on an existing pending row before emailing', async () => {
    const updated: Array<Record<string, unknown>> = []
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-backfill-abc',
            riders: {
              id: 'rider-1',
              first_name: 'Undo',
              last_name: 'Rider',
              email: 'undo@test.com',
            },
          },
        ],
        existingResults: [
          { rider_id: 'rider-1', status: 'pending', submitted_at: null, submission_token: null },
        ],
        onUpdate: (row) => updated.push(row),
      })
    )

    const result = await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    expect(result.resultsCreated).toBe(0)
    expect(result.emailsSent).toBe(1)
    expect(updated[0]).toMatchObject({ submission_token: 'mgmt-backfill-abc' })
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'undo@test.com',
        html: expect.stringContaining('mgmt-backfill-abc'),
      })
    )
  })

  it('skips an existing pending row that already has submitted_at set', async () => {
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-1',
            riders: {
              id: 'rider-1',
              first_name: 'Submitted',
              last_name: 'Rider',
              email: 'submitted@test.com',
            },
          },
        ],
        existingResults: [
          {
            rider_id: 'rider-1',
            status: 'pending',
            submitted_at: '2026-05-11T00:00:00Z',
            submission_token: 'tok-existing',
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

    expect(result.resultsCreated).toBe(0)
    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('skips an existing pending row whose submission email claim is already taken', async () => {
    // Simulates a race/retry: another concurrent run (or a prior call) already
    // stamped submission_email_sent_at, so this run's claim update matches
    // zero rows even though the row is still status pending/submitted_at NULL.
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-1',
            riders: {
              id: 'rider-1',
              first_name: 'Already',
              last_name: 'Claimed',
              email: 'claimed@test.com',
            },
          },
        ],
        existingResults: [
          {
            rider_id: 'rider-1',
            status: 'pending',
            submitted_at: null,
            submission_token: 'tok-existing',
          },
        ],
        claimSucceeds: false,
      })
    )

    const result = await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    expect(result.resultsCreated).toBe(0)
    expect(result.emailsSent).toBe(0)
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('backfills the submission token with filters that exclude a concurrently finalized row', async () => {
    const updateCalls: UpdateCall[] = []
    mockSupabaseAdmin.mockReturnValue(
      buildSupabase({
        registrations: [
          {
            id: 'reg-1',
            rider_id: 'rider-1',
            management_token: 'mgmt-backfill-xyz',
            riders: {
              id: 'rider-1',
              first_name: 'Undo',
              last_name: 'Rider',
              email: 'undo@test.com',
            },
          },
        ],
        existingResults: [
          { rider_id: 'rider-1', status: 'pending', submitted_at: null, submission_token: null },
        ],
        onUpdateCall: (call) => updateCalls.push(call),
      })
    )

    await createPendingResultsAndSendEmails({
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    })

    const backfillCall = updateCalls.find((call) => !call.isClaim)
    expect(backfillCall).toBeDefined()
    expect(backfillCall!.eqArgs).toContainEqual(['status', 'pending'])
    expect(backfillCall!.isArgs).toContainEqual(['submitted_at', null])
  })
})

/** A single row of the in-memory `results` fake used by the idempotency tests below. */
interface FakeResultRow {
  id: string
  event_id: string
  rider_id: string
  status: string | null
  submitted_at: string | null
  submission_token: string | null
  submission_email_sent_at: string | null
}

interface FakeRegistration {
  id: string
  rider_id: string
  management_token: string | null
  riders: { id: string; first_name: string; last_name: string; email: string | null } | null
}

/**
 * A minimal in-memory `results` table shared across repeated calls to
 * `createPendingResultsAndSendEmails` against the SAME supabase stub, so a
 * second call sees the mutations (inserts, token backfills, email claims)
 * the first call made. This is what makes the double-run idempotency test
 * meaningful: a fixed-response mock can't distinguish "already claimed" from
 * "never claimed" across calls.
 */
function buildStatefulSupabase(registrations: FakeRegistration[], results: FakeResultRow[]) {
  let nextId = 1

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
            eq: vi.fn((_col: string, eventId: string) =>
              Promise.resolve({
                data: results.filter((r) => r.event_id === eventId),
                error: null,
              })
            ),
          })),
          insert: vi.fn((row: Record<string, unknown>) => {
            const newRow: FakeResultRow = {
              id: `result-${nextId++}`,
              event_id: row.event_id as string,
              rider_id: row.rider_id as string,
              status: (row.status as string) ?? 'pending',
              submitted_at: null,
              submission_token: (row.submission_token as string) ?? null,
              submission_email_sent_at: null,
            }
            results.push(newRow)
            return {
              select: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: { submission_token: newRow.submission_token },
                    error: null,
                  })
                ),
              })),
            }
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            const filters: Array<(r: FakeResultRow) => boolean> = []
            const chain: Record<string, unknown> = {
              eq: vi.fn((col: keyof FakeResultRow, val: unknown) => {
                filters.push((r) => r[col] === val)
                return chain
              }),
              is: vi.fn((col: keyof FakeResultRow, val: unknown) => {
                filters.push((r) => r[col] === val)
                return chain
              }),
              select: vi.fn(() => chain),
              maybeSingle: vi.fn(() => {
                const row = results.find((r) => filters.every((predicate) => predicate(r)))
                if (!row) return Promise.resolve({ data: null, error: null })
                Object.assign(row, patch)
                return Promise.resolve({ data: { ...row }, error: null })
              }),
            }
            return chain
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }
}

describe('createPendingResultsAndSendEmails (repeated-call idempotency)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends nothing on a second call for a rider already emailed by the first', async () => {
    const registrations: FakeRegistration[] = [
      {
        id: 'reg-1',
        rider_id: 'rider-1',
        management_token: 'mgmt-1',
        riders: {
          id: 'rider-1',
          first_name: 'Repeat',
          last_name: 'Rider',
          email: 'repeat@test.com',
        },
      },
    ]
    const results: FakeResultRow[] = []
    mockSupabaseAdmin.mockReturnValue(buildStatefulSupabase(registrations, results))

    const event = {
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    }

    const first = await createPendingResultsAndSendEmails(event)
    expect(first.resultsCreated).toBe(1)
    expect(first.emailsSent).toBe(1)

    const second = await createPendingResultsAndSendEmails(event)

    expect(second.resultsCreated).toBe(0)
    expect(second.emailsSent).toBe(0)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
  })

  it('on a mixed second call, emails only the newly registered rider', async () => {
    const registrations: FakeRegistration[] = [
      {
        id: 'reg-1',
        rider_id: 'rider-1',
        management_token: 'mgmt-1',
        riders: {
          id: 'rider-1',
          first_name: 'Already',
          last_name: 'Registered',
          email: 'already@test.com',
        },
      },
    ]
    const results: FakeResultRow[] = []
    mockSupabaseAdmin.mockReturnValue(buildStatefulSupabase(registrations, results))

    const event = {
      id: 'event-1',
      name: 'Test Brevet',
      event_date: '2026-05-10',
      distance_km: 200,
      chapters: { name: 'Toronto', slug: 'toronto' },
    }

    await createPendingResultsAndSendEmails(event)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)

    // A new rider registers before the event is (re-)completed.
    registrations.push({
      id: 'reg-2',
      rider_id: 'rider-2',
      management_token: 'mgmt-2',
      riders: {
        id: 'rider-2',
        first_name: 'Newly',
        last_name: 'Registered',
        email: 'newly@test.com',
      },
    })

    const second = await createPendingResultsAndSendEmails(event)

    expect(second.resultsCreated).toBe(1)
    expect(second.emailsSent).toBe(1)
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'newly@test.com' })
    )
  })
})
