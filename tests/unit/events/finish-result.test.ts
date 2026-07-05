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
  payload?: Record<string, unknown>
}

interface MockState {
  /** `event_controls` select().eq('event_id',...).order().limit(1).maybeSingle() */
  maxPositionResponse?: { data: unknown; error: unknown }
  /** `event_controls` select().eq('id',...).single() */
  controlByIdResponse?: { data: unknown; error: unknown }
  /** `results` insert(...) — awaited directly. */
  insertResponse?: { error: unknown }
  /** `results` update(...).eq().eq().is(...) or ...eq(status) — awaited directly. */
  updateResponse?: { error: unknown }
  /** `results` update(...).eq().eq().is().is().select('id').maybeSingle() */
  claimResponse?: { data: unknown; error: unknown }
}

/**
 * Builds a chainable Supabase stub. Every `.from(table)` call gets its own
 * `FromCall` record (pushed to `calls`) so assertions can inspect the exact
 * filter chain and payload used, not just whether a mock fired.
 */
function setupSupabase(state: MockState): FromCall[] {
  const calls: FromCall[] = []

  const fromFn = vi.fn((table: string) => {
    const call: FromCall = { table, ops: [], eqArgs: [], isArgs: [] }
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
      order: vi.fn(() => {
        call.ops.push('order')
        return builder
      }),
      limit: vi.fn(() => {
        call.ops.push('limit')
        return builder
      }),
      is: vi.fn((...args: unknown[]) => {
        call.ops.push('is')
        call.isArgs.push(args)
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
        if (table === 'event_controls') {
          return Promise.resolve(state.maxPositionResponse ?? { data: null, error: null })
        }
        return Promise.resolve(state.claimResponse ?? { data: null, error: null })
      }),
      single: vi.fn(() => {
        call.ops.push('single')
        return Promise.resolve(state.controlByIdResponse ?? { data: null, error: null })
      }),
      // Supabase query builders are thenables: awaiting the builder directly
      // (no .single()/.maybeSingle() terminal) runs the insert/update as-is.
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

/** The guarded fallback update after a 23505 — no `.select()` in its chain. */
function fallbackUpdateCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find((c) => c.ops.includes('update') && !c.ops.includes('select'))
}

/** The single-send claim update — identifiable by its `.select('id')` call. */
function claimCall(calls: FromCall[]): FromCall | undefined {
  return resultsCalls(calls).find((c) => c.ops.includes('update') && c.ops.includes('select'))
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
  })

  it('does nothing when the control is not the final one', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
    })

    await handleFinishIfFinalControl(baseParams({ controlPosition: 1 }))

    expect(resultsCalls(calls)).toHaveLength(0)
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('inserts a finished result with the management token as submission token', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
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
    })
    expect(insert?.payload && 'submitted_at' in insert.payload).toBe(false)
  })

  it('falls back to a guarded update when the result row already exists', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
      insertResponse: { error: { code: '23505' } },
      updateResponse: { error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    const fallback = fallbackUpdateCall(calls)
    expect(fallback?.payload).toEqual({ status: 'finished', finish_time: FINISH_TIME })
    expect(fallback?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
    ])
    expect(fallback?.isArgs).toEqual([['submitted_at', null]])
  })

  it('sends the finish email only when the claim update returns a row', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
      insertResponse: { error: null },
      claimResponse: { data: { id: 'r1' }, error: null },
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
      maxPositionResponse: { data: { position: 3 }, error: null },
      insertResponse: { error: null },
      claimResponse: { data: null, error: null },
    })

    await handleFinishIfFinalControl(baseParams())

    expect(insertCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('does not send when the event is already completed', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
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
      maxPositionResponse: { data: { position: 3 }, error: null },
      insertResponse: { error: null },
    })

    await handleFinishIfFinalControl(baseParams({ rider: { ...baseRider, email: null } }))

    expect(resultsCalls(calls)).toHaveLength(1)
    expect(insertCall(calls)).toBeDefined()
    expect(mockSendRideCompleteEmail).not.toHaveBeenCalled()
  })

  it('logs and continues when the result insert fails with a non-unique error', async () => {
    const calls = setupSupabase({
      maxPositionResponse: { data: { position: 3 }, error: null },
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

  it('reverts a pre-filled finish when the undone control was the final one', async () => {
    const calls = setupSupabase({
      controlByIdResponse: { data: { position: 3 }, error: null },
      maxPositionResponse: { data: { position: 3 }, error: null },
      updateResponse: { error: null },
    })

    await revertFinishIfFinalControl({
      eventId: EVENT_ID,
      riderId: RIDER_ID,
      controlId: 'control-3',
    })

    const update = resultsCalls(calls).find((c) => c.ops.includes('update'))
    expect(update?.payload).toEqual({ status: 'pending', finish_time: null })
    expect(update?.ops).toEqual(['update', 'eq', 'eq', 'is', 'eq'])
    expect(update?.eqArgs).toEqual([
      ['event_id', EVENT_ID],
      ['rider_id', RIDER_ID],
      ['status', 'finished'],
    ])
    expect(update?.isArgs).toEqual([['submitted_at', null]])
  })

  it('does nothing when the undone control was not the final one', async () => {
    const calls = setupSupabase({
      controlByIdResponse: { data: { position: 1 }, error: null },
      maxPositionResponse: { data: { position: 3 }, error: null },
    })

    await revertFinishIfFinalControl({
      eventId: EVENT_ID,
      riderId: RIDER_ID,
      controlId: 'control-1',
    })

    expect(resultsCalls(calls)).toHaveLength(0)
  })

  it('never throws when the DB errors', async () => {
    const calls = setupSupabase({
      controlByIdResponse: { data: { position: 3 }, error: null },
      maxPositionResponse: { data: { position: 3 }, error: null },
      updateResponse: { error: { message: 'update failed' } },
    })

    await expect(
      revertFinishIfFinalControl({ eventId: EVENT_ID, riderId: RIDER_ID, controlId: 'control-3' })
    ).resolves.toBeUndefined()

    expect(resultsCalls(calls)).toHaveLength(1)
    expect(mockLogError).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ operation: 'revertFinishIfFinalControl.update' })
    )
  })
})
