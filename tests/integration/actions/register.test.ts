import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Integration tests for registration actions.
 *
 * Note: Full database operation tests (event lookup, registration creation)
 * are covered in E2E tests because Supabase's chainable query builder is
 * complex to mock accurately. These tests focus on input validation logic.
 */

// Mock Supabase with a minimal implementation
const mockGetSupabaseAdmin = vi.fn(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => mockGetSupabaseAdmin(),
}))

// Mock BotID — default to human (not-bot), individual tests can override
const mockCheckBotId = vi.fn(async () => ({ isBot: false }))

vi.mock('botid/server', () => ({
  checkBotId: () => mockCheckBotId(),
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
    it('rejects ride date that is today', async () => {
      // Mocked time: 2025-01-01T12:00:00Z (07:00 EST)
      // Deadline for Jan 1 ride was Dec 31 at 20:00 EST — already past
      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-01',
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        'Registration for permanent rides closes at 8 p.m. Eastern the day before the ride'
      )
    })

    it('rejects tomorrow after 20:00 ET cutoff', async () => {
      // Set time to 2025-01-02T01:30:00Z = Jan 1 at 20:30 EST (past cutoff)
      vi.setSystemTime(new Date('2025-01-02T01:30:00Z'))

      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-02',
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe(
        'Registration for permanent rides closes at 8 p.m. Eastern the day before the ride'
      )
    })

    // Note: Tests for dates that pass the deadline check require route/chapter DB calls
    // which need more sophisticated mocking. These are covered by integration-real tests.
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
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
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })
  })
})

describe('spam guards', () => {
  beforeEach(() => {
    mockGetSupabaseAdmin.mockClear()
    mockCheckBotId.mockReset()
    mockCheckBotId.mockResolvedValue({ isBot: false })
  })

  describe('honeypot', () => {
    it('registerForEvent returns silent success and does not touch the database when honeypot is filled', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Spam',
        lastName: 'Bot',
        email: 'spam@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
        homepageUrl: 'https://spam.example.com',
      })

      expect(result).toEqual({ success: true })
      expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
      expect(mockCheckBotId).not.toHaveBeenCalled()
    })

    it('registerForPermanent returns silent success when honeypot is filled', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-01T12:00:00'))

      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-20',
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Spam',
        lastName: 'Bot',
        email: 'spam@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
        homepageUrl: 'x',
      })

      expect(result).toEqual({ success: true })
      expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
      vi.useRealTimers()
    })

    it('empty honeypot string does not trigger the guard', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Real',
        lastName: 'User',
        email: 'real@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
        homepageUrl: '',
      })

      // Proceeds to normal flow (which hits the mocked event-not-found path)
      expect(result.success).toBe(false)
      expect(mockCheckBotId).toHaveBeenCalled()
    })

    it('whitespace-only honeypot does not trigger the guard', async () => {
      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Real',
        lastName: 'User',
        email: 'real@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
        homepageUrl: '   ',
      })

      expect(result.success).toBe(false)
      expect(mockCheckBotId).toHaveBeenCalled()
    })
  })

  describe('BotID', () => {
    it('registerForEvent returns silent success when BotID flags request as bot', async () => {
      mockCheckBotId.mockResolvedValue({ isBot: true })

      const result = await registerForEvent({
        eventId: 'event-123',
        firstName: 'Stealth',
        lastName: 'Bot',
        email: 'stealth@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
      })

      expect(result).toEqual({ success: true })
      expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
    })

    it('registerForPermanent returns silent success when BotID flags request as bot', async () => {
      mockCheckBotId.mockResolvedValue({ isBot: true })
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-01T12:00:00'))

      const result = await registerForPermanent({
        routeId: 'route-123',
        eventDate: '2025-01-20',
        startTime: '08:00',
        direction: 'as_posted',
        firstName: 'Stealth',
        lastName: 'Bot',
        email: 'stealth@example.com',
        shareRegistration: false,
        emergencyContactName: 'Emergency Contact',
        emergencyContactPhone: '555-1234',
      })

      expect(result).toEqual({ success: true })
      expect(mockGetSupabaseAdmin).not.toHaveBeenCalled()
      vi.useRealTimers()
    })
  })
})
