import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Integration tests for registration actions.
 *
 * Note: Full database operation tests (event lookup, registration creation)
 * are covered in E2E tests because Supabase's chainable query builder is
 * complex to mock accurately. These tests focus on input validation logic.
 */

// Mock Supabase with a minimal implementation
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
        })),
      })),
    })),
  })),
}))

// Mock Next.js cache
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Mock email sending
vi.mock('@/lib/email/send-registration-email', () => ({
  sendRegistrationConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Import after mocks are set up
import { registerForEvent, registerForPermanent } from '@/lib/actions/register'

describe('registerForEvent', () => {
  describe('validation', () => {
    it('returns error for missing eventId', async () => {
      const result = await registerForEvent({
        eventId: '',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error for empty firstName', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: '   ',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error for empty lastName', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Test',
        lastName: '   ',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error for empty email', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Test',
        lastName: 'User',
        email: '  ',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })
  })

  describe('event lookup', () => {
    it('returns error when event not found', async () => {
      // The mock returns null/error for single() by default
      const result = await registerForEvent({
        eventId: 'nonexistent',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Event not found')
    })
  })

  // Note: Tests for event status validation (scheduled, completed, cancelled)
  // require more sophisticated Supabase mocking. These are covered by E2E tests.
})

describe('registerForPermanent', () => {
  beforeEach(() => {
    // Mock current date to 2025-01-01 for consistent testing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T12:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('date validation', () => {
    it('returns error if date is less than 2 weeks in future', async () => {
      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-10', // Only 9 days from mocked date
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Permanent rides must be scheduled at least 2 weeks in advance')
    })

    it('returns error for date exactly 13 days out', async () => {
      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-14', // 13 days
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Permanent rides must be scheduled at least 2 weeks in advance')
    })

    // Note: Tests for dates 14+ days out require route/chapter DB calls
    // which need more sophisticated mocking. These are covered by E2E tests.
  })

  describe('validation', () => {
    it('returns error for missing required fields', async () => {
      const result = await registerForPermanent({
        routeId: '',
        eventDate: '2025-01-20',
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error for missing start time', async () => {
      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-20',
        startTime: '',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })
  })
})
