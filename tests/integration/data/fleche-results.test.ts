import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for fleche event team grouping in results data.
 */

// Mock dependencies
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
      'order',
      'limit',
      'range',
      'single',
      'maybeSingle',
      'insert',
      'update',
      'delete',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    builder.then = vi.fn((resolve) => {
      resolve({ data: [], error: null })
    })
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

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
    },
    __mockEventsFound: (events: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: events, error: null })
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
  getDbSlug: vi.fn((slug: string) => {
    const mapping: Record<string, string | null> = {
      toronto: 'toronto',
      fleche: 'fleche',
    }
    return mapping[slug] ?? null
  }),
  getUrlSlugFromDbSlug: vi.fn((slug: string) => slug),
  getResultsChapterInfo: vi.fn((slug: string) => ({ name: 'Test', slug })),
  getAllResultsChapterSlugs: vi.fn(() => ['toronto', 'fleche']),
  getResultsDescription: vi.fn(() => 'Test description'),
}))

vi.mock('@/lib/utils', () => ({
  formatFinishTime: vi.fn((time: string | null) => time || null),
  formatStatus: vi.fn((status: string) => {
    if (status === 'dnf') return 'DNF'
    if (status === 'dns') return 'DNS'
    if (status === 'otl') return 'OTL'
    return null
  }),
}))

vi.mock('@/lib/errors', () => ({
  handleDataError: vi.fn((_error, _context, fallback) => fallback),
}))

import { getChapterResults } from '@/lib/data/results'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockEventsFound: (events: unknown[]) => void
}>('@/lib/supabase')

describe('Fleche team grouping', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('groups fleche results by team_name', async () => {
    const mockFlecheEvent = {
      id: 'fleche-1',
      name: 'Ontario Fleche',
      event_date: '2025-04-26',
      distance_km: 360,
      event_type: 'fleche',
      routes: null,
      public_results: [
        {
          id: 'r1',
          finish_time: null,
          status: 'finished',
          team_name: 'Team Alpha',
          distance_km: 412,
          rider_slug: 'alice',
          first_name: 'Alice',
          last_name: 'Anderson',
        },
        {
          id: 'r2',
          finish_time: null,
          status: 'finished',
          team_name: 'Team Alpha',
          distance_km: 412,
          rider_slug: 'bob',
          first_name: 'Bob',
          last_name: 'Brown',
        },
        {
          id: 'r3',
          finish_time: null,
          status: 'finished',
          team_name: 'Team Beta',
          distance_km: 380,
          rider_slug: 'carol',
          first_name: 'Carol',
          last_name: 'Clark',
        },
      ],
    }

    // Mock: events query returns fleche event, awards query returns empty
    mockModule.__mockEventsFound([mockFlecheEvent])
    // Awards query (returns empty)
    mockModule.__mockEventsFound([])

    const results = await getChapterResults('fleche', 2025)

    expect(results).toHaveLength(1)
    expect(results[0].teams).toBeDefined()
    expect(results[0].teams).toHaveLength(2)
    expect(results[0].eventType).toBe('fleche')
  })

  it('sorts teams by distance descending', async () => {
    const mockFlecheEvent = {
      id: 'fleche-1',
      name: 'Ontario Fleche',
      event_date: '2025-04-26',
      distance_km: 360,
      event_type: 'fleche',
      routes: null,
      public_results: [
        {
          id: 'r1',
          finish_time: null,
          status: 'finished',
          team_name: 'Short Team',
          distance_km: 361,
          rider_slug: 'a',
          first_name: 'A',
          last_name: 'One',
        },
        {
          id: 'r2',
          finish_time: null,
          status: 'finished',
          team_name: 'Long Team',
          distance_km: 450,
          rider_slug: 'b',
          first_name: 'B',
          last_name: 'Two',
        },
        {
          id: 'r3',
          finish_time: null,
          status: 'finished',
          team_name: 'Mid Team',
          distance_km: 400,
          rider_slug: 'c',
          first_name: 'C',
          last_name: 'Three',
        },
      ],
    }

    mockModule.__mockEventsFound([mockFlecheEvent])
    mockModule.__mockEventsFound([])

    const results = await getChapterResults('fleche', 2025)
    const teams = results[0].teams!

    expect(teams[0].teamName).toBe('Long Team')
    expect(teams[1].teamName).toBe('Mid Team')
    expect(teams[2].teamName).toBe('Short Team')
  })

  it('sorts riders within teams by last name', async () => {
    const mockFlecheEvent = {
      id: 'fleche-1',
      name: 'Ontario Fleche',
      event_date: '2025-04-26',
      distance_km: 360,
      event_type: 'fleche',
      routes: null,
      public_results: [
        {
          id: 'r1',
          finish_time: null,
          status: 'finished',
          team_name: 'Team A',
          distance_km: 400,
          rider_slug: 'z',
          first_name: 'Zoe',
          last_name: 'Zeta',
        },
        {
          id: 'r2',
          finish_time: null,
          status: 'finished',
          team_name: 'Team A',
          distance_km: 400,
          rider_slug: 'a',
          first_name: 'Anna',
          last_name: 'Alpha',
        },
      ],
    }

    mockModule.__mockEventsFound([mockFlecheEvent])
    mockModule.__mockEventsFound([])

    const results = await getChapterResults('fleche', 2025)
    const teamRiders = results[0].teams![0].riders

    expect(teamRiders[0].name).toBe('Anna Alpha')
    expect(teamRiders[1].name).toBe('Zoe Zeta')
  })

  it('places Unknown Team last', async () => {
    const mockFlecheEvent = {
      id: 'fleche-1',
      name: 'Ontario Fleche',
      event_date: '2025-04-26',
      distance_km: 360,
      event_type: 'fleche',
      routes: null,
      public_results: [
        {
          id: 'r1',
          finish_time: null,
          status: 'finished',
          team_name: null,
          distance_km: 999,
          rider_slug: 'a',
          first_name: 'No',
          last_name: 'Team',
        },
        {
          id: 'r2',
          finish_time: null,
          status: 'finished',
          team_name: 'Real Team',
          distance_km: 360,
          rider_slug: 'b',
          first_name: 'Has',
          last_name: 'Team',
        },
      ],
    }

    mockModule.__mockEventsFound([mockFlecheEvent])
    mockModule.__mockEventsFound([])

    const results = await getChapterResults('fleche', 2025)
    const teams = results[0].teams!

    expect(teams[0].teamName).toBe('Real Team')
    expect(teams[1].teamName).toBe('Unknown Team')
  })

  it('does not create teams for non-fleche events', async () => {
    const mockBrevetEvent = {
      id: 'brevet-1',
      name: 'Spring 200',
      event_date: '2025-05-10',
      distance_km: 200,
      event_type: 'brevet',
      routes: { slug: 'spring-200' },
      public_results: [
        {
          id: 'r1',
          finish_time: '10:30',
          status: 'finished',
          team_name: null,
          distance_km: 200,
          rider_slug: 'a',
          first_name: 'Alice',
          last_name: 'Anderson',
        },
      ],
    }

    mockModule.__mockEventsFound([mockBrevetEvent])
    mockModule.__mockEventsFound([])

    const results = await getChapterResults('toronto', 2025)

    expect(results[0].teams).toBeUndefined()
    expect(results[0].eventType).toBe('brevet')
  })
})
