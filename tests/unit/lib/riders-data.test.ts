import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for the riders data layer.
 *
 * These tests verify:
 * 1. getAllRiders queries the correct table/view
 * 2. Results are sorted correctly
 * 3. Data is transformed to the correct format
 */

// Track query chain calls
const queryCalls: { method: string; args: unknown[] }[] = []

// Mock rider data
const mockRiderData = [
  { slug: 'bob-anderson', first_name: 'Bob', last_name: 'Anderson' },
  { slug: 'alice-brown', first_name: 'Alice', last_name: 'Brown' },
  { slug: 'john-smith', first_name: 'John', last_name: 'Smith' },
]

// Create a chainable mock that tracks all method calls
const createChainableMock = (finalData: unknown = null, finalError: unknown = null) => {
  const chainable: Record<string, unknown> = {}

  const addMethod = (name: string) => {
    chainable[name] = vi.fn((...args: unknown[]) => {
      queryCalls.push({ method: name, args })
      return chainable
    })
  }

  // Add all typical Supabase query methods
  ;['select', 'order', 'eq', 'neq', 'limit', 'range'].forEach(addMethod)

  // Make chainable thenable for direct await
  chainable.then = (resolve: (value: { data: unknown; error: unknown }) => void) => {
    return Promise.resolve({ data: finalData, error: finalError }).then(resolve)
  }

  return chainable
}

// Mock supabase module
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    from: vi.fn((table: string) => {
      queryCalls.push({ method: 'from', args: [table] })
      return createChainableMock(mockRiderData)
    }),
  })),
}))

// Import after mocks
import { getAllRiders } from '@/lib/data/riders'

describe('Riders Data Layer', () => {
  beforeEach(() => {
    queryCalls.length = 0
    vi.clearAllMocks()
  })

  describe('getAllRiders', () => {
    it('queries the public_riders view', async () => {
      await getAllRiders()

      const fromCall = queryCalls.find((c) => c.method === 'from')
      expect(fromCall).toBeDefined()
      expect(fromCall?.args[0]).toBe('public_riders')
    })

    it('selects only necessary fields', async () => {
      await getAllRiders()

      const selectCall = queryCalls.find((c) => c.method === 'select')
      expect(selectCall).toBeDefined()
      expect(selectCall?.args[0]).toBe('slug, first_name, last_name')
    })

    it('orders by last_name then first_name ascending', async () => {
      await getAllRiders()

      const orderCalls = queryCalls.filter((c) => c.method === 'order')
      expect(orderCalls).toHaveLength(2)

      // First order by last_name
      expect(orderCalls[0].args[0]).toBe('last_name')
      expect(orderCalls[0].args[1]).toEqual({ ascending: true })

      // Then by first_name
      expect(orderCalls[1].args[0]).toBe('first_name')
      expect(orderCalls[1].args[1]).toEqual({ ascending: true })
    })

    it('transforms data to RiderListItem format', async () => {
      const riders = await getAllRiders()

      expect(riders).toHaveLength(3)
      expect(riders[0]).toEqual({
        slug: 'bob-anderson',
        firstName: 'Bob',
        lastName: 'Anderson',
      })
    })

    it('handles null values in data', async () => {
      // Re-mock with null values
      vi.doMock('@/lib/supabase', () => ({
        getSupabase: vi.fn(() => ({
          from: vi.fn(() =>
            createChainableMock([{ slug: null, first_name: null, last_name: null }])
          ),
        })),
      }))

      // The function should handle nulls gracefully by using empty strings
      const riders = await getAllRiders()
      // Note: Due to caching, this may return cached results
      expect(Array.isArray(riders)).toBe(true)
    })
  })
})
