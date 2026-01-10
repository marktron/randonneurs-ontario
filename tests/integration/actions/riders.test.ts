import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for rider actions.
 *
 * Note: Full database operation tests are covered in E2E tests because
 * Supabase's chainable query builder is complex to mock accurately.
 * These tests focus on input validation logic.
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        })),
      })),
      update: vi.fn(() => ({
        in: vi.fn(() => ({
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      delete: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ error: null }),
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })),
}))

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Import after mocking
import { mergeRiders } from '@/lib/actions/riders'

describe('mergeRiders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when less than 2 riders are provided', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-1',
        sourceRiderIds: ['rider-1'], // Only 1 rider
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: null,
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('At least 2 riders are required to merge')
    })

    it('returns error when target rider is not in source list', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-3', // Not in sourceRiderIds
        sourceRiderIds: ['rider-1', 'rider-2'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: null,
        },
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Target rider must be one of the selected riders')
    })

    it('accepts valid merge with 2 riders', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-1',
        sourceRiderIds: ['rider-1', 'rider-2'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: 'M',
        },
      })

      // The mock setup may not fully support the chain, but validation passes
      // Full success path is tested in E2E
      expect(result.success).toBe(true)
    })

    it('accepts valid merge with 3 riders', async () => {
      const result = await mergeRiders({
        targetRiderId: 'rider-2',
        sourceRiderIds: ['rider-1', 'rider-2', 'rider-3'],
        riderData: {
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          gender: 'F',
        },
      })

      expect(result.success).toBe(true)
    })
  })
})
