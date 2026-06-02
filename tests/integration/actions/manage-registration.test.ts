import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for registration management server actions.
 *
 * Like register.test.ts, these focus on validation logic.
 * Complex DB operations are covered in E2E tests.
 */

// Mock Supabase with configurable responses
const mockSingle = vi.fn()
const mockUpdateEq = vi.fn()
const mockInsert = vi.fn()

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSingle,
          eq: vi.fn(() => ({
            single: mockSingle,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: mockUpdateEq,
      })),
      insert: mockInsert,
    })),
  })),
}))

// Mock Next.js cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

// Mock email sending
vi.mock('@/lib/email/send-registration-email', () => ({
  sendCancellationConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import {
  getRegistrationByToken,
  cancelRegistration,
  createEarlyResult,
} from '@/lib/actions/manage-registration'

// A registration that is eligible to be cancelled (registered + event scheduled).
function cancellableRegistration() {
  return {
    id: 'reg-1',
    status: 'registered',
    rider_id: 'rider-1',
    event_id: 'event-1',
    events: {
      id: 'event-1',
      slug: 'spring-200',
      status: 'scheduled',
      name: 'Spring 200',
      event_date: '2025-06-01',
      start_time: '08:00',
      distance_km: 200,
      event_type: 'brevet',
      chapters: null,
    },
    riders: { first_name: 'Test', last_name: 'Rider', email: null },
  }
}

// A registration eligible for an early result (registered + start time in the past).
function startedRegistration() {
  return {
    id: 'reg-1',
    status: 'registered',
    rider_id: 'rider-1',
    event_id: 'event-1',
    management_token: 'mgmt-token',
    events: {
      id: 'event-1',
      event_date: '2020-01-01',
      start_time: '08:00',
      distance_km: 200,
      status: 'scheduled',
    },
  }
}

describe('getRegistrationByToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null for non-existent token', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const result = await getRegistrationByToken('non-existent-token')
    expect(result).toBeNull()
  })
})

describe('cancelRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEq.mockResolvedValue({ data: null, error: null })
    mockInsert.mockResolvedValue({ data: null, error: null })
  })

  it('returns error for non-existent token', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const result = await cancelRegistration('non-existent-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration not found')
  })

  it('does not log the expected "not found" case to Sentry', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    await cancelRegistration('non-existent-token')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('returns an ActionResult failure and logs to Sentry when the update fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: cancellableRegistration(), error: null })
    mockUpdateEq.mockResolvedValue({ data: null, error: { message: 'connection reset' } })

    const result = await cancelRegistration('mgmt-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to cancel registration')
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('returns success when the update succeeds', async () => {
    mockSingle.mockResolvedValueOnce({ data: cancellableRegistration(), error: null })

    const result = await cancelRegistration('mgmt-token')
    expect(result).toEqual({ success: true })
  })
})

describe('createEarlyResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateEq.mockResolvedValue({ data: null, error: null })
    mockInsert.mockResolvedValue({ data: null, error: null })
  })

  it('returns error for non-existent token', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const result = await createEarlyResult('non-existent-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration not found')
  })

  it('returns an ActionResult failure and logs to Sentry when the insert fails', async () => {
    // First single() resolves the registration; second resolves "no existing result".
    mockSingle
      .mockResolvedValueOnce({ data: startedRegistration(), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    mockInsert.mockResolvedValue({ data: null, error: { message: 'insert failed' } })

    const result = await createEarlyResult('mgmt-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to create result')
    expect(Sentry.captureException).toHaveBeenCalled()
  })

  it('returns the submission token at the top level on success', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: startedRegistration(), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

    const result = await createEarlyResult('mgmt-token')
    expect(result).toEqual({ success: true, submissionToken: 'mgmt-token' })
  })
})
