import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for auth actions.
 *
 * These tests focus on validation logic. Full authentication flow testing
 * requires a running Supabase instance and is covered in E2E tests.
 */

// Track mock state
let mockUser: { id: string; email: string } | null = null
let mockSignInResult: { error: Error | null } = { error: null }
let mockUpdateResult: { error: Error | null } = { error: null }

// Mock Supabase server client
vi.mock('@/lib/supabase-server-client', () => ({
  createSupabaseServerClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: vi.fn(() => Promise.resolve({
        data: { user: mockUser },
        error: null,
      })),
      signInWithPassword: vi.fn(() => Promise.resolve({
        data: mockUser ? { user: mockUser } : null,
        error: mockSignInResult.error,
      })),
      updateUser: vi.fn(() => Promise.resolve({
        data: mockUser ? { user: mockUser } : null,
        error: mockUpdateResult.error,
      })),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'admin-1' }, error: null })),
        })),
      })),
    })),
  })),
}))

// Import after mocks are set up
import { changePassword } from '@/lib/actions/auth'

describe('changePassword', () => {
  beforeEach(() => {
    // Reset mock state
    mockUser = { id: 'user-123', email: 'admin@example.com' }
    mockSignInResult = { error: null }
    mockUpdateResult = { error: null }
  })

  describe('validation', () => {
    it('returns error for password shorter than 8 characters', async () => {
      const result = await changePassword('currentpass', 'short')

      expect(result.success).toBe(false)
      expect(result.error).toBe('New password must be at least 8 characters')
    })

    it('returns error for empty new password', async () => {
      const result = await changePassword('currentpass', '')

      expect(result.success).toBe(false)
      expect(result.error).toBe('New password must be at least 8 characters')
    })
  })

  describe('authentication', () => {
    it('returns error when user is not authenticated', async () => {
      mockUser = null

      const result = await changePassword('currentpass', 'newpassword123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })

    it('returns error when current password is incorrect', async () => {
      mockSignInResult = { error: new Error('Invalid credentials') }

      const result = await changePassword('wrongpassword', 'newpassword123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Current password is incorrect')
    })
  })

  describe('password update', () => {
    it('returns success when password is changed successfully', async () => {
      const result = await changePassword('currentpass', 'newpassword123')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('returns error when Supabase update fails', async () => {
      mockUpdateResult = { error: new Error('Update failed') }

      const result = await changePassword('currentpass', 'newpassword123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to update password')
    })
  })
})
