/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UserForm } from '@/components/admin/user-form'
import type { ChapterOptionWithSlug } from '@/types/ui'

// Mock server actions
const mockCreateAdminUser = vi.fn()
const mockUpdateAdminUser = vi.fn()

vi.mock('@/lib/actions/admin-users', () => ({
  createAdminUser: (...args: unknown[]) => mockCreateAdminUser(...args),
  updateAdminUser: (...args: unknown[]) => mockUpdateAdminUser(...args),
}))

// Mock router
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('UserForm', () => {
  const mockChapters: ChapterOptionWithSlug[] = [
    { id: 'chapter-1', name: 'Toronto', slug: 'toronto' },
    { id: 'chapter-2', name: 'Ottawa', slug: 'ottawa' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateAdminUser.mockResolvedValue({ success: true })
    mockUpdateAdminUser.mockResolvedValue({ success: true })
  })

  describe('create mode', () => {
    it('renders all form fields', () => {
      render(<UserForm chapters={mockChapters} mode="create" />)

      expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      // Role uses Radix UI Select - check label exists
      expect(screen.getByText('Role')).toBeInTheDocument()
    })

    // Note: Role and Chapter selection use Radix UI Select which is difficult to test
    // in happy-dom. The conditional chapter visibility is covered by E2E tests.

    it('calls createAdminUser on submit with default role', async () => {
      const user = userEvent.setup()
      render(<UserForm chapters={mockChapters} mode="create" />)

      await user.type(screen.getByLabelText(/^name$/i), 'Test Admin')
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')

      const submitButton = screen.getByRole('button', { name: /create user/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockCreateAdminUser).toHaveBeenCalledWith({
          email: 'admin@test.com',
          name: 'Test Admin',
          phone: null,
          password: 'password123',
          role: 'chapter_admin',
          chapterId: '',
        })
      })
    })

    it('shows error message on failure', async () => {
      mockCreateAdminUser.mockResolvedValueOnce({
        success: false,
        error: 'Email already exists',
      })

      const user = userEvent.setup()
      render(<UserForm chapters={mockChapters} mode="create" />)

      await user.type(screen.getByLabelText(/^name$/i), 'Test Admin')
      await user.type(screen.getByLabelText(/email/i), 'admin@test.com')
      await user.type(screen.getByLabelText(/password/i), 'password123')

      const submitButton = screen.getByRole('button', { name: /create user/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText('Email already exists')).toBeInTheDocument()
      })
    })
  })

  describe('edit mode', () => {
    const mockUser = {
      id: 'user-1',
      email: 'admin@test.com',
      name: 'Test Admin',
      phone: '555-1234',
      role: 'chapter_admin' as const,
      chapter_id: 'chapter-1',
    }

    it('pre-fills form with user data', () => {
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      expect(screen.getByDisplayValue('Test Admin')).toBeInTheDocument()
      expect(screen.getByDisplayValue('admin@test.com')).toBeInTheDocument()
      expect(screen.getByDisplayValue('555-1234')).toBeInTheDocument()
    })

    it('disables email field in edit mode', () => {
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      const emailInput = screen.getByLabelText(/email/i)
      expect(emailInput).toBeDisabled()
    })

    it('shows message that email cannot be changed', () => {
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      expect(screen.getByText(/email cannot be changed/i)).toBeInTheDocument()
    })

    it('hides password field in edit mode', () => {
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    })

    it('calls updateAdminUser on submit', async () => {
      const user = userEvent.setup()
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      await user.clear(screen.getByLabelText(/^name$/i))
      await user.type(screen.getByLabelText(/^name$/i), 'Updated Name')

      // Button says "Save Changes" in edit mode
      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockUpdateAdminUser).toHaveBeenCalledWith('user-1', {
          name: 'Updated Name',
          phone: '555-1234',
          role: 'chapter_admin',
          chapterId: 'chapter-1',
        })
      })
    })

    it('redirects to users page on success', async () => {
      const user = userEvent.setup()
      render(<UserForm chapters={mockChapters} user={mockUser} mode="edit" />)

      // Button says "Save Changes" in edit mode
      const submitButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/admin/users')
      })
    })
  })

  describe('validation', () => {
    it('requires name field', () => {
      render(<UserForm chapters={mockChapters} mode="create" />)

      const nameInput = screen.getByLabelText(/^name$/i)
      expect(nameInput).toBeRequired()
    })

    it('requires email field', () => {
      render(<UserForm chapters={mockChapters} mode="create" />)

      const emailInput = screen.getByLabelText(/email/i)
      expect(emailInput).toBeRequired()
    })

    it('requires password field in create mode', () => {
      render(<UserForm chapters={mockChapters} mode="create" />)

      const passwordInput = screen.getByLabelText(/password/i)
      expect(passwordInput).toBeRequired()
    })
  })
})
