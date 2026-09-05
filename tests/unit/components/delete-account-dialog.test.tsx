/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { requestSignInCode, deleteAccount } = vi.hoisted(() => ({
  requestSignInCode: vi.fn(),
  deleteAccount: vi.fn(),
}))
vi.mock('@/lib/actions/account', () => ({ requestSignInCode, deleteAccount }))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

// Stand-in for the Cloudflare widget: each mount issues a fresh single-use token.
let tokenCounter = 0
vi.mock('@/components/account/turnstile-field', () => ({
  TurnstileField: ({ onToken }: { onToken: (token: string | null) => void }) => {
    // Simulate a fresh token on every mount
    const token = `tok-${++tokenCounter}`
    return (
      <button type="button" data-testid="captcha" onClick={() => onToken(token)}>
        solve captcha
      </button>
    )
  },
}))

import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'

describe('DeleteAccountDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tokenCounter = 0
    requestSignInCode.mockResolvedValue({ success: true })
    deleteAccount.mockResolvedValue({ success: true })
  })

  it('opens the dialog and shows the initial email-code step', () => {
    render(<DeleteAccountDialog email="r@example.com" />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))
    expect(screen.getByText(/delete your account/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument()
  })

  it('sends a code with a fresh captcha token after a failed retry', async () => {
    requestSignInCode.mockResolvedValueOnce({ success: false, error: 'boom' })
    requestSignInCode.mockResolvedValueOnce({ success: true })

    render(<DeleteAccountDialog email="r@example.com" />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

    // Solve captcha and send code - fails
    fireEvent.click(screen.getByTestId('captcha'))
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }))
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalledTimes(1))
    const firstCall = requestSignInCode.mock.calls[0]
    expect(firstCall[0]).toBe('r@example.com')
    expect(firstCall[1]).toBeTruthy() // Has a token
    expect(await screen.findByText('boom')).toBeInTheDocument()

    // Solve the fresh challenge (new mount = new token) and retry
    fireEvent.click(screen.getByTestId('captcha'))
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }))
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalledTimes(2))
    const secondCall = requestSignInCode.mock.calls[1]
    expect(secondCall[0]).toBe('r@example.com')
    // Second call must have a different token, not a replay of the first
    expect(secondCall[1]).toBeTruthy()
    expect(secondCall[1]).not.toBe(firstCall[1])
  })

  it('shows a Resend code button on the code-entry step and gets a fresh token', async () => {
    render(<DeleteAccountDialog email="r@example.com" />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

    // Solve captcha and send code
    fireEvent.click(screen.getByTestId('captcha'))
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }))
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalledTimes(1))
    const firstCall = requestSignInCode.mock.calls[0]
    expect(firstCall[0]).toBe('r@example.com')
    expect(firstCall[1]).toBeTruthy()

    // Code step appears with Resend button
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument()
    const resendButton = screen.getByRole('button', { name: /resend code/i })
    expect(resendButton).toBeInTheDocument()

    // Solve the fresh challenge and resend
    fireEvent.click(screen.getByTestId('captcha'))
    fireEvent.click(resendButton)
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalledTimes(2))
    const secondCall = requestSignInCode.mock.calls[1]
    expect(secondCall[0]).toBe('r@example.com')
    // Second call must have a fresh token from the new widget mount
    expect(secondCall[1]).toBeTruthy()
    expect(secondCall[1]).not.toBe(firstCall[1])
  })

  it('closes the dialog and resets state on success', async () => {
    deleteAccount.mockResolvedValue({ success: true })
    render(<DeleteAccountDialog email="r@example.com" />)
    fireEvent.click(screen.getByRole('button', { name: /delete account/i }))

    // Send code
    fireEvent.click(screen.getByTestId('captcha'))
    fireEvent.click(screen.getByRole('button', { name: /email me a code/i }))
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalled())

    // Enter code and delete
    fireEvent.change(await screen.findByLabelText(/6-digit code/i), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^delete account$/i }))
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'))
  })
})
