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

const mockHonourRecipients = [
  { rider_slug: 'john-doe', rider_name: 'John Doe', award_year: 2024 },
  { rider_slug: null, rider_name: 'Granite Anvil Organizing Committee', award_year: 2017 },
]

let rpcError: { message: string } | null = null

const rpcResponses: Record<string, unknown[]> = {
  get_award_recipients: mockAwardRecipients,
  get_award_recipients_with_distance: mockAwardRecipientsWithDistance,
}

const honourSlugs = [
  'mike-barry-jock-wadley',
  'beryl-burton',
  'coronation-cup',
  'jim-griffin-rookie-of-the-year',
  'organiser-of-the-year',
  'outstanding-performance',
  'dan-herbert',
  'half-wheel',
  'special-recognition',
]

// Mock supabase module
vi.mock('@/lib/supabase', () => ({
  getSupabase: vi.fn(() => ({
    rpc: vi.fn((functionName: string, params: unknown) => {
      rpcCalls.push({ functionName, params })
      if (rpcError) return Promise.resolve({ data: null, error: rpcError })
      const slug = (params as { p_award_slug?: string })?.p_award_slug ?? ''
      const data = honourSlugs.includes(slug)
        ? mockHonourRecipients
        : (rpcResponses[functionName] ?? [])
      return Promise.resolve({ data, error: null })
    }),
  })),
}))

// Import after mocks
import { getOntarioAwards, getAcpAwards, getClubHonours } from '@/lib/data/awards'

describe('Awards Data Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rpcCalls.length = 0
    rpcError = null
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

  describe('getClubHonours', () => {
    it('returns all nine club honours', async () => {
      const result = await getClubHonours()

      expect(Object.keys(result)).toEqual([
        'mikeBarryJockWadley',
        'berylBurton',
        'coronationCup',
        'jimGriffinRookieOfTheYear',
        'organiserOfTheYear',
        'outstandingPerformance',
        'danHerbert',
        'halfWheel',
        'specialRecognition',
      ])
    })

    it('calls RPC once per club honour slug', async () => {
      await getClubHonours()

      const calls = rpcCalls.filter((c) => c.functionName === 'get_award_recipients')
      expect(calls).toHaveLength(9)
      const slugs = calls.map((c) => (c.params as { p_award_slug: string }).p_award_slug)
      expect(slugs.sort()).toEqual([...honourSlugs].sort())
    })

    it('transforms recipients, keeping a null rider slug for name-only recipients', async () => {
      const result = await getClubHonours()

      expect(result.organiserOfTheYear[0]).toEqual({
        riderSlug: 'john-doe',
        riderName: 'John Doe',
        awardYear: 2024,
      })
      expect(result.organiserOfTheYear[1]).toEqual({
        riderSlug: null,
        riderName: 'Granite Anvil Organizing Committee',
        awardYear: 2017,
      })
    })

    it('returns empty arrays when the RPC errors', async () => {
      rpcError = { message: 'boom' }
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await getClubHonours()

      expect(Object.keys(result)).toHaveLength(9)
      for (const recipients of Object.values(result)) {
        expect(recipients).toEqual([])
      }
    })
  })
})
