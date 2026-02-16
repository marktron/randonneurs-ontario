import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for authentication and authorization.
 *
 * These tests focus on:
 * 1. Admin authentication
 * 2. Chapter admin scoping
 * 3. Permission checks
 * 4. Session handling
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server-client', () => {
  let mockUser: { id: string; email: string } | null = null
  let mockAdmin: unknown | null = null

  return {
    createSupabaseServerClient: vi.fn(() =>
      Promise.resolve({
        auth: {
          getUser: vi.fn(() =>
            Promise.resolve({
              data: { user: mockUser },
              error: null,
            })
          ),
        },
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() => Promise.resolve({ data: mockAdmin, error: null })),
            })),
          })),
        })),
      })
    ),
    __setMockUser: (user: { id: string; email: string } | null) => {
      mockUser = user
    },
    __setMockAdmin: (admin: unknown | null) => {
      mockAdmin = admin
    },
    __reset: () => {
      mockUser = null
      mockAdmin = null
    },
  }
})

// Import after mocks
import { getAdmin, requireAdmin } from '@/lib/auth/get-admin'

const mockModule = await vi.importMock<{
  __setMockUser: (user: { id: string; email: string } | null) => void
  __setMockAdmin: (admin: unknown | null) => void
  __reset: () => void
}>('@/lib/supabase-server-client')

describe('getAdmin', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('returns null when user is not authenticated', async () => {
    mockModule.__setMockUser(null)

    const result = await getAdmin()

    expect(result).toBeNull()
  })

  it('returns null when user has no admin record', async () => {
    mockModule.__setMockUser({ id: 'user-1', email: 'user@example.com' })
    mockModule.__setMockAdmin(null)

    const result = await getAdmin()

    expect(result).toBeNull()
  })

  it('returns admin when authenticated and has admin record', async () => {
    const mockAdmin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Test Admin',
      role: 'admin',
      chapter_id: null,
    }

    mockModule.__setMockUser({ id: 'admin-1', email: 'admin@example.com' })
    mockModule.__setMockAdmin(mockAdmin)

    const result = await getAdmin()

    expect(result).not.toBeNull()
    if (result) {
      expect(result.id).toBe('admin-1')
      expect(result.role).toBe('admin')
    }
  })

  it('returns chapter admin correctly', async () => {
    const mockAdmin = {
      id: 'chapter-admin-1',
      email: 'chapter@example.com',
      name: 'Chapter Admin',
      role: 'chapter_admin',
      chapter_id: 'chapter-1',
    }

    mockModule.__setMockUser({ id: 'chapter-admin-1', email: 'chapter@example.com' })
    mockModule.__setMockAdmin(mockAdmin)

    const result = await getAdmin()

    expect(result).not.toBeNull()
    if (result) {
      expect(result.role).toBe('chapter_admin')
      expect(result.chapter_id).toBe('chapter-1')
    }
  })
})

describe('requireAdmin', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('throws error when user is not authenticated', async () => {
    mockModule.__setMockUser(null)

    await expect(requireAdmin()).rejects.toThrow('Unauthorized')
  })

  it('throws error when user has no admin record', async () => {
    mockModule.__setMockUser({ id: 'user-1', email: 'user@example.com' })
    mockModule.__setMockAdmin(null)

    await expect(requireAdmin()).rejects.toThrow('Unauthorized')
  })

  it('returns admin when authenticated', async () => {
    const mockAdmin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Test Admin',
      role: 'admin',
      chapter_id: null,
    }

    mockModule.__setMockUser({ id: 'admin-1', email: 'admin@example.com' })
    mockModule.__setMockAdmin(mockAdmin)

    const result = await requireAdmin()

    expect(result).not.toBeNull()
    expect(result.id).toBe('admin-1')
  })
})

describe('Chapter Admin Scoping', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  it('chapter admin has chapter_id set', async () => {
    const mockAdmin = {
      id: 'chapter-admin-1',
      email: 'chapter@example.com',
      name: 'Chapter Admin',
      role: 'chapter_admin',
      chapter_id: 'chapter-1',
    }

    mockModule.__setMockUser({ id: 'chapter-admin-1', email: 'chapter@example.com' })
    mockModule.__setMockAdmin(mockAdmin)

    const result = await requireAdmin()

    expect(result.role).toBe('chapter_admin')
    expect(result.chapter_id).toBe('chapter-1')
  })

  it('super admin has no chapter_id', async () => {
    const mockAdmin = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Super Admin',
      role: 'super_admin',
      chapter_id: null,
    }

    mockModule.__setMockUser({ id: 'admin-1', email: 'admin@example.com' })
    mockModule.__setMockAdmin(mockAdmin)

    const result = await requireAdmin()

    expect(result.role).toBe('super_admin')
    expect(result.chapter_id).toBeNull()
  })
})
