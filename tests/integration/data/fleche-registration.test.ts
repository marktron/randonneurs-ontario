import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for fleche team registration.
 */

// Mock Supabase
vi.mock('@/lib/supabase', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = [
      'select',
      'eq',
      'neq',
      'gte',
      'lte',
      'gt',
      'lt',
      'not',
      'or',
      'in',
      'ilike',
      'order',
      'limit',
      'range',
      'single',
      'maybeSingle',
      'insert',
      'update',
      'delete',
      'upsert',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    builder.then = vi.fn((resolve) => {
      resolve({ data: [], error: null })
    })
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.maybeSingle.mockReset()
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
    },
    __mockDataFound: (data: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data, error: null })
      })
    },
  }
})

vi.mock('react', () => ({
  cache: vi.fn((fn) => fn),
}))

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/chapter-config', () => ({
  getDbSlug: vi.fn((slug: string) => slug),
  getUrlSlugFromDbSlug: vi.fn((slug: string) => slug),
  getChapterInfo: vi.fn(() => ({ name: 'Test', slug: 'test' })),
  getAllChapterSlugs: vi.fn(() => ['toronto']),
}))

vi.mock('@/lib/utils', () => ({
  formatEventType: vi.fn((type: string) => {
    if (type === 'fleche') return 'Fleche'
    if (type === 'brevet') return 'Brevet'
    return type
  }),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((_error, _context, fallback) => fallback),
}))

import { getFlecheTeams, getRegisteredRidersWithTeams } from '@/lib/data/events'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockDataFound: (data: unknown[]) => void
}>('@/lib/supabase')

describe('getFlecheTeams', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns teams grouped with counts', async () => {
    mockModule.__mockDataFound([
      {
        team_name: 'Speed Demons',
        is_team_captain: true,
        riders: { first_name: 'Alice', last_name: 'Anderson' },
      },
      {
        team_name: 'Speed Demons',
        is_team_captain: false,
        riders: { first_name: 'Bob', last_name: 'Brown' },
      },
      {
        team_name: 'Night Owls',
        is_team_captain: true,
        riders: { first_name: 'Carol', last_name: 'Clark' },
      },
    ])

    const teams = await getFlecheTeams('event-1')

    expect(teams).toHaveLength(2)
    // Sorted alphabetically
    expect(teams[0].teamName).toBe('Night Owls')
    expect(teams[0].memberCount).toBe(1)
    expect(teams[0].captain).toBe('Carol C.')
    expect(teams[1].teamName).toBe('Speed Demons')
    expect(teams[1].memberCount).toBe(2)
    expect(teams[1].captain).toBe('Alice A.')
  })

  it('returns empty array when no teams exist', async () => {
    const teams = await getFlecheTeams('event-1')
    expect(teams).toEqual([])
  })
})

describe('getRegisteredRidersWithTeams', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns riders with team names', async () => {
    mockModule.__mockDataFound([
      {
        team_name: 'Team A',
        share_registration: true,
        riders: { first_name: 'Alice', last_name: 'Anderson' },
      },
      {
        team_name: 'Team A',
        share_registration: true,
        riders: { first_name: 'Bob', last_name: 'Brown' },
      },
      {
        team_name: null,
        share_registration: true,
        riders: { first_name: 'Carol', last_name: 'Clark' },
      },
    ])

    const riders = await getRegisteredRidersWithTeams('event-1')

    expect(riders).toHaveLength(3)
    expect(riders[0]).toEqual({ name: 'Alice A.', teamName: 'Team A' })
    expect(riders[1]).toEqual({ name: 'Bob B.', teamName: 'Team A' })
    expect(riders[2]).toEqual({ name: 'Carol C.', teamName: null })
  })

  it('shows Anonymous for riders who opt out of sharing', async () => {
    mockModule.__mockDataFound([
      {
        team_name: 'Team A',
        share_registration: false,
        riders: { first_name: 'Alice', last_name: 'Anderson' },
      },
    ])

    const riders = await getRegisteredRidersWithTeams('event-1')

    expect(riders[0]).toEqual({ name: 'Anonymous', teamName: 'Team A' })
  })
})
