import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for registration management server actions.
 *
 * Like register.test.ts, these focus on validation logic.
 * Complex DB operations are covered in E2E tests.
 */

// Mock Supabase with configurable responses
const mockSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
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
        eq: vi.fn(() => ({
          data: null,
          error: null,
        })),
      })),
      insert: vi.fn(() => ({
        data: null,
        error: null,
      })),
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

import {
  getRegistrationByToken,
  cancelRegistration,
  createEarlyResult,
} from '@/lib/actions/manage-registration'

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
  })

  it('returns error for non-existent token', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const result = await cancelRegistration('non-existent-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration not found')
  })
})

describe('createEarlyResult', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error for non-existent token', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    const result = await createEarlyResult('non-existent-token')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration not found')
  })
})
