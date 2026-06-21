import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression test: when updating an existing rider's supplementary info
 * (gender, phone, emergency contact) fails at the DB layer, the error must be
 * logged to Sentry rather than silently swallowed. Registration still proceeds
 * — a failed contact-info update should not block an existing rider from
 * registering.
 *
 * This guards against the class of bug where a missing column / RLS failure on
 * the rider update returned silently (no log), masking a real schema problem.
 */

const logErrorMock = vi.fn()
vi.mock('@/lib/errors', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

const UPDATE_ERROR = { code: '42703', message: 'column riders.phone does not exist' }

vi.mock('@/lib/supabase-server', () => {
  const EXISTING_RIDER = { id: 'rider-1', first_name: 'Fred', last_name: 'Chagnon' }
  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => ({
        // Email lookup: .select(...).ilike('email', ...) resolves to an array
        select: vi.fn(() => ({
          ilike: vi.fn(() => Promise.resolve({ data: [EXISTING_RIDER], error: null })),
        })),
        // Rider update: .update(data).eq('id', ...) resolves with an error
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: UPDATE_ERROR })),
        })),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
  }
})

vi.mock('@/lib/actions/rider-match', () => ({
  searchRiderCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
}))

import { findOrCreateRider } from '@/lib/actions/registration/rider'

describe('findOrCreateRider — rider update error handling', () => {
  beforeEach(() => {
    logErrorMock.mockClear()
  })

  it('logs to Sentry when updating an existing rider fails, but still succeeds', async () => {
    const result = await findOrCreateRider(
      'fred@example.com',
      'Fred',
      'Chagnon',
      'M',
      '6475550123',
      'Contact',
      '5559999'
    )

    // Registration is not blocked by a failed supplementary-info update
    expect(result).toEqual({ success: true, riderId: 'rider-1' })

    // The swallowed error is now surfaced to Sentry
    expect(logErrorMock).toHaveBeenCalledTimes(1)
    expect(logErrorMock).toHaveBeenCalledWith(
      UPDATE_ERROR,
      expect.objectContaining({
        operation: expect.stringContaining('findOrCreateRider'),
      })
    )
  })
})
