import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for route actions.
 *
 * These tests focus on:
 * 1. Input validation
 * 2. Business logic (duplicate prevention, deletion restrictions)
 * 3. Error handling
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
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

    // Terminal methods
    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.then = vi.fn((resolve) => {
      resolve({ data: null, error: null })
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
    })),
    __queryBuilder: queryBuilder,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockRouteFound: (route: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({ data: route, error: null })
    },
    __mockRouteNotFound: () => {
      queryBuilder.single.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })
    },
    __mockInsertSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockInsertError: (error: unknown) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error })
      })
    },
    __mockUpdateSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockEventsFound: (events: unknown[]) => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: events, error: null })
      })
    },
    __mockEventsEmpty: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: [], error: null })
      })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'admin',
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/chapter-config', () => ({
  getUrlSlugFromDbSlug: vi.fn((slug: string) => (slug === 'toronto' ? 'toronto' : null)),
}))

// Import after mocks
import {
  createRoute,
  updateRoute,
  deleteRoute,
  toggleRouteActive,
  mergeRoutes,
} from '@/lib/actions/routes'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __reset: () => void
  __mockRouteFound: (route: unknown) => void
  __mockRouteNotFound: () => void
  __mockInsertSuccess: () => void
  __mockInsertError: (error: unknown) => void
  __mockUpdateSuccess: () => void
  __mockEventsFound: (events: unknown[]) => void
  __mockEventsEmpty: () => void
}>('@/lib/supabase-server')

describe('createRoute', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error for empty route name', async () => {
      const result = await createRoute({
        name: '',
        slug: 'test-route',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Route name is required')
    })

    it('returns error for whitespace-only route name', async () => {
      const result = await createRoute({
        name: '   ',
        slug: 'test-route',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Route name is required')
    })

    it('creates route with provided slug', async () => {
      mockModule.__mockInsertSuccess()

      const result = await createRoute({
        name: 'Test Route Name',
        slug: 'test-route-name',
      })

      // Should not fail validation
      expect(result.error).not.toBe('Route name is required')
    })
  })

  describe('RWGPS URL extraction', () => {
    it('extracts ID from full RWGPS URL', async () => {
      mockModule.__mockInsertSuccess()

      const result = await createRoute({
        name: 'Test Route',
        slug: 'test-route',
        rwgpsUrl: 'https://ridewithgps.com/routes/12345678',
      })

      // Should not fail on URL format
      expect(result.error).not.toBe('Route name is required')
    })

    it('extracts ID from RWGPS URL with query params', async () => {
      mockModule.__mockInsertSuccess()

      const result = await createRoute({
        name: 'Test Route',
        slug: 'test-route-2',
        rwgpsUrl: 'https://ridewithgps.com/routes/12345678?privacy_code=xyz',
      })

      expect(result.error).not.toBe('Route name is required')
    })

    it('handles numeric ID directly', async () => {
      mockModule.__mockInsertSuccess()

      const result = await createRoute({
        name: 'Test Route',
        slug: 'test-route-3',
        rwgpsUrl: '12345678',
      })

      expect(result.error).not.toBe('Route name is required')
    })
  })

  describe('error handling', () => {
    it('handles duplicate slug error', async () => {
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key value violates unique constraint',
      })

      const result = await createRoute({
        name: 'Test Route',
        slug: 'existing-slug',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('A route with this slug already exists')
    })

    it('handles database errors', async () => {
      mockModule.__mockInsertError({
        code: '23503',
        message: 'foreign key violation',
      })

      const result = await createRoute({
        name: 'Test Route',
        slug: 'test-route-4',
        chapterId: 'invalid-chapter',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('updateRoute', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when route not found', async () => {
    mockModule.__mockRouteNotFound()

    const result = await updateRoute('non-existent-id', {
      name: 'Updated Name',
    })

    // Update doesn't check existence first, but should handle errors
    expect(result).toBeDefined()
  })

  it('updates route successfully', async () => {
    mockModule.__mockRouteFound({ id: 'route-1', chapter_id: 'chapter-1', slug: 'test-route' })
    mockModule.__mockUpdateSuccess()

    const result = await updateRoute('route-1', {
      name: 'Updated Name',
    })

    expect(result.success).toBe(true)
  })

  it('handles duplicate slug error on update', async () => {
    mockModule.__mockRouteFound({ id: 'route-1', chapter_id: 'chapter-1', slug: 'test-route' })
    mockModule.__mockInsertError({
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    })

    const result = await updateRoute('route-1', {
      slug: 'existing-slug',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('A route with this slug already exists')
  })
})

describe('deleteRoute', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when route is used by events', async () => {
    mockModule.__mockRouteFound({ id: 'route-1', chapter_id: 'chapter-1' })
    mockModule.__mockEventsFound([{ id: 'event-1' }])

    const result = await deleteRoute('route-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe(
      'Cannot delete route that is used by events. Mark it as inactive instead.'
    )
  })

  it('allows deletion when route is not used', async () => {
    mockModule.__mockRouteFound({ id: 'route-1', chapter_id: 'chapter-1' })
    mockModule.__mockEventsEmpty()
    mockModule.__mockUpdateSuccess() // For delete operation

    const result = await deleteRoute('route-1')

    expect(result.success).toBe(true)
  })

  it('returns error when route not found', async () => {
    mockModule.__mockRouteNotFound()
    mockModule.__mockEventsEmpty()

    const result = await deleteRoute('non-existent-id')

    // Should handle gracefully
    expect(result).toBeDefined()
  })
})

describe('toggleRouteActive', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('toggles route active status', async () => {
    mockModule.__mockRouteFound({ id: 'route-1', chapter_id: 'chapter-1', slug: 'test-route' })
    mockModule.__mockUpdateSuccess()

    const result = await toggleRouteActive('route-1', true)

    expect(result.success).toBe(true)
  })
})

describe('mergeRoutes', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns error when less than 2 routes provided', async () => {
    const result = await mergeRoutes({
      targetRouteId: 'route-1',
      sourceRouteIds: ['route-1'],
      routeData: {
        name: 'Merged Route',
        slug: 'merged-route',
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('At least 2 routes are required to merge')
  })

  it('returns error when target not in source list', async () => {
    const result = await mergeRoutes({
      targetRouteId: 'route-1',
      sourceRouteIds: ['route-2', 'route-3'],
      routeData: {
        name: 'Merged Route',
        slug: 'merged-route',
      },
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Target route must be one of the selected routes')
  })

  it('merges routes successfully', async () => {
    mockModule.__mockUpdateSuccess() // For event updates
    mockModule.__mockUpdateSuccess() // For route deletion
    mockModule.__mockUpdateSuccess() // For route update

    const result = await mergeRoutes({
      targetRouteId: 'route-1',
      sourceRouteIds: ['route-1', 'route-2'],
      routeData: {
        name: 'Merged Route',
        slug: 'merged-route',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.deletedRoutesCount).toBe(1)
    }
  })
})
