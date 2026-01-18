/**
 * Reusable Supabase mock builder for tests
 *
 * This provides a consistent way to mock Supabase queries across tests.
 * All Supabase query methods are included to ensure chains don't break.
 */

import { vi, type Mock } from 'vitest'

export interface MockSupabaseResponse {
  data: unknown
  error: unknown | null
}

export interface SupabaseMockConfig {
  responses?: Map<string, MockSupabaseResponse>
  defaultResponse?: MockSupabaseResponse
}

// All Supabase query builder methods that should be chainable
const ALL_CHAIN_METHODS = [
  // Query filters
  'select',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'is',
  'in',
  'contains',
  'containedBy',
  'rangeLt',
  'rangeGt',
  'rangeGte',
  'rangeLte',
  'rangeAdjacent',
  'overlaps',
  'textSearch',
  'match',
  'not',
  'or',
  'filter',
  // Modifiers
  'order',
  'limit',
  'range',
  'single',
  'maybeSingle',
  // Mutations
  'insert',
  'update',
  'upsert',
  'delete',
]

export type MockQueryBuilder = Record<string, Mock> & {
  then: Mock
}

/**
 * Create a mock Supabase query builder with all methods.
 * All chain methods return the builder itself to enable chaining.
 * Terminal methods (then, single) return promises with mock data.
 */
export function createMockQueryBuilder(config: SupabaseMockConfig = {}) {
  const responses = config.responses || new Map<string, MockSupabaseResponse>()
  const defaultResponse: MockSupabaseResponse = config.defaultResponse || { data: [], error: null }

  const builder = {} as MockQueryBuilder

  // Add all chainable methods - each returns the builder
  ALL_CHAIN_METHODS.forEach((method) => {
    builder[method] = vi.fn(() => builder)
  })

  // Override terminal methods with proper async behavior
  builder.single = vi.fn().mockImplementation(async () => {
    return responses.get('single') || { data: null, error: { code: 'PGRST116' } }
  })

  builder.maybeSingle = vi.fn().mockImplementation(async () => {
    return responses.get('maybeSingle') || defaultResponse
  })

  // Make builder thenable (works with await)
  builder.then = vi.fn().mockImplementation((resolve, reject) => {
    const response = responses.get('then') || defaultResponse
    if (response.error && reject) {
      return Promise.resolve().then(() => reject(response.error))
    }
    return Promise.resolve().then(() => resolve(response))
  })

  return {
    builder,
    setResponse: (key: string, response: MockSupabaseResponse) => {
      responses.set(key, response)
    },
    mockResponse: (response: MockSupabaseResponse) => {
      // Convenience method to mock the next query response
      builder.then.mockImplementationOnce((resolve) => {
        return Promise.resolve().then(() => resolve(response))
      })
    },
    mockSingleResponse: (response: MockSupabaseResponse) => {
      builder.single.mockResolvedValueOnce(response)
    },
    reset: () => {
      responses.clear()
      // Reset all method mocks
      ALL_CHAIN_METHODS.forEach((method) => {
        builder[method].mockClear()
        // Re-establish chainability after clear
        builder[method].mockImplementation(() => builder)
      })
      // Reset terminal methods
      builder.single.mockImplementation(async () => {
        return responses.get('single') || { data: null, error: { code: 'PGRST116' } }
      })
      builder.then.mockImplementation((resolve) => {
        const response = responses.get('then') || defaultResponse
        return Promise.resolve().then(() => resolve(response))
      })
    },
  }
}

/**
 * Create a mock Supabase client
 */
export function createMockSupabaseClient() {
  const queryBuilder = createMockQueryBuilder()

  const client = {
    from: vi.fn(() => queryBuilder.builder),
    rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://example.com/file.jpg' },
        }),
      })),
    },
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'test@example.com' } },
          error: null,
        }),
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  }

  return {
    client,
    queryBuilder,
  }
}
