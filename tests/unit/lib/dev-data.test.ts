import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { devData } from '@/lib/dev-data'

describe('devData', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    // Restore original NODE_ENV after each test
    vi.stubEnv('NODE_ENV', originalEnv as string)
  })

  describe('in development mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('returns data attributes with table and id', () => {
      const result = devData('awards', 123)
      expect(result).toEqual({
        'data-dev-table': 'awards',
        'data-dev-id': '123',
      })
    })

    it('converts numeric id to string', () => {
      const result = devData('events', 456)
      expect(result['data-dev-id']).toBe('456')
    })

    it('handles string ids', () => {
      const result = devData('riders', 'abc-def')
      expect(result['data-dev-id']).toBe('abc-def')
    })

    it('returns empty object when id is undefined', () => {
      const result = devData('awards', undefined)
      expect(result).toEqual({})
    })
  })

  describe('in production mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it('returns empty object', () => {
      const result = devData('awards', 123)
      expect(result).toEqual({})
    })

    it('returns empty object even with valid id', () => {
      const result = devData('events', 'event-123')
      expect(result).toEqual({})
    })
  })

  describe('in test mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
    })

    it('returns empty object', () => {
      const result = devData('awards', 123)
      expect(result).toEqual({})
    })
  })
})
