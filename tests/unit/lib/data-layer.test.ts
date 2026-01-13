import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests for permanent event filtering in the data layer.
 *
 * These tests verify that:
 * 1. Chapter calendars exclude permanent events
 * 2. Chapter results exclude permanent events
 * 3. Permanent results query by event_type instead of chapter_id
 */

// Track query chain calls
const queryCalls: { method: string; args: unknown[] }[] = []

// Create a chainable mock that tracks all method calls
const createChainableMock = (finalData: unknown = null, finalError: unknown = null) => {
  const chainable: Record<string, unknown> = {}

  const addMethod = (name: string) => {
    chainable[name] = vi.fn((...args: unknown[]) => {
      queryCalls.push({ method: name, args })
      return chainable
    })
  }

  // Filter methods
  ;['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'ilike', 'or', 'not'].forEach(addMethod)
  // Modifier methods
  ;['select', 'order', 'limit', 'range'].forEach(addMethod)

  // Terminal methods
  chainable.single = vi.fn(() => {
    queryCalls.push({ method: 'single', args: [] })
    return Promise.resolve({ data: finalData, error: finalError })
  })

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

      // Return different mocks based on table
      if (table === 'chapters') {
        return createChainableMock({ id: 'mock-chapter-id' })
      }
      if (table === 'events') {
        return createChainableMock([]) // Empty array for events
      }
      return createChainableMock()
    }),
  })),
}))

// Import after mocks
import { getEventsByChapter } from '@/lib/data/events'
import { getChapterResults, getAvailableYears } from '@/lib/data/results'

describe('Data Layer - Permanent Event Filtering', () => {
  beforeEach(() => {
    queryCalls.length = 0
    vi.clearAllMocks()
  })

  describe('getEventsByChapter', () => {
    it('excludes permanent events from chapter calendar', async () => {
      await getEventsByChapter('toronto')

      // Find calls after the events table was accessed
      const eventsFromIndex = queryCalls.findIndex(
        c => c.method === 'from' && c.args[0] === 'events'
      )
      const callsAfterEvents = queryCalls.slice(eventsFromIndex + 1)

      // Verify .neq('event_type', 'permanent') was called
      const neqCall = callsAfterEvents.find(c => c.method === 'neq')
      expect(neqCall).toBeDefined()
      expect(neqCall?.args).toEqual(['event_type', 'permanent'])
    })

    it('filters by chapter slug using join', async () => {
      await getEventsByChapter('toronto')

      const eventsFromIndex = queryCalls.findIndex(
        c => c.method === 'from' && c.args[0] === 'events'
      )
      const callsAfterEvents = queryCalls.slice(eventsFromIndex + 1)

      // Verify .eq('chapters.slug', ...) was called (join-based filtering)
      const eqCalls = callsAfterEvents.filter(c => c.method === 'eq')
      const chapterSlugCall = eqCalls.find(c => c.args[0] === 'chapters.slug')
      expect(chapterSlugCall).toBeDefined()
    })
  })

  describe('getChapterResults', () => {
    it('excludes permanent events from regular chapter results', async () => {
      await getChapterResults('toronto', 2026)

      const eventsFromIndex = queryCalls.findIndex(
        c => c.method === 'from' && c.args[0] === 'events'
      )
      const callsAfterEvents = queryCalls.slice(eventsFromIndex + 1)

      // Verify .neq('event_type', 'permanent') was called
      const neqCall = callsAfterEvents.find(c => c.method === 'neq')
      expect(neqCall).toBeDefined()
      expect(neqCall?.args).toEqual(['event_type', 'permanent'])
    })

    it('queries by event_type for permanent results page', async () => {
      await getChapterResults('permanent', 2026)

      const eventsFromIndex = queryCalls.findIndex(
        c => c.method === 'from' && c.args[0] === 'events'
      )
      const callsAfterEvents = queryCalls.slice(eventsFromIndex + 1)

      // Should query by event_type = 'permanent'
      const eqCalls = callsAfterEvents.filter(c => c.method === 'eq')
      const eventTypeCall = eqCalls.find(
        c => c.args[0] === 'event_type' && c.args[1] === 'permanent'
      )
      expect(eventTypeCall).toBeDefined()

      // Should NOT have neq filter
      const neqCall = callsAfterEvents.find(c => c.method === 'neq')
      expect(neqCall).toBeUndefined()
    })

    it('does not look up chapter for permanent results', async () => {
      await getChapterResults('permanent', 2026)

      // Check that chapters table was NOT queried
      const chaptersFromCall = queryCalls.find(
        c => c.method === 'from' && c.args[0] === 'chapters'
      )
      expect(chaptersFromCall).toBeUndefined()
    })
  })

  describe('getAvailableYears', () => {
    it('queries by event_type for permanent years', async () => {
      await getAvailableYears('permanent')

      const eventsFromIndex = queryCalls.findIndex(
        c => c.method === 'from' && c.args[0] === 'events'
      )
      const callsAfterEvents = queryCalls.slice(eventsFromIndex + 1)

      // Should query by event_type = 'permanent'
      const eqCalls = callsAfterEvents.filter(c => c.method === 'eq')
      const eventTypeCall = eqCalls.find(
        c => c.args[0] === 'event_type' && c.args[1] === 'permanent'
      )
      expect(eventTypeCall).toBeDefined()
    })

    it('does not look up chapter for permanent years', async () => {
      await getAvailableYears('permanent')

      const chaptersFromCall = queryCalls.find(
        c => c.method === 'from' && c.args[0] === 'chapters'
      )
      expect(chaptersFromCall).toBeUndefined()
    })
  })
})
