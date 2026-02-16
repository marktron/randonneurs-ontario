import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for admin user actions.
 *
 * These tests focus on:
 * 1. Permission checks (super admin only)
 * 2. Input validation
 * 3. Chapter admin requirements
 * 4. Error handling
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

    builder.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    builder.then = vi.fn((resolve) => {
      resolve({ data: null, error: null })
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  // Shared auth admin mocks
  const createUserMock = vi.fn().mockResolvedValue({
    data: { user: { id: 'new-user-id', email: 'new@example.com' } },
    error: null,
  })
  const deleteUserMock = vi.fn().mockResolvedValue({ error: null })
  const updateUserByIdMock = vi.fn().mockResolvedValue({ error: null })

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      auth: {
        admin: {
          createUser: createUserMock,
          deleteUser: deleteUserMock,
          updateUserById: updateUserByIdMock,
        },
      },
    })),
    __queryBuilder: queryBuilder,
    __createUserMock: createUserMock,
    __deleteUserMock: deleteUserMock,
    __updateUserByIdMock: updateUserByIdMock,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.then.mockReset()
      queryBuilder.then.mockImplementation((resolve) => {
        resolve({ data: null, error: null })
      })
      createUserMock.mockReset()
      createUserMock.mockResolvedValue({
        data: { user: { id: 'new-user-id', email: 'new@example.com' } },
        error: null,
      })
      deleteUserMock.mockReset()
      deleteUserMock.mockResolvedValue({ error: null })
      updateUserByIdMock.mockReset()
      updateUserByIdMock.mockResolvedValue({ error: null })
    },
    __mockAuthCreateSuccess: (userId: string) => {
      createUserMock.mockResolvedValueOnce({
        data: { user: { id: userId, email: 'new@example.com' } },
        error: null,
      })
    },
    __mockAuthCreateError: (error: unknown) => {
      createUserMock.mockResolvedValueOnce({
        data: null,
        error,
      })
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
    __mockDeleteSuccess: () => {
      queryBuilder.then.mockImplementationOnce((resolve) => {
        resolve({ data: null, error: null })
      })
    },
    __mockAuthDeleteSuccess: () => {
      deleteUserMock.mockResolvedValueOnce({ error: null })
    },
    __mockAuthDeleteError: (error: unknown) => {
      deleteUserMock.mockResolvedValueOnce({ error })
    },
    __mockAuthUpdateSuccess: () => {
      updateUserByIdMock.mockResolvedValueOnce({ error: null })
    },
    __mockAuthUpdateError: (error: unknown) => {
      updateUserByIdMock.mockResolvedValueOnce({ error })
    },
  }
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: 'admin-1',
    email: 'admin@test.com',
    name: 'Test Admin',
    role: 'super_admin',
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// Import after mocks
import {
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  resetAdminPassword,
} from '@/lib/actions/admin-users'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __createUserMock: ReturnType<typeof vi.fn>
  __deleteUserMock: ReturnType<typeof vi.fn>
  __updateUserByIdMock: ReturnType<typeof vi.fn>
  __reset: () => void
  __mockAuthCreateSuccess: (userId: string) => void
  __mockAuthCreateError: (error: unknown) => void
  __mockInsertSuccess: () => void
  __mockInsertError: (error: unknown) => void
  __mockUpdateSuccess: () => void
  __mockDeleteSuccess: () => void
  __mockAuthDeleteSuccess: () => void
  __mockAuthDeleteError: (error: unknown) => void
  __mockAuthUpdateSuccess: () => void
  __mockAuthUpdateError: (error: unknown) => void
}>('@/lib/supabase-server')

// Helper to mock requireAdmin with different roles
const mockRequireAdmin = await vi.importMock<{
  requireAdmin: ReturnType<typeof vi.fn>
}>('@/lib/auth/get-admin')

describe('createAdminUser', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    mockRequireAdmin.requireAdmin.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'super_admin',
    })
  })

  describe('permission checks', () => {
    it('returns error when chapter admin tries to create user', async () => {
      mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
        id: 'chapter-admin-1',
        email: 'chapter@test.com',
        role: 'chapter_admin',
      })

      const result = await createAdminUser({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
        role: 'admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('You do not have permission to create admin users')
    })

    it('returns error when regular admin tries to create user', async () => {
      mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
        id: 'admin-2',
        email: 'admin2@test.com',
        role: 'admin',
      })

      const result = await createAdminUser({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
        role: 'admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('You do not have permission to create admin users')
    })
  })

  describe('validation', () => {
    it('returns error for missing required fields', async () => {
      const result = await createAdminUser({
        email: '',
        name: 'New User',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Missing required fields')
    })

    it('returns error when chapter admin missing chapter', async () => {
      mockModule.__mockAuthCreateSuccess('new-user-id')

      const result = await createAdminUser({
        email: 'chapter@example.com',
        name: 'Chapter Admin',
        password: 'password123',
        role: 'chapter_admin',
        chapterId: null,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('Chapter admins must have a chapter assigned')
    })

    it('allows chapter admin with chapter assigned', async () => {
      mockModule.__mockAuthCreateSuccess('new-user-id')
      mockModule.__mockInsertSuccess()

      const result = await createAdminUser({
        email: 'chapter@example.com',
        name: 'Chapter Admin',
        password: 'password123',
        role: 'chapter_admin',
        chapterId: 'chapter-1',
      })

      expect(result.success).toBe(true)
    })
  })

  describe('error handling', () => {
    it('handles auth user creation failure', async () => {
      mockModule.__mockAuthCreateError({
        message: 'User already exists',
      })

      const result = await createAdminUser({
        email: 'existing@example.com',
        name: 'Existing User',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('rolls back auth user when admin record creation fails', async () => {
      mockModule.__mockAuthCreateSuccess('new-user-id')
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key',
      })

      const result = await createAdminUser({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('updateAdminUser', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    mockRequireAdmin.requireAdmin.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'super_admin',
    })
  })

  it('returns error when chapter admin tries to update', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'chapter-admin-1',
      role: 'chapter_admin',
    })

    const result = await updateAdminUser('user-1', {
      name: 'Updated Name',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to update admin users')
  })

  it('returns error when regular admin tries to update', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'admin-2',
      role: 'admin',
    })

    const result = await updateAdminUser('user-1', {
      name: 'Updated Name',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to update admin users')
  })

  it('returns error when chapter admin missing chapter', async () => {
    mockModule.__mockUpdateSuccess()

    const result = await updateAdminUser('user-1', {
      role: 'chapter_admin',
      chapterId: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Chapter admins must have a chapter assigned')
  })

  it('updates user successfully', async () => {
    mockModule.__mockUpdateSuccess()

    const result = await updateAdminUser('user-1', {
      name: 'Updated Name',
      phone: '555-1234',
    })

    expect(result.success).toBe(true)
  })
})

describe('deleteAdminUser', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    mockRequireAdmin.requireAdmin.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'super_admin',
    })
  })

  it('returns error when chapter admin tries to delete', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'chapter-admin-1',
      role: 'chapter_admin',
    })

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to delete admin users')
  })

  it('returns error when regular admin tries to delete', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'admin-2',
      role: 'admin',
    })

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to delete admin users')
  })

  it('returns error when trying to delete own account', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'admin-1',
      role: 'super_admin',
    })

    const result = await deleteAdminUser('admin-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You cannot delete your own account')
  })

  it('deletes user successfully', async () => {
    mockModule.__mockDeleteSuccess()
    mockModule.__mockAuthDeleteSuccess()

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(true)
  })

  it('handles auth deletion failure after admin record deleted', async () => {
    mockModule.__mockDeleteSuccess()
    mockModule.__mockAuthDeleteError({ message: 'Auth deletion failed' })

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Admin record deleted but auth user deletion failed')
  })
})

describe('resetAdminPassword', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    mockRequireAdmin.requireAdmin.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      role: 'super_admin',
    })
  })

  it('returns error when chapter admin tries to reset password', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'chapter-admin-1',
      role: 'chapter_admin',
    })

    const result = await resetAdminPassword('user-1', 'newpassword123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to reset passwords')
  })

  it('returns error when regular admin tries to reset password', async () => {
    mockRequireAdmin.requireAdmin.mockResolvedValueOnce({
      id: 'admin-2',
      role: 'admin',
    })

    const result = await resetAdminPassword('user-1', 'newpassword123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('You do not have permission to reset passwords')
  })

  it('returns error for password shorter than 8 characters', async () => {
    const result = await resetAdminPassword('user-1', 'short')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Password must be at least 8 characters')
  })

  it('resets password successfully', async () => {
    mockModule.__mockAuthUpdateSuccess()

    const result = await resetAdminPassword('user-1', 'newpassword123')

    expect(result.success).toBe(true)
  })

  it('handles auth update errors', async () => {
    mockModule.__mockAuthUpdateError({ message: 'Update failed' })

    const result = await resetAdminPassword('user-1', 'newpassword123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Failed to reset password')
  })
})
