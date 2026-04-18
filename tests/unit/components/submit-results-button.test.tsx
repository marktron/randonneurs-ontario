/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubmitResultsButton } from '@/components/admin/submit-results-button'

const mockSubmitEventResults = vi.fn()

vi.mock('@/lib/actions/events', () => ({
  submitEventResults: (...args: unknown[]) => mockSubmitEventResults(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react')
  return {
    ...actual,
    Loader2: () => <span data-testid="icon-loader" />,
    Send: () => <span data-testid="icon-send" />,
  }
})

describe('SubmitResultsButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses VP-facing copy for brevets', () => {
    render(
      <SubmitResultsButton
        eventId="event-1"
        eventName="Test Brevet"
        eventType="brevet"
        resultsCount={3}
      />
    )

    expect(
      screen.getByRole('button', { name: /Submit Results to VP of Brevet Administration/i })
    ).toBeTruthy()
  })

  it('uses finalize copy for permanents', async () => {
    const user = userEvent.setup()
    render(
      <SubmitResultsButton
        eventId="event-2"
        eventName="Test Permanent"
        eventType="permanent"
        resultsCount={1}
      />
    )

    const button = screen.getByRole('button', { name: /Finalize Results/i })
    expect(button).toBeTruthy()

    await user.click(button)

    expect(screen.getByText('Finalize Results?')).toBeTruthy()
    // No mention of VP or email for permanents
    expect(screen.queryByText(/VP of Brevet Administration/i)).toBeNull()
    expect(screen.queryByText(/email the results/i)).toBeNull()
  })
})
