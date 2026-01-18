/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PermanentRegistrationForm } from '@/components/permanent-registration-form'
import type { ActiveRoute } from '@/lib/data/routes'

// Mock server actions
const mockRegisterForPermanent = vi.fn()
const mockCompleteRegistrationWithRider = vi.fn()

vi.mock('@/lib/actions/register', () => ({
  registerForPermanent: (...args: unknown[]) => mockRegisterForPermanent(...args),
  completeRegistrationWithRider: (...args: unknown[]) => mockCompleteRegistrationWithRider(...args),
}))

// Mock router
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}))

// Mock RiderMatchDialog
vi.mock('@/components/rider-match-dialog', () => ({
  RiderMatchDialog: ({
    open,
    onSelect,
  }: {
    open: boolean
    onSelect: (id: string | null) => void
  }) => {
    if (!open) return null
    return (
      <div data-testid="rider-match-dialog">
        <button onClick={() => onSelect('rider-1')}>Select Rider</button>
        <button onClick={() => onSelect(null)}>Create New</button>
      </div>
    )
  },
}))

// Mock date-fns
vi.mock('date-fns', async () => {
  const actual = await vi.importActual('date-fns')
  return {
    ...actual,
    format: vi.fn((date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }),
    addDays: vi.fn((date: Date, days: number) => {
      const result = new Date(date)
      result.setDate(result.getDate() + days)
      return result
    }),
    isBefore: vi.fn((date1: Date, date2: Date) => date1 < date2),
    startOfDay: vi.fn((date: Date) => {
      const result = new Date(date)
      result.setHours(0, 0, 0, 0)
      return result
    }),
  }
})

describe('PermanentRegistrationForm', () => {
  const mockRoutes: ActiveRoute[] = [
    {
      id: 'route-1',
      name: 'Toronto 200',
      slug: 'toronto-200',
      distanceKm: 200,
      chapterId: 'chapter-1',
      chapterName: 'Toronto',
    },
    {
      id: 'route-2',
      name: 'Ottawa 300',
      slug: 'ottawa-300',
      distanceKm: 300,
      chapterId: 'chapter-2',
      chapterName: 'Ottawa',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRegisterForPermanent.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders route selection field', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Look for the route picker trigger button by its placeholder text
      expect(screen.getByText(/search routes/i)).toBeInTheDocument()
    })

    it('renders date picker', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Look for the date picker trigger button by its placeholder text
      expect(screen.getByText(/select date/i)).toBeInTheDocument()
    })

    it('renders all form fields', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
    })

    it('loads saved data from localStorage on mount', () => {
      const savedData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        gender: 'male',
        shareRegistration: true,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '555-1234',
      }
      localStorage.setItem('ro-registration', JSON.stringify(savedData))

      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('shows error when route is not selected', async () => {
      const user = userEvent.setup()
      const { container } = render(<PermanentRegistrationForm routes={mockRoutes} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      // Emergency contact fields use generic labels, so query by id
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')

      // Click the submit button - uses "Schedule Permanent" text
      await user.click(screen.getByRole('button', { name: /schedule permanent/i }))

      await waitFor(() => {
        expect(screen.getByText(/please select a route/i)).toBeInTheDocument()
      })
    })

    // Note: Date selection uses Radix UI Popover + Calendar which are difficult to test
    // in happy-dom. Full date/route selection validation is covered by E2E tests.
  })

  describe('form submission', () => {
    // Note: Full form submission requires route and date selection via Radix UI components
    // (Popover, Command, Calendar) which are difficult to test in happy-dom.
    // Complete form submission flows are covered by E2E tests.

    it('does not submit without required route selection', async () => {
      const user = userEvent.setup()
      const { container } = render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Fill text fields but not route/date
      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      // Emergency contact fields use generic labels, so query by id
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')

      await user.click(screen.getByRole('button', { name: /schedule permanent/i }))

      // Should show route validation error, not call the server action
      await waitFor(() => {
        expect(screen.getByText(/please select a route/i)).toBeInTheDocument()
      })
      expect(mockRegisterForPermanent).not.toHaveBeenCalled()
    })
  })

  describe('route selection', () => {
    // Note: Route picker uses Radix UI Command/Popover - full interaction tested in E2E.

    it('renders route picker with provided routes', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Verify route picker trigger is rendered by looking for placeholder text
      expect(screen.getByText(/search routes/i)).toBeInTheDocument()
    })
  })

  describe('direction selection', () => {
    it('renders direction selector', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Verify direction select label is present
      expect(screen.getByText('Direction')).toBeInTheDocument()
    })
  })
})
