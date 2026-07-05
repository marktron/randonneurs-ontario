import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockSendRideCompleteEmail, mockSupabaseAdmin, mockLogError } = vi.hoisted(() => ({
  mockSendRideCompleteEmail: vi.fn(),
  mockSupabaseAdmin: vi.fn(),
  mockLogError: vi.fn(),
}))

vi.mock('@/lib/email/send-ride-complete-email', () => ({
  sendRideCompleteEmail: mockSendRideCompleteEmail,
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: mockSupabaseAdmin,
}))

vi.mock('@/lib/errors', () => ({
  logError: mockLogError,
}))

import {
  handleFinishIfFinalControl,
  revertFinishIfFinalControl,
  type FinishCheckinParams,
} from '@/lib/events/finish-result'

/** One `.from(table)` invocation, with the chain of ops/args it recorded. */
interface FromCall {
  table: string
  ops: string[]
  eqArgs: unknown[][]
  isArgs: unknown[][]
  notArgs: unknown[][]
  payload?: Record<string, unknown>
}

interface MockState {
  /** `results` insert(...) — awaited directly. */
  insertResponse?: { error: unknown }
  /** `results` update(...)...not(...) — the revert update, awaited directly. */
  updateResponse?: { error: unknown }
  /**
   * `results` select('submission_token, submitted_at, status').eq().eq().maybeSingle()
   * — the 23505 path's inspection of the existing row.
   */
  existingRowResponse?: { data: unknown; error: unknown }
  /**
   * `results` update(pre-fill payload).eq().eq().is().eq().select('id').maybeSingle()
   * — the 23505 path's guarded pre-fill update.
   */
  prefillUpdateResponse?: { data: unknown; error: unknown }
  /** `results` update({finish_email_sent_at}).eq().eq().is().is().select('id').maybeSingle() */
  claimResponse?: { data: unknown; error: unknown }
}

/**
 * Builds a chainable Supabase stub. Every `.from(table)` call gets its own
 * `FromCall` record (pushed to `calls`) so assertions can inspect the exact
 * filter chain and payload used, not just whether a mock fired.
 *
 * Neither `handleFinishIfFinalControl` nor `revertFinishIfFinalControl`
 * queries `event_controls` any more — "is this the final control" is
 * decided by the caller and passed in as `isFinalControl` — so this stub
 * only ever sees `results` table traffic.
 */
function setupSupabase(state: MockState): FromCall[] {
  const calls: FromCall[] = []

  const fromFn = vi.fn((table: string) => {
    const call: FromCall = { table, ops: [], eqArgs: [], isArgs: [], notArgs: [] }
    calls.push(call)

    const builder: Record<string, unknown> = {
      select: vi.fn(() => {
        call.ops.push('select')
        return builder
      }),
      eq: vi.fn((...args: unknown[]) => {
        call.ops.push('eq')
        call.eqArgs.push(args)
        return builder
      }),
      is: vi.fn((...args: unknown[]) => {
        call.ops.push('is')
        call.isArgs.push(args)
        return builder
      }),
      not: vi.fn((...args: unknown[]) => {
        call.ops.push('not')
        call.notArgs.push(args)
        return builder
      }),
      insert: vi.fn((payload: Record<string, unknown>) => {
        call.ops.push('insert')
        call.payload = payload
        return builder
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        call.ops.push('update')
        call.payload = payload
        return builder
      }),
      maybeSingle: vi.fn(() => {
        call.ops.push('maybeSingle')
        // results table has three distinct maybeSingle terminals:
        if (!call.ops.includes('update') && !call.ops.includes('insert')) {
          // the 23505 path's existing-row inspection select
          return Promise.resolve(state.existingRowResponse ?? { data: null, error: null })
        }
        if (call.payload && 'finish_email_sent_at' in call.payload) {
          // the single-send claim update
          return Promise.resolve(state.claimResponse ?? { data: null, error: null })
        }
        // the 23505 path's guarded pre-fill update
        return Promise.resolve(state.prefillUpdateResponse ?? { data: null, error: null })
      }),
      // Supabase query builders are thenables: awaiting the builder directly
      // (no .maybeSingle() terminal) runs the insert/update as-is.
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
        const response = call.ops.includes('insert')
          ? (state.insertResponse ?? { error: null })
          : (state.updateResponse ?? { error: null })
        return Promise.resolve(response).then(resolve, reject)
      },
    }
    return builder
  })

  mockSupabaseAdmin.mockReturnValue({ from: fromFn })
  return calls
}

function resultsCalls(calls: FromCall[]): FromCall[] {
  return calls.filter((c) => c.table === 'results')
}

/** The bare `insert(...)` call (pre-fill attempt). */
function insertCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find((c) => c.ops.includes('insert'))
}

/** The 23505 path's existing-row inspection — a select with no update/insert. */
function existingSelectCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find(
    (c) => c.ops.includes('select') && !c.ops.includes('update') && !c.ops.includes('insert')
  )
}

/** The guarded pre-fill update after a 23505 — carries the `status` payload. */
function prefillUpdateCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find(
    (c) => c.ops.includes('update') && c.payload != null && 'status' in c.payload
  )
}

/** The single-send claim update — carries the `finish_email_sent_at` payload. */
function claimCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find(
    (c) => c.ops.includes('update') && c.payload != null && 'finish_email_sent_at' in c.payload
  )
}

const EVENT_ID = 'event-1'
const RIDER_ID = 'rider-1'
const MANAGEMENT_TOKEN = 'tok-mgmt'
const FINISH_TIME = '12:34'

const baseEvent: FinishCheckinParams['event'] = {
  id: EVENT_ID,
  name: 'Test Brevet',
  status: 'upcoming',
  event_date: '2026-05-10',
  distance_km: 200,
  chapters: { name: 'Toronto', slug: 'toronto' },
}

const baseRider: FinishCheckinParams['rider'] = {
  id: RIDER_ID,
  firstName: 'Test',
  lastName: 'Rider',
  email: 'rider@test.com',
}

function baseParams(overrides: Partial<FinishCheckinParams> = {}): FinishCheckinParams {
  return {
    controlPosition: 3,
    isFinalControl: true,
    event: baseEvent,
    rider: baseRider,
    managementToken: MANAGEMENT_TOKEN,
    finishTime: FINISH_TIME,
    ...overrides,
  }
}

describe('handleFinishIfFinalControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default the mock to a successful send
    mockSendRideCompleteEmail.mockResolvedValue({ sent: true })
  })

  it('does nothing when the caller says this was not the final control', async () => {
    const calls = setupSupabase({})

    await handleFinishIfFinalControl(baseParams({ controlPosition: 1, isFinalControl: false }))

    expect(resultsCalls(calls)).toHaveLength(0)
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('inserts a finished result with the management token as submission token', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const insert = insertCall(calls)
    expect(insert?.payload).toEqual({
      event_id: EVENT_ID,
      rider_id: RIDER_ID,
      status: 'finished',
      finish_time: FINISH_TIME,
      season: 2026,
      distance_km: 200,
      submission_token: MANAGEMENT_TOKEN,
      prefilled_at: expect.any(String),
    })
    expect(insert?.payload && 'submitted_at' in insert.payload).toBe(false)
  })

  it('pre-fills a pending row on 23505 and backfills the token when it is NULL', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: { submission_token: null, submitted_at: null, status: 'pending' },
        error: null,
      },
      prefillUpdateResponse: { data: { id: 'r1' }, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const inspect = existingSelectCall(calls)
    expect(inspect?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
    ])

    const prefill = prefillUpdateCall(calls)
    expect(prefill?.payload).toEqual({
      status: 'finished',
      finish_time: FINISH_TIME,
      prefilled_at: expect.any(String),
      submission_token: MANAGEMENT_TOKEN,
    })
    expect(prefill?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
      ['status', 'pending'],
    ])
    expect(prefill?.isArgs).toEqual([['submitted_at', null]])
  })

  it('does not backfill the token on 23505 when the pending row already carries one', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: { submission_token: 'tok-cron', submitted_at: null, status: 'pending' },
        error: null,
      },
      prefillUpdateResponse: { data: { id: 'r1' }, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const prefill = prefillUpdateCall(calls)
    expect(prefill?.payload).toEqual({
      status: 'finished',
      finish_time: FINISH_TIME,
      prefilled_at: expect.any(String),
    })
    expect(prefill?.payload && 'submission_token' in prefill.payload).toBe(false)
  })

  it('never overwrites an admin-entered (finished, no prefilled_at) row on 23505', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        // Organizer-entered finished row: prefilled_at NULL marks it as NOT
        // the card's own work, so it must stay fully authoritative.
        data: {
          submission_token: null,
          submitted_at: null,
          status: 'finished',
          prefilled_at: null,
        },
        error: null,
      },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(existingSelectCall(calls)).toBeDefined()
    expect(prefillUpdateCall(calls)).toBeUndefined()
    expect(claimCall(calls)).toBeUndefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('resumes its own pre-filled finish on 23505 when no email stamp exists (crash-retry)', async () => {
    // Crash between the pre-fill insert and the email claim: the row is
    // finished WITH prefilled_at set and submitted_at null — the card's own
    // work. A retried final check-in must re-enter, refresh the row, and run
    // the claim/send that was lost, rather than returning early.
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: {
          submission_token: 'tok-cron',
          submitted_at: null,
          status: 'finished',
          prefilled_at: '2026-07-05T00:00:00Z',
        },
        error: null,
      },
      prefillUpdateResponse: { data: { id: 'r1' }, error: null },
      claimResponse: { data: { id: 'r1', submission_token: 'tok-cron' }, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const prefill = prefillUpdateCall(calls)
    expect(prefill).toBeDefined()
    // The update re-asserts the observed finished+prefilled state so a
    // concurrent admin/rider write can still never be clobbered.
    expect(prefill?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
      ['status', 'finished'],
    ])
    expect(prefill?.isArgs).toEqual([['submitted_at', null]])
    expect(prefill?.notArgs).toEqual([['prefilled_at', 'is', null]])
    // Token already present (non-NULL) so the payload carries no backfill.
    expect(prefill?.payload).toEqual({
      status: 'finished',
      finish_time: FINISH_TIME,
      prefilled_at: expect.any(String),
    })

    // The lost email claim/send now runs against the row's own token.
    expect(claimCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).toHaveBeenCalledTimes(1)
    expect(mockSendRideCompleteEmail.mock.calls[0][0].submissionToken).toBe('tok-cron')
  })

  it('re-enters a pre-filled finish but sends nothing when the email was already stamped', async () => {
    // Same crash-retry shape, but a prior retry already claimed the single
    // send: the claim update matches zero rows, so re-entry refreshes the row
    // yet never double-sends.
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: {
          submission_token: 'tok-cron',
          submitted_at: null,
          status: 'finished',
          prefilled_at: '2026-07-05T00:00:00Z',
        },
        error: null,
      },
      prefillUpdateResponse: { data: { id: 'r1' }, error: null },
      claimResponse: { data: null, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(prefillUpdateCall(calls)).toBeDefined()
    expect(claimCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('never overwrites a rider-submitted row on 23505', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: { submission_token: null, submitted_at: '2026-05-10T12:00:00Z', status: 'pending' },
        error: null,
      },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(prefillUpdateCall(calls)).toBeUndefined()
    expect(claimCall(calls)).toBeUndefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('emails the row token, not the management token, when a pending row carries its own', async () => {
    // Admin-created pending rows get a gen_random_uuid() default token: it is
    // non-NULL so no backfill happens, and the email must link THAT token —
    // the management token would be a dead link no row carries.
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: { submission_token: 'tok-random-uuid', submitted_at: null, status: 'pending' },
        error: null,
      },
      prefillUpdateResponse: { data: { id: 'r1' }, error: null },
      claimResponse: { data: { id: 'r1', submission_token: 'tok-random-uuid' }, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(claimCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).toHaveBeenCalledTimes(1)
    expect(mockSendRideCompleteEmail.mock.calls[0][0].submissionToken).toBe('tok-random-uuid')
  })

  it('does not claim/send when the 23505 pre-fill update matches zero rows', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '23505' } },
      existingRowResponse: {
        data: { submission_token: 'tok-cron', submitted_at: null, status: 'pending' },
        error: null,
      },
      prefillUpdateResponse: { data: null, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(prefillUpdateCall(calls)).toBeDefined()
    expect(claimCall(calls)).toBeUndefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('sends the finish email only when the claim update returns a row', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
      // On the insert path the row's token IS the management token.
      claimResponse: { data: { id: 'r1', submission_token: MANAGEMENT_TOKEN }, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const claim = claimCall(calls)
    expect(claim?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
    ])
    expect(claim?.isArgs).toEqual([
      ['finish_email_sent_at', null],
      ['submitted_at', null],
    ])

    expect(mockSendRideCompleteEmail).toHaveBeenCalledTimes(1)
    const emailArgs = mockSendRideCompleteEmail.mock.calls[0][0]
    expect(emailArgs).toEqual({
      event: {
        id: EVENT_ID,
        name: 'Test Brevet',
        event_date: '2026-05-10',
        distance_km: 200,
        chapters: { name: 'Toronto', slug: 'toronto' },
      },
      riderName: 'Test Rider',
      riderEmail: 'rider@test.com',
      submissionToken: MANAGEMENT_TOKEN,
      finishTime: FINISH_TIME,
    })
    expect(emailArgs.reminder).toBeUndefined()
  })

  it('does not send when the claim returns no row (already sent or rider submitted)', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
      claimResponse: { data: null, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(insertCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('does not send when the event is already completed', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
    })

    await handleFinishIfFinalControl(baseParams({ event: { ...baseEvent, status: 'completed' } }))

    // Only the pre-fill insert happens — no claim attempt at all.
    expect(resultsCalls(calls)).toHaveLength(1)
    expect(insertCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('does not send when the rider has no email, but still claims nothing', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
    })

    await handleFinishIfFinalControl(baseParams({ rider: { ...baseRider, email: null } }))

    expect(resultsCalls(calls)).toHaveLength(1)
    expect(insertCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('logs email error but continues when sendRideCompleteEmail fails', async () => {
    const calls = setupSupabase({
      insertResponse: { error: null },
      claimResponse: { data: { id: 'r1' }, error: null },
    })

    // Override the default mock for this test: simulate SES send failure
    mockSendRideCompleteEmail.mockResolvedValue({ sent: false, error: 'SES error: quota exceeded' })

    await expect(handleFinishIfFinalControl(baseParams())).resolves.toBeUndefined()

    // The function should still return without throwing
    expect(resultsCalls(calls)).toHaveLength(2) // insert, then claim update
    expect(mockSendRideCompleteEmail).toHaveBeenCalledTimes(1)
    // Verify that logError was called for the email operation
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'handleFinishIfFinalControl.email' })
    )
  })

  it('logs and continues when the result insert fails with a non-unique error', async () => {
    const calls = setupSupabase({
      insertResponse: { error: { code: '500', message: 'boom' } },
    })

    await expect(handleFinishIfFinalControl(baseParams())).resolves.toBeUndefined()

    expect(resultsCalls(calls)).toHaveLength(1)
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'handleFinishIfFinalControl.insert' })
    )
  })
})

describe('revertFinishIfFinalControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reverts a pre-filled finish when the caller says this was the final control', async () => {
    const calls = setupSupabase({
      updateResponse: { error: null },
    })

    await revertFinishIfFinalControl({
      eventId: EVENT_ID,
      riderId: RIDER_ID,
      controlId: 'control-3',
      isFinalControl: true,
    })

    const update = resultsCalls(calls).find((c) => c.ops.includes('update'))
    expect(update?.payload).toEqual({ status: 'pending', finish_time: null, prefilled_at: null })
    expect(update?.ops).toEqual(['update', 'eq', 'eq', 'is', 'eq', 'not'])
    expect(update?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
      ['status', 'finished'],
    ])
    expect(update?.isArgs).toEqual([['submitted_at', null]])
    expect(update?.notArgs).toEqual([['prefilled_at', 'is', null]])
  })

  it('does nothing when the caller says the undone control was not the final one', async () => {
    const calls = setupSupabase({})

    await revertFinishIfFinalControl({
      eventId: EVENT_ID,
      riderId: RIDER_ID,
      controlId: 'control-1',
      isFinalControl: false,
    })

    expect(resultsCalls(calls)).toHaveLength(0)
  })

  it('never throws when the DB errors', async () => {
    const calls = setupSupabase({
      updateResponse: { error: { message: 'update failed' } },
    })

    await expect(
      revertFinishIfFinalControl({
        eventId: EVENT_ID,
        riderId: RIDER_ID,
        controlId: 'control-3',
        isFinalControl: true,
      })
    ).resolves.toBeUndefined()

    expect(resultsCalls(calls)).toHaveLength(1)
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'revertFinishIfFinalControl.update' })
    )
  })
})
