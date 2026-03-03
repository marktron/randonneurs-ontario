/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Mock state
let mockSetSessionResult: { error: Error | null } = { error: null }
let mockUpdateUserResult: { error: Error | null } = { error: null }

const mockSetSession = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase-browser', () => ({
  createClient: vi.fn(() => ({
    auth: {
      setSession: mockSetSession,
      updateUser: mockUpdateUser,
    },
  })),
}))

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Import after mocks
import UpdatePasswordPage from '@/app/admin/update-password/page'

function setRecoveryHash(accessToken = 'test-access-token', refreshToken = 'test-refresh-token') {
  window.location.hash = `#access_token=${accessToken}&refresh_token=${refreshToken}&type=recovery`
}

function resetMockState() {
  mockSetSessionResult = { error: null }
  mockUpdateUserResult = { error: null }
  mockSetSession.mockResolvedValue(mockSetSessionResult)
  mockUpdateUser.mockResolvedValue(mockUpdateUserResult)
}

describe('UpdatePasswordPage', () => {
  let replaceStateSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    resetMockState()
    window.location.hash = ''
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
  })

  afterEach(() => {
    window.location.hash = ''
    replaceStateSpy.mockRestore()
  })

  describe('invalid recovery links', () => {
    it('shows invalid state when hash is empty', async () => {
      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
      })
    })

    it('shows invalid state when type is not recovery', async () => {
      window.location.hash = '#access_token=abc&refresh_token=xyz&type=signup'

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
      })
    })

    it('shows invalid state when access_token is missing', async () => {
      window.location.hash = '#refresh_token=xyz&type=recovery'

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
      })
    })

    it('shows invalid state when setSession fails', async () => {
      setRecoveryHash()
      mockSetSession.mockResolvedValueOnce({ error: new Error('Token expired') })

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(screen.getByText(/invalid or has expired/i)).toBeInTheDocument()
      })
    })
  })

  describe('valid recovery link', () => {
    it('calls setSession with tokens from hash', async () => {
      setRecoveryHash('my-access', 'my-refresh')

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(mockSetSession).toHaveBeenCalledWith({
          access_token: 'my-access',
          refresh_token: 'my-refresh',
        })
      })
    })

    it('clears the token from the URL bar after session is established', async () => {
      setRecoveryHash()

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(null, '', window.location.pathname)
      })
    })

    it('shows the new password form', async () => {
      setRecoveryHash()

      render(<UpdatePasswordPage />)

      await waitFor(() => {
        expect(screen.getByLabelText('New password')).toBeInTheDocument()
        expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /save new password/i })).toBeInTheDocument()
      })
    })
  })

  describe('form validation', () => {
    beforeEach(() => {
      setRecoveryHash()
    })

    it('shows error when password is shorter than 8 characters', async () => {
      const user = userEvent.setup()
      render(<UpdatePasswordPage />)

      await waitFor(() => screen.getByLabelText('New password'))

      await user.type(screen.getByLabelText('New password'), 'short')
      await user.type(screen.getByLabelText('Confirm new password'), 'short')
      await user.click(screen.getByRole('button', { name: /save new password/i }))

      await waitFor(() => {
        expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
      })
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup()
      render(<UpdatePasswordPage />)

      await waitFor(() => screen.getByLabelText('New password'))

      await user.type(screen.getByLabelText('New password'), 'password123')
      await user.type(screen.getByLabelText('Confirm new password'), 'different456')
      await user.click(screen.getByRole('button', { name: /save new password/i }))

      await waitFor(() => {
        expect(screen.getByText(/do not match/i)).toBeInTheDocument()
      })
      expect(mockUpdateUser).not.toHaveBeenCalled()
    })
  })

  describe('password submission', () => {
    beforeEach(() => {
      setRecoveryHash()
    })

    it('calls updateUser with the new password', async () => {
      const user = userEvent.setup()
      render(<UpdatePasswordPage />)

      await waitFor(() => screen.getByLabelText('New password'))

      await user.type(screen.getByLabelText('New password'), 'newpassword123')
      await user.type(screen.getByLabelText('Confirm new password'), 'newpassword123')
      await user.click(screen.getByRole('button', { name: /save new password/i }))

      await waitFor(() => {
        expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
      })
    })

    it('shows success message after password is updated', async () => {
      const user = userEvent.setup()
      render(<UpdatePasswordPage />)

      await waitFor(() => screen.getByLabelText('New password'))

      await user.type(screen.getByLabelText('New password'), 'newpassword123')
      await user.type(screen.getByLabelText('Confirm new password'), 'newpassword123')
      await user.click(screen.getByRole('button', { name: /save new password/i }))

      await waitFor(() => {
        expect(screen.getByText(/password updated/i)).toBeInTheDocument()
      })
    })

    it('shows the Supabase error message when updateUser fails', async () => {
      mockUpdateUser.mockResolvedValueOnce({ error: new Error('Password is too weak') })

      const user = userEvent.setup()
      render(<UpdatePasswordPage />)

      await waitFor(() => screen.getByLabelText('New password'))

      await user.type(screen.getByLabelText('New password'), 'newpassword123')
      await user.type(screen.getByLabelText('Confirm new password'), 'newpassword123')
      await user.click(screen.getByRole('button', { name: /save new password/i }))

      await waitFor(() => {
        expect(screen.getByText('Password is too weak')).toBeInTheDocument()
      })
    })
  })
})
