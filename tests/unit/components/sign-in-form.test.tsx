/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { requestSignInCode, verifySignInCode } = vi.hoisted(() => ({
  requestSignInCode: vi.fn(),
  verifySignInCode: vi.fn(),
}))
vi.mock('@/lib/actions/account', () => ({ requestSignInCode, verifySignInCode }))

const push = vi.fn()
const refresh = vi.fn()
let redirectParam: string | null = null
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
  useSearchParams: () => ({ get: (key: string) => (key === 'redirect' ? redirectParam : null) }),
}))

vi.mock('@/components/account/turnstile-field', () => ({ TurnstileField: () => null }))

import { SignInForm } from '@/components/account/sign-in-form'

describe('SignInForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    redirectParam = null
    requestSignInCode.mockResolvedValue({ success: true })
    verifySignInCode.mockResolvedValue({ success: true, data: { next: '/account' } })
  })

  it('asks for an email first, then a code', async () => {
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    await waitFor(() => expect(requestSignInCode).toHaveBeenCalledWith('r@example.com', undefined))
    expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument()
    expect(screen.getByText(/a code is on its way/i)).toBeInTheDocument()
  })

  it('shows the action error when sending fails', async () => {
    requestSignInCode.mockResolvedValue({ success: false, error: 'Enter a valid email address.' })
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
  })

  it('verifies the code and navigates to the safe redirect', async () => {
    redirectParam = '/account/settings'
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    const codeInput = await screen.findByLabelText(/6-digit code/i)
    fireEvent.change(codeInput, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(verifySignInCode).toHaveBeenCalledWith('r@example.com', '123456'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/account/settings'))
    expect(refresh).toHaveBeenCalled()
  })

  it('ignores the redirect param when linking needs another step', async () => {
    redirectParam = '/account/settings'
    verifySignInCode.mockResolvedValue({ success: true, data: { next: '/account/choose' } })
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    fireEvent.change(await screen.findByLabelText(/6-digit code/i), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/account/choose'))
  })

  it('lets the rider go back and change the email', async () => {
    render(<SignInForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'r@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /send code/i }))
    await screen.findByLabelText(/6-digit code/i)
    fireEvent.click(screen.getByRole('button', { name: /different email/i }))
    expect(screen.getByLabelText(/email/i)).toHaveValue('r@example.com')
  })
})
