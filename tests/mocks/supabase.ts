import { vi } from 'vitest'

type MockResponse = { data: unknown; error: unknown }
type MockMethod = 'select' | 'insert' | 'update' | 'delete' | 'rpc'

interface TableConfig {
  responses: Map<string, MockResponse>
  defaultResponse: MockResponse
}

/**
 * Enhanced Supabase mock that supports:
 * - Per-table configuration
 * - Chained query patterns (.select().eq().single())
 * - Operation-specific responses
 * - Request tracking for assertions
 */
export function createMockSupabaseClient() {
  // Track all requests for assertions
  const requests: Array<{
    table: string
    method: MockMethod
    chain: string[]
    args: Record<string, unknown>
  }> = []

  // Per-table configuration
  const tables = new Map<string, TableConfig>()

  // Track current chain state
  let currentTable = ''
  let currentMethod: MockMethod = 'select'
  let currentChain: string[] = []
  let currentArgs: Record<string, unknown> = {}

  // Default response
  const defaultResponse: MockResponse = { data: null, error: null }

  // Get response for current query
  const getResponse = (): MockResponse => {
    const tableConfig = tables.get(currentTable)
    if (!tableConfig) return defaultResponse

    // Try to find a specific response for this chain pattern
    const chainKey = [currentMethod, ...currentChain].join('.')
    const specificResponse = tableConfig.responses.get(chainKey)
    if (specificResponse) return specificResponse

    // Fall back to method-level response
    const methodResponse = tableConfig.responses.get(currentMethod)
    if (methodResponse) return methodResponse

    return tableConfig.defaultResponse
  }

  // Create chainable query builder methods
  const createChainMethod = (methodName: string) => {
    return vi.fn((...args: unknown[]) => {
      currentChain.push(methodName)
      currentArgs[methodName] = args
      return queryBuilder
    })
  }

  // Terminal methods that return the response
  const createTerminalMethod = (methodName: string) => {
    return vi.fn(async () => {
      currentChain.push(methodName)
      const response = getResponse()
      requests.push({
        table: currentTable,
        method: currentMethod,
        chain: [...currentChain],
        args: { ...currentArgs },
      })
      // Reset for next query
      currentChain = []
      currentArgs = {}
      return response
    })
  }

  // For methods that can be terminal or chainable
  const createFlexMethod = (methodName: string) => {
    const fn = vi.fn((...args: unknown[]) => {
      currentChain.push(methodName)
      currentArgs[methodName] = args
      // Return a thenable that also has chain methods
      const result = Object.create(queryBuilder)
      result.then = async (resolve: (r: MockResponse) => void) => {
        const response = getResponse()
        requests.push({
          table: currentTable,
          method: currentMethod,
          chain: [...currentChain],
          args: { ...currentArgs },
        })
        currentChain = []
        currentArgs = {}
        resolve(response)
      }
      return result
    })
    return fn
  }

  // Query builder with all chain methods
  const queryBuilder: Record<string, ReturnType<typeof vi.fn>> = {
    // Filter methods (always chainable)
    eq: createChainMethod('eq'),
    neq: createChainMethod('neq'),
    in: createChainMethod('in'),
    gte: createChainMethod('gte'),
    lte: createChainMethod('lte'),
    gt: createChainMethod('gt'),
    lt: createChainMethod('lt'),
    not: createChainMethod('not'),
    is: createChainMethod('is'),
    ilike: createChainMethod('ilike'),
    like: createChainMethod('like'),
    or: createChainMethod('or'),
    and: createChainMethod('and'),
    filter: createChainMethod('filter'),
    match: createChainMethod('match'),
    contains: createChainMethod('contains'),
    containedBy: createChainMethod('containedBy'),

    // Modifier methods (chainable)
    order: createChainMethod('order'),
    limit: createChainMethod('limit'),
    range: createChainMethod('range'),

    // Terminal methods
    single: createTerminalMethod('single'),
    maybeSingle: createTerminalMethod('maybeSingle'),

    // Flex methods (can be terminal or chainable)
    select: createFlexMethod('select'),
    insert: createFlexMethod('insert'),
    update: createFlexMethod('update'),
    delete: createFlexMethod('delete'),
    upsert: createFlexMethod('upsert'),
  }

  // Make queryBuilder thenable for direct awaiting after filter methods
  const thenableQueryBuilder = new Proxy(queryBuilder, {
    get(target, prop) {
      if (prop === 'then') {
        return async (resolve: (r: MockResponse) => void) => {
          const response = getResponse()
          requests.push({
            table: currentTable,
            method: currentMethod,
            chain: [...currentChain],
            args: { ...currentArgs },
          })
          currentChain = []
          currentArgs = {}
          resolve(response)
        }
      }
      return target[prop as string]
    },
  })

  const client = {
    from: vi.fn((table: string) => {
      currentTable = table
      currentMethod = 'select'
      currentChain = []
      currentArgs = {}

      return {
        select: vi.fn((...args: unknown[]) => {
          currentMethod = 'select'
          currentArgs.select = args
          return thenableQueryBuilder
        }),
        insert: vi.fn((...args: unknown[]) => {
          currentMethod = 'insert'
          currentArgs.insert = args
          return thenableQueryBuilder
        }),
        update: vi.fn((...args: unknown[]) => {
          currentMethod = 'update'
          currentArgs.update = args
          return thenableQueryBuilder
        }),
        delete: vi.fn(() => {
          currentMethod = 'delete'
          return thenableQueryBuilder
        }),
        upsert: vi.fn((...args: unknown[]) => {
          currentMethod = 'insert'
          currentArgs.upsert = args
          return thenableQueryBuilder
        }),
      }
    }),
    rpc: vi.fn((fnName: string, args?: unknown) => {
      currentTable = `rpc:${fnName}`
      currentMethod = 'rpc'
      currentArgs = { fn: fnName, args }
      return thenableQueryBuilder
    }),
    auth: {
      admin: {
        createUser: vi.fn(),
        deleteUser: vi.fn(),
        updateUserById: vi.fn(),
        listUsers: vi.fn(),
      },
      getUser: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  }

  return {
    client,
    requests,

    /**
     * Configure responses for a specific table
     */
    mockTable: (tableName: string) => {
      const config: TableConfig = {
        responses: new Map(),
        defaultResponse: { data: null, error: null },
      }
      tables.set(tableName, config)

      const tableBuilder = {
        /**
         * Set response for select().single()
         */
        onSelectSingle: (data: unknown, error: unknown = null) => {
          config.responses.set('select.single', { data, error })
          return tableBuilder
        },
        /**
         * Set response for select() (list)
         */
        onSelect: (data: unknown[], error: unknown = null) => {
          config.responses.set('select', { data, error })
          return tableBuilder
        },
        /**
         * Set response for insert()
         */
        onInsert: (data: unknown = null, error: unknown = null) => {
          config.responses.set('insert', { data, error })
          return tableBuilder
        },
        /**
         * Set response for insert().select().single()
         */
        onInsertSelectSingle: (data: unknown, error: unknown = null) => {
          config.responses.set('insert.select.single', { data, error })
          return tableBuilder
        },
        /**
         * Set response for update()
         */
        onUpdate: (data: unknown = null, error: unknown = null) => {
          config.responses.set('update', { data, error })
          return tableBuilder
        },
        /**
         * Set response for delete()
         */
        onDelete: (error: unknown = null) => {
          config.responses.set('delete', { data: null, error })
          return tableBuilder
        },
        /**
         * Set default response for any operation on this table
         */
        default: (data: unknown = null, error: unknown = null) => {
          config.defaultResponse = { data, error }
          return tableBuilder
        },
      }

      return tableBuilder
    },

    /**
     * Get all requests made to a specific table
     */
    getRequests: (tableName?: string) => {
      if (tableName) {
        return requests.filter(r => r.table === tableName)
      }
      return requests
    },

    /**
     * Assert that a specific table was queried
     */
    assertCalled: (tableName: string, method?: MockMethod) => {
      const tableRequests = requests.filter(r => r.table === tableName)
      if (tableRequests.length === 0) {
        throw new Error(`Expected ${tableName} to be called, but it wasn't`)
      }
      if (method && !tableRequests.some(r => r.method === method)) {
        throw new Error(`Expected ${tableName}.${method}() to be called`)
      }
    },

    /**
     * Reset all mocks and configurations
     */
    reset: () => {
      requests.length = 0
      tables.clear()
      currentTable = ''
      currentChain = []
      currentArgs = {}
      vi.clearAllMocks()
    },
  }
}

// Export a singleton for tests to use
export const mockSupabase = createMockSupabaseClient()

// Type for the mock client
export type MockSupabaseClient = ReturnType<typeof createMockSupabaseClient>
