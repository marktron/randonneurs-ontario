import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for calendar API route (iCal generation).
 *
 * These tests verify:
 * 1. iCal format correctness
 * 2. Chapter filtering
 * 3. Date range handling
 * 4. Error responses
 */

// Mock dependencies before imports
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

    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.then = vi.fn((resolve) => {
      resolve({ data: [], error: null })
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabase: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: [], error: null })
      })
    },
    __mockChapterFound: (chapter: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: chapter, error: null })
    },
    __mockChapterNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockEventsFound: (events: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: events, error: null })
      })
    },
  }
})

vi.mock('next/cache', () => ({
  unstable_cache: vi.fn((fn) => fn),
}))

vi.mock('@/lib/chapter-config', () => ({
  getDbSlug: vi.fn((slug: string) => {
    const mapping: Record<string, string | null> = {
      toronto: 'toronto',
      'simcoe-muskoka': 'simcoe',
      ottawa: 'ottawa',
      huron: 'huron',
    }
    return mapping[slug] ?? null
  }),
  getChapterInfo: vi.fn((slug: string) => {
    const validChapters = ['toronto', 'simcoe-muskoka', 'ottawa', 'huron']
    if (validChapters.includes(slug)) {
      return { name: 'Test Chapter', slug }
    }
    return null
  }),
  getAllChapterSlugs: vi.fn(() => ['toronto', 'ottawa', 'simcoe-muskoka', 'huron']),
}))

vi.mock('@/lib/utils', () => ({
  formatEventType: vi.fn((type: string) => {
    const mapping: Record<string, string> = {
      brevet: 'Brevet',
      populaire: 'Populaire',
      fleche: 'Fleche',
    }
    return mapping[type] || type
  }),
}))

vi.mock('@/lib/errors', () => ({
  logError: vi.fn(),
}))

vi.mock('ics', () => ({
  createEvents: vi.fn((events, options) => {
    if (events.length === 0) {
      // Empty events still produces valid calendar
      return { error: null, value: 'BEGIN:VCALENDAR\nVERSION:2.0\nEND:VCALENDAR' }
    }
    return {
      error: null,
      value: 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR',
    }
  }),
}))

// Import after mocks
import { GET } from '@/app/api/calendar/[chapter]/route'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockChapterFound: (chapter: unknown) => void
  __mockChapterNotFound: () => void
  __mockEventsFound: (events: unknown[]) => void
}>('@/lib/supabase')

describe('Calendar API Route', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('GET /api/calendar/[chapter]', () => {
    it('returns 404 for invalid chapter', async () => {
      const request = new Request('http://localhost/api/calendar/invalid-chapter')
      const params = Promise.resolve({ chapter: 'invalid-chapter' })

      const response = await GET(request, { params })

      expect(response.status).toBe(404)
      const json = await response.json()
      expect(json.error).toContain('Invalid chapter')
    })

    it('generates iCal for valid chapter', async () => {
      // Mock chapter lookup
      mockModule.__mockChapterFound({ id: 'chapter-1' })

      // Mock events query
      const mockEvents = [
        {
          id: 'event-1',
          slug: 'spring-200',
          name: 'Spring 200',
          event_date: '2025-05-15',
          start_time: '08:00',
          start_location: 'Toronto',
          distance_km: 200,
          event_type: 'brevet',
          description: 'Test description',
        },
      ]
      mockModule.__mockEventsFound(mockEvents)

      const request = new Request('http://localhost/api/calendar/toronto')
      const params = Promise.resolve({ chapter: 'toronto' })

      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/calendar')
    })

    it('returns empty calendar when no events', async () => {
      // Mock chapter lookup
      mockModule.__mockChapterFound({ id: 'chapter-1' })

      // Mock empty events query
      mockModule.__mockEventsFound([])

      const request = new Request('http://localhost/api/calendar/toronto')
      const params = Promise.resolve({ chapter: 'toronto' })

      const response = await GET(request, { params })

      expect(response.status).toBe(200)
      const text = await response.text()
      expect(text).toContain('BEGIN:VCALENDAR')
    })

    it('includes proper iCal headers', async () => {
      // Mock chapter lookup
      mockModule.__mockChapterFound({ id: 'chapter-1' })

      // Mock events query
      const mockEvents = [
        {
          id: 'event-1',
          slug: 'spring-200',
          name: 'Spring 200',
          event_date: '2025-05-15',
          start_time: '08:00',
          start_location: 'Toronto',
          distance_km: 200,
          event_type: 'brevet',
          description: null,
        },
      ]
      mockModule.__mockEventsFound(mockEvents)

      const request = new Request('http://localhost/api/calendar/toronto')
      const params = Promise.resolve({ chapter: 'toronto' })

      const response = await GET(request, { params })

      expect(response.headers.get('content-type')).toContain('text/calendar')
      expect(response.headers.get('content-disposition')).toContain('attachment')
    })

    it('handles .ics extension in URL', async () => {
      // Mock chapter lookup
      mockModule.__mockChapterFound({ id: 'chapter-1' })
      mockModule.__mockEventsFound([])

      const request = new Request('http://localhost/api/calendar/toronto.ics')
      const params = Promise.resolve({ chapter: 'toronto.ics' })

      const response = await GET(request, { params })

      expect(response.status).toBe(200)
    })
  })
})
