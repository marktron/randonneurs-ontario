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
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
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
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      rpc: rpcMock,
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
    __rpcMock: rpcMock,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      queryBuilder.maybeSingle.mockReset()
      queryBuilder.maybeSingle.mockResolvedValue({ data: null, error: null })
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
      rpcMock.mockReset()
      rpcMock.mockResolvedValue({ data: null, error: null })
    },
    __mockExistingAuthUser: (userId: string) => {
      rpcMock.mockResolvedValueOnce({ data: userId, error: null })
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

vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
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
  __rpcMock: ReturnType<typeof vi.fn>
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
  __mockExistingAuthUser: (userId: string) => void
}>('@/lib/supabase-server')

// Helper to mock requireAdmin with different roles
const mockRequireAdmin = await vi.importMock<{
  requireAdmin: ReturnType<typeof vi.fn>
}>('@/lib/auth/get-admin')

const mockAuditLog = await vi.importMock<{
  logAuditEvent: ReturnType<typeof vi.fn>
}>('@/lib/audit-log')

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
      expect(mockModule.__deleteUserMock).toHaveBeenCalledWith('new-user-id')
    })
  })

  describe('promoting an existing (rider) auth user', () => {
    it('reuses the existing auth user instead of creating a new one', async () => {
      mockModule.__mockExistingAuthUser('rider-user-id')
      mockModule.__mockInsertSuccess()

      const result = await createAdminUser({
        email: 'Rider@Example.com',
        name: 'Rider Admin',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(true)
      expect(mockModule.__rpcMock).toHaveBeenCalledWith('auth_user_id_for_email', {
        p_email: 'rider@example.com',
      })
      expect(mockModule.__createUserMock).not.toHaveBeenCalled()
      expect(mockModule.__updateUserByIdMock).toHaveBeenCalledWith('rider-user-id', {
        password: 'password123',
        email_confirm: true,
      })
      expect(mockModule.__queryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'rider-user-id' })
      )
    })

    it('does not delete the existing auth user when the admin insert fails', async () => {
      mockModule.__mockExistingAuthUser('rider-user-id')
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key',
      })

      const result = await createAdminUser({
        email: 'rider@example.com',
        name: 'Rider Admin',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(mockModule.__deleteUserMock).not.toHaveBeenCalled()
    })

    it('refuses to promote an email that already belongs to an admin, without touching the account', async () => {
      mockModule.__mockExistingAuthUser('rider-user-id')
      mockModule.__queryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { id: 'rider-user-id' },
        error: null,
      })

      const result = await createAdminUser({
        email: 'rider@example.com',
        name: 'Rider Admin',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockModule.__updateUserByIdMock).not.toHaveBeenCalled()
      expect(mockModule.__queryBuilder.insert).not.toHaveBeenCalled()
    })

    it('records an audit entry if the admins insert still fails with a duplicate after the password was updated', async () => {
      mockModule.__mockExistingAuthUser('rider-user-id')
      mockModule.__queryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
      mockModule.__mockInsertError({
        code: '23505',
        message: 'duplicate key',
      })

      const result = await createAdminUser({
        email: 'rider@example.com',
        name: 'Rider Admin',
        password: 'password123',
        role: 'super_admin',
      })

      expect(result.success).toBe(false)
      expect(mockModule.__updateUserByIdMock).toHaveBeenCalledWith('rider-user-id', {
        password: 'password123',
        email_confirm: true,
      })
      expect(mockAuditLog.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          entityType: 'admin_user',
          entityId: 'rider-user-id',
          description: expect.stringContaining('Password reset on existing admin'),
        })
      )
    })

    it('still creates a new auth user and rolls it back on failure when no existing user is found', async () => {
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
      expect(mockModule.__rpcMock).toHaveBeenCalledWith('auth_user_id_for_email', {
        p_email: 'new@example.com',
      })
      expect(mockModule.__createUserMock).toHaveBeenCalled()
      expect(mockModule.__deleteUserMock).toHaveBeenCalledWith('new-user-id')
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
    expect(mockModule.__deleteUserMock).toHaveBeenCalledWith('user-1')
  })

  it('keeps the auth user when a rider is linked to it', async () => {
    // admins row lookup (name/email for the audit entry)
    mockModule.__queryBuilder.single.mockResolvedValueOnce({
      data: { name: 'Dual Role', email: 'dual@example.com' },
      error: null,
    })
    // riders lookup: this auth user is also a rider's sign-in
    mockModule.__queryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'rider-1', first_name: 'Dual', last_name: 'Role' },
      error: null,
    })
    mockModule.__mockDeleteSuccess()

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(true)
    // The admins row still goes...
    expect(mockModule.__queryBuilder.delete).toHaveBeenCalled()
    // ...but the shared auth user must survive, or the rider is signed out.
    expect(mockModule.__deleteUserMock).not.toHaveBeenCalled()
    expect(mockAuditLog.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        description:
          'Removed admin role from dual@example.com; account kept because it is linked to rider Dual Role',
      })
    )
  })

  it('deletes the auth user when no rider is linked', async () => {
    mockModule.__queryBuilder.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockModule.__mockDeleteSuccess()
    mockModule.__mockAuthDeleteSuccess()

    const result = await deleteAdminUser('user-1')

    expect(result.success).toBe(true)
    expect(mockModule.__deleteUserMock).toHaveBeenCalledWith('user-1')
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
