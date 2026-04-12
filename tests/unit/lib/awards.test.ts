import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for awards data fetching module.
 *
 * These tests verify the correct structure and behavior of award queries
 * using RPC functions for database-side aggregation.
 */

// Track RPC calls
const rpcCalls: { functionName: string; params: unknown }[] = []

// Mock RPC response data
const mockAwardRecipients = [
  { rider_slug: 'john-doe', rider_name: 'John Doe', award_year: 2024 },
  { rider_slug: 'jane-smith', rider_name: 'Jane Smith', award_year: 2023 },
]

const mockAwardRecipientsWithDistance = [
  { rider_slug: 'john-doe', rider_name: 'John Doe', award_year: 2024, season_distance: 6500 },
  { rider_slug: 'jane-smith', rider_name: 'Jane Smith', award_year: 2023, season_distance: 5200 },
]

const rpcResponses: Record<string, unknown[]> = {
  get_award_recipients: mockAwardRecipients,
  get_award_recipients_with_distance: mockAwardRecipientsWithDistance,
}

// Mock supabase module
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    rpc: vi.fn((functionName: string, params: unknown) => {
      rpcCalls.push({ functionName, params })
      const data = rpcResponses[functionName] ?? []
      return Promise.resolve({ data, error: null })
    }),
  })),
}))

// Import after mocks
import { getOntarioAwards, getAcpAwards } from '@/lib/data/awards'

describe('Awards Data Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls.length = 0
  })

  describe('getOntarioAwards', () => {
    it('returns correctly structured Ontario awards', async () => {
      const result = await getOntarioAwards()

      expect(result).toHaveProperty('o12')
      expect(result).toHaveProperty('ontarioExplorer')
      expect(result).toHaveProperty('o5000')
      expect(result).toHaveProperty('ontarioRouleur')
      expect(result).toHaveProperty('ontarioRover')
    })

    it('transforms award recipients correctly', async () => {
      const result = await getOntarioAwards()

      expect(result.o12[0]).toMatchObject({
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        awardYear: expect.any(Number),
      })
    })

    it('transforms O-5000 recipients with distance correctly', async () => {
      const result = await getOntarioAwards()

      expect(result.o5000[0]).toMatchObject({
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        awardYear: expect.any(Number),
        seasonDistance: expect.any(Number),
      })
      expect(result.o5000[0].seasonDistance).toBe(6500)
    })

    it('calls RPC with correct award slugs', async () => {
      await getOntarioAwards()

      const recipientCalls = rpcCalls.filter((c) => c.functionName === 'get_award_recipients')
      const slugs = recipientCalls.map((c) => (c.params as { p_award_slug: string }).p_award_slug)
      expect(slugs).toContain('o-12')
      expect(slugs).toContain('ontario-explorer')
      expect(slugs).toContain('ontario-rouleur')
      expect(slugs).toContain('ontario-rover')
    })

    it('uses distance RPC for O-5000', async () => {
      await getOntarioAwards()

      const distanceCalls = rpcCalls.filter(
        (c) => c.functionName === 'get_award_recipients_with_distance'
      )
      expect(distanceCalls).toHaveLength(1)
      expect((distanceCalls[0].params as { p_award_slug: string }).p_award_slug).toBe('o-5000')
    })
  })

  describe('getAcpAwards', () => {
    it('returns correctly structured ACP awards', async () => {
      const result = await getAcpAwards()

      expect(result).toHaveProperty('r10000')
      expect(result).toHaveProperty('r5000')

      expect(result.r10000[0]).toMatchObject({
        riderSlug: expect.any(String),
        riderName: expect.any(String),
        awardYear: expect.any(Number),
      })
    })

    it('calls RPC with correct award slugs', async () => {
      await getAcpAwards()

      const calledFunctions = rpcCalls.filter((c) => c.functionName === 'get_award_recipients')
      expect(calledFunctions).toHaveLength(2)

      const slugs = calledFunctions.map((c) => (c.params as { p_award_slug: string }).p_award_slug)
      expect(slugs).toContain('r-10000')
      expect(slugs).toContain('r-5000')
    })
  })
})
