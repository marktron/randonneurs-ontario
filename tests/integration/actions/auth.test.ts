import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for auth actions.
 *
 * These tests focus on validation logic. Full authentication flow testing
 * requires a running Supabase instance and is covered in E2E tests.
 */

// Track mock state
let mockUser: { id: string; email: string } | null = null
let mockSignInResult: {
  data: { user: { id: string; email: string } } | null
  error: Error | null
} = { data: null, error: null }
let mockUpdateResult: { error: Error | null } = { error: null }
let mockAdminRecord: { id: string } | null = { id: 'admin-1' }
let mockProfileUpdateResult: { error: Error | null } = { error: null }

// Mock Supabase server client
vi.mock('@/lib/supabase-server-client', () => ({
  createSupabaseServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn(() =>
          Promise.resolve({
            data: { user: mockUser },
            error: null,
          })
        ),
        signInWithPassword: vi.fn(() => Promise.resolve(mockSignInResult)),
        updateUser: vi.fn(() =>
          Promise.resolve({
            data: mockUser ? { user: mockUser } : null,
            error: mockUpdateResult.error,
          })
        ),
        signOut: vi.fn(() => Promise.resolve({ error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: mockAdminRecord,
                error: mockAdminRecord ? null : { code: 'PGRST116' },
              })
            ),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: mockProfileUpdateResult.error })),
        })),
      })),
    })
  ),
}))

// Import after mocks are set up
import { login, changePassword, updateProfile } from '@/lib/actions/auth'

// Helper to reset all mock state
function resetMockState() {
  mockUser = { id: 'user-123', email: 'admin@example.com' }
  mockSignInResult = { data: { user: { id: 'user-123', email: 'admin@example.com' } }, error: null }
  mockUpdateResult = { error: null }
  mockAdminRecord = { id: 'admin-1' }
  mockProfileUpdateResult = { error: null }
}

describe('login', () => {
  beforeEach(() => {
    resetMockState()
  })

  describe('successful login', () => {
    it('returns success when credentials are valid and user is an admin', async () => {
      const result = await login('admin@example.com', 'password123')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })
  })

  describe('authentication failures', () => {
    it('returns error when credentials are invalid', async () => {
      mockSignInResult = { data: null, error: new Error('Invalid credentials') }

      const result = await login('admin@example.com', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid credentials')
    })

    it('returns error when user data is not returned', async () => {
      // Supabase returns { data: { user: null } } when auth succeeds but no user returned
      mockSignInResult = {
        data: { user: null as unknown as { id: string; email: string } },
        error: null,
      }

      const result = await login('admin@example.com', 'password123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Login failed')
    })

    it('returns error when user is not an admin', async () => {
      mockAdminRecord = null

      const result = await login('user@example.com', 'password123')

      expect(result.success).toBe(false)
      expect(result.error).toBe('You do not have admin access')
    })
  })
})

describe('changePassword', () => {
  beforeEach(() => {
    resetMockState()
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
      mockSignInResult = { data: null, error: new Error('Invalid credentials') }

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

describe('updateProfile', () => {
  beforeEach(() => {
    resetMockState()
  })

  describe('validation', () => {
    it('returns error for empty name', async () => {
      const result = await updateProfile('', '555-1234', null)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Name is required')
    })

    it('returns error for whitespace-only name', async () => {
      const result = await updateProfile('   ', '555-1234', null)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Name is required')
    })
  })

  describe('authentication', () => {
    it('returns error when user is not authenticated', async () => {
      mockUser = null

      const result = await updateProfile('Admin Name', '555-1234', null)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('profile update', () => {
    it('returns success when profile is updated successfully', async () => {
      const result = await updateProfile('Admin Name', '555-1234', 'chapter-1')

      expect(result.success).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('returns success when phone is null', async () => {
      const result = await updateProfile('Admin Name', null, null)

      expect(result.success).toBe(true)
    })

    it('returns error when Supabase update fails', async () => {
      mockProfileUpdateResult = { error: new Error('Update failed') }

      const result = await updateProfile('Admin Name', '555-1234', null)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Failed to update profile')
    })
  })
})
