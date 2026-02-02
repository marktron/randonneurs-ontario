/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MembershipErrorModal } from '@/components/membership-error-modal'

describe('MembershipErrorModal', () => {
  it('renders no-membership variant with join message', () => {
    render(<MembershipErrorModal open={true} onClose={vi.fn()} variant="no-membership" />)

    expect(screen.getByText('Membership Required')).toBeInTheDocument()
    expect(screen.getByText(/join the club/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /join randonneurs ontario/i })).toHaveAttribute(
      'href',
      '/membership'
    )
  })

  it('renders trial-used variant with upgrade message', () => {
    render(<MembershipErrorModal open={true} onClose={vi.fn()} variant="trial-used" />)

    expect(screen.getByText('Trial Membership Used')).toBeInTheDocument()
    expect(screen.getByText(/trial membership has already been used/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /upgrade membership/i })).toHaveAttribute(
      'href',
      '/membership'
    )
  })

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<MembershipErrorModal open={true} onClose={onClose} variant="no-membership" />)

    // Click the specific "Close" button (not the dialog's built-in close button)
    const closeButtons = screen.getAllByRole('button', { name: /close/i })
    await user.click(closeButtons[closeButtons.length - 1])
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render when open is false', () => {
    render(<MembershipErrorModal open={false} onClose={vi.fn()} variant="no-membership" />)

    expect(screen.queryByText('Membership Required')).not.toBeInTheDocument()
  })
})
