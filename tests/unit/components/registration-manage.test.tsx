/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegistrationManage } from '@/components/registration-manage'

// Mock server actions
const mockCancelRegistration = vi.fn()
const mockCreateEarlyResult = vi.fn()

vi.mock('@/lib/actions/manage-registration', () => ({
  cancelRegistration: (...args: unknown[]) => mockCancelRegistration(...args),
  createEarlyResult: (...args: unknown[]) => mockCreateEarlyResult(...args),
}))

// Mock router
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}))

// Mock lucide-react icons to avoid rendering issues
vi.mock('lucide-react', () => ({
  CalendarDays: () => <span data-testid="icon-calendar" />,
  MapPin: () => <span data-testid="icon-map" />,
  Clock: () => <span data-testid="icon-clock" />,
  XCircle: () => <span data-testid="icon-x" />,
  Send: () => <span data-testid="icon-send" />,
}))

describe('RegistrationManage', () => {
  const baseRegistration = {
    id: 'reg-1',
    status: 'registered',
    cancelled_at: null,
    management_token: 'test-token-123',
    is_team_captain: false,
  }

  const baseEvent = {
    id: 'event-1',
    slug: 'test-brevet-200-2026-04-01',
    status: 'scheduled',
    name: 'Test Brevet',
    event_date: '2026-04-01',
    start_time: '08:00',
    start_location: '123 Main St',
    distance_km: 200,
    event_type: 'brevet',
    chapter_name: 'Toronto',
    chapter_slug: 'toronto',
  }

  const baseRider = {
    first_name: 'Test',
    last_name: 'Rider',
    email: 'test@example.com',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCancelRegistration.mockResolvedValue({ success: true })
    mockCreateEarlyResult.mockResolvedValue({
      success: true,
      submissionToken: 'test-token-123',
    })
  })

  describe('rendering', () => {
    it('renders event details', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      expect(screen.getByText('Manage Registration')).toBeInTheDocument()
      expect(screen.getByText('Test Rider')).toBeInTheDocument()
      expect(screen.getByText('Test Brevet 200km')).toBeInTheDocument()
      expect(screen.getByText('123 Main St')).toBeInTheDocument()
    })

    it('shows only cancel button before event start', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      expect(screen.getByText('Cancel Registration', { selector: 'h3' })).toBeInTheDocument()
      expect(screen.queryByText('I rode')).not.toBeInTheDocument()
    })

    it('shows both cancel and submit buttons after event start', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={true}
        />
      )

      expect(screen.getByText('I rode')).toBeInTheDocument()
      expect(screen.getByText("I'm not riding")).toBeInTheDocument()
    })
  })

  describe('cancelled registration', () => {
    it('shows cancelled message and re-register link', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={{ ...baseRegistration, status: 'cancelled' }}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      expect(screen.getByText('Registration Cancelled')).toBeInTheDocument()
      expect(screen.getByText('Re-register for this event')).toBeInTheDocument()
      expect(
        screen.queryByText('Cancel Registration', { selector: 'button' })
      ).not.toBeInTheDocument()
    })
  })

  describe('cancelled event', () => {
    it('shows event cancelled message', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={{ ...baseEvent, status: 'cancelled' }}
          rider={baseRider}
          eventStarted={false}
        />
      )

      expect(screen.getByText('Event Cancelled')).toBeInTheDocument()
    })
  })

  describe('fleche team captain', () => {
    it('shows team warning for fleche team captain', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={{ ...baseRegistration, is_team_captain: true }}
          event={{ ...baseEvent, event_type: 'fleche' }}
          rider={baseRider}
          eventStarted={false}
        />
      )

      expect(screen.getByText(/team members/)).toBeInTheDocument()
    })
  })

  describe('cancel action', () => {
    it('calls cancelRegistration on confirm', async () => {
      const user = userEvent.setup()

      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      // Click cancel button to open dialog
      await user.click(screen.getByRole('button', { name: /cancel registration/i }))

      // Confirm in dialog (second button matching — the dialog action)
      const cancelButtons = screen.getAllByRole('button', { name: /cancel registration/i })
      await user.click(cancelButtons[cancelButtons.length - 1])

      await waitFor(() => {
        expect(mockCancelRegistration).toHaveBeenCalledWith('test-token-123')
      })
    })

    it('shows cancelled state after successful cancel', async () => {
      const user = userEvent.setup()

      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      await user.click(screen.getByRole('button', { name: /cancel registration/i }))
      await user.click(screen.getByRole('button', { name: /^cancel registration$/i }))

      await waitFor(() => {
        expect(screen.getByText('Registration Cancelled')).toBeInTheDocument()
      })
    })

    it('shows error on cancel failure', async () => {
      mockCancelRegistration.mockResolvedValue({
        success: false,
        error: 'Event is no longer open',
      })
      const user = userEvent.setup()

      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={false}
        />
      )

      await user.click(screen.getByRole('button', { name: /cancel registration/i }))
      await user.click(screen.getByRole('button', { name: /^cancel registration$/i }))

      await waitFor(() => {
        expect(screen.getByText('Event is no longer open')).toBeInTheDocument()
      })
    })
  })

  describe('submit results action', () => {
    it('calls createEarlyResult and redirects on success', async () => {
      const user = userEvent.setup()

      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={true}
        />
      )

      await user.click(screen.getByRole('button', { name: /submit results/i }))

      await waitFor(() => {
        expect(mockCreateEarlyResult).toHaveBeenCalledWith('test-token-123')
        expect(mockPush).toHaveBeenCalledWith('/results/submit/test-token-123')
      })
    })

    it('shows error on submit failure', async () => {
      mockCreateEarlyResult.mockResolvedValue({
        success: false,
        error: 'Event has not started yet',
      })
      const user = userEvent.setup()

      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={baseEvent}
          rider={baseRider}
          eventStarted={true}
        />
      )

      await user.click(screen.getByRole('button', { name: /submit results/i }))

      await waitFor(() => {
        expect(screen.getByText('Event has not started yet')).toBeInTheDocument()
      })
    })
  })

  describe('completed event', () => {
    it('shows submit results for completed event', () => {
      render(
        <RegistrationManage
          token="test-token-123"
          registration={baseRegistration}
          event={{ ...baseEvent, status: 'completed' }}
          rider={baseRider}
          eventStarted={true}
        />
      )

      expect(screen.getByText('I rode')).toBeInTheDocument()
      // No cancel button for completed events
      expect(screen.queryByText("I'm not riding")).not.toBeInTheDocument()
    })
  })
})
