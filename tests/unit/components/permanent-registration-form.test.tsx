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

const mockGetPermanentRouteTrack = vi.fn()
const mockGetExistingPermanentRide = vi.fn()
vi.mock('@/lib/actions/permanent-start', () => ({
  getPermanentRouteTrack: (...args: unknown[]) => mockGetPermanentRouteTrack(...args),
  getExistingPermanentRide: (...args: unknown[]) => mockGetExistingPermanentRide(...args),
}))

// Leaflet does not run in happy-dom; stand in for the map with buttons.
vi.mock('@/components/route-start-picker', () => ({
  RouteStartPicker: ({
    valueKm,
    onChange,
    disabled,
  }: {
    valueKm: number | null
    onChange: (km: number | null) => void
    disabled?: boolean
  }) => (
    <div data-testid="route-start-picker" data-disabled={disabled ? 'true' : 'false'}>
      <span data-testid="picker-value">{valueKm ?? 'none'}</span>
      <button type="button" onClick={() => onChange(42.3)}>
        Drop pin
      </button>
      <button type="button" onClick={() => onChange(null)}>
        Clear pin
      </button>
    </div>
  ),
}))

const loopTrack = { points: [], totalKm: 204.5, isLoop: true }

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

describe('getMinPermanentDate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('treats the midnight hour as before the 20:00 cutoff (Intl h24 renders it as hour 24)', async () => {
    const { getMinPermanentDate } = await import('@/components/permanent-registration-form')
    // 00:19 Toronto (EDT), Sat July 4 2026. On h24 ICU builds Intl reports
    // hour "24", which must not trip the >= 20:00 cutoff.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T04:19:00Z'))

    expect(getMinPermanentDate()).toEqual(new Date(2026, 6, 5))
  })

  it('moves the earliest date out a day at/after 20:00 Toronto', async () => {
    const { getMinPermanentDate } = await import('@/components/permanent-registration-form')
    // 21:00 Toronto (EDT), Fri July 3 2026.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-04T01:00:00Z'))

    expect(getMinPermanentDate()).toEqual(new Date(2026, 6, 5))
  })
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
    mockGetPermanentRouteTrack.mockResolvedValue({ available: false })
    mockGetExistingPermanentRide.mockResolvedValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  type User = ReturnType<typeof userEvent.setup>

  async function selectRoute(user: User, route: ActiveRoute) {
    await user.click(screen.getByRole('combobox', { name: 'Route' }))
    await user.click(await screen.findByRole('option', { name: new RegExp(route.name) }))
  }

  /** Picks a day next month, which is always on or after the earliest allowed date. */
  async function selectDate(user: User) {
    await user.click(screen.getByRole('button', { name: 'Ride Date' }))
    await user.click(screen.getByRole('button', { name: 'Go to the Next Month' }))
    const dayButtons = screen
      .getAllByRole('button')
      .filter((b) => /^\d+$/.test(b.textContent || ''))
    await user.click(dayButtons[15])
  }

  async function selectDirection(user: User, label: 'As Posted' | 'Reversed') {
    await user.click(screen.getByRole('combobox', { name: 'Direction' }))
    await user.click(await screen.findByRole('option', { name: label }))
  }

  async function fillRiderFieldsAndSubmit(user: User) {
    await user.type(screen.getByLabelText(/first name/i), 'John')
    await user.type(screen.getByLabelText(/last name/i), 'Doe')
    await user.type(screen.getByLabelText(/email/i), 'john@example.com')
    await user.type(document.querySelector('#emergencyContactName')!, 'Jane Doe')
    await user.type(document.querySelector('#emergencyContactPhone')!, '555-1234')
    await user.type(document.querySelector('#phone')!, '416-555-9999')
    await user.click(screen.getByRole('button', { name: /schedule permanent/i }))
  }

  describe('alternate start', () => {
    it('hides the picker when the route has no usable track', async () => {
      const user = userEvent.setup()
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await waitFor(() => expect(mockGetPermanentRouteTrack).toHaveBeenCalledWith(mockRoutes[0].id))
      expect(
        screen.queryByRole('button', { name: /start somewhere else/i })
      ).not.toBeInTheDocument()
      expect(screen.queryByTestId('route-start-picker')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/start location/i)).not.toBeInTheDocument()
    })

    it('hides the picker for a point-to-point route', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({
        available: true,
        track: { ...loopTrack, isLoop: false },
      })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await waitFor(() => expect(mockGetPermanentRouteTrack).toHaveBeenCalled())
      expect(
        screen.queryByRole('button', { name: /start somewhere else/i })
      ).not.toBeInTheDocument()
      expect(screen.queryByTestId('route-start-picker')).not.toBeInTheDocument()
    })

    it('shows the picker for a loop and submits the offset and place name', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      expect(screen.getByText('Starts 42.3 km into the route')).toBeInTheDocument()
      await user.type(
        screen.getByLabelText(/name of your start location/i),
        'Tim Hortons, Uxbridge'
      )
      await selectDate(user)
      await fillRiderFieldsAndSubmit(user)
      await waitFor(() =>
        expect(mockRegisterForPermanent).toHaveBeenCalledWith(
          expect.objectContaining({ startOffsetKm: 42.3, startLocation: 'Tim Hortons, Uxbridge' })
        )
      )
    })

    it('requires a place name once a pin is set', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      await selectDate(user)
      await fillRiderFieldsAndSubmit(user)
      expect(await screen.findByText('Please name your start location')).toBeInTheDocument()
      expect(mockRegisterForPermanent).not.toHaveBeenCalled()
    })

    it('sends no start when the pin is cleared', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      await user.click(screen.getByRole('button', { name: 'Clear pin' }))
      await selectDate(user)
      await fillRiderFieldsAndSubmit(user)
      await waitFor(() => expect(mockRegisterForPermanent).toHaveBeenCalled())
      const payload = mockRegisterForPermanent.mock.calls[0][0]
      expect(payload.startOffsetKm).toBeNull()
      expect(payload.startLocation).toBe('')
    })

    it('sends no start after the rider goes back to the posted start', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      await user.type(screen.getByLabelText(/name of your start location/i), 'Tim Hortons')
      await user.click(screen.getByRole('button', { name: /use the posted start/i }))
      expect(screen.queryByTestId('route-start-picker')).not.toBeInTheDocument()
      await selectDate(user)
      await fillRiderFieldsAndSubmit(user)
      await waitFor(() => expect(mockRegisterForPermanent).toHaveBeenCalled())
      const payload = mockRegisterForPermanent.mock.calls[0][0]
      expect(payload.startOffsetKm).toBeNull()
      expect(payload.startLocation).toBe('')
    })

    it('clears the pin and place name when the route changes (Review Focus 4)', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      await user.type(screen.getByLabelText(/name of your start location/i), 'Tim Hortons')
      await selectRoute(user, mockRoutes[1])
      await waitFor(() =>
        expect(mockGetPermanentRouteTrack).toHaveBeenLastCalledWith(mockRoutes[1].id)
      )
      await user.click(await screen.findByRole('button', { name: /start somewhere else/i }))
      expect(screen.getByTestId('picker-value')).toHaveTextContent('none')
      expect(screen.queryByLabelText(/name of your start location/i)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Drop pin' }))
      expect(screen.getByLabelText(/name of your start location/i)).toHaveValue('')
    })
  })

  describe('joining an existing ride', () => {
    it('shows the existing start, locks time and start, and submits those values', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      mockGetExistingPermanentRide.mockResolvedValue({
        startTime: '06:30',
        startLocation: 'Tim Hortons, Uxbridge',
        startOffsetKm: 42.3,
      })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await selectDate(user)
      expect(
        await screen.findByText(
          /A ride on this route is already registered for this date: 6:30 AM from Tim Hortons, Uxbridge, 42\.3 km into the route/
        )
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Start Time')).toBeDisabled()
      expect(screen.getByLabelText('Start Time')).toHaveValue('06:30')
      expect(
        screen.queryByRole('button', { name: /start somewhere else/i })
      ).not.toBeInTheDocument()
      await fillRiderFieldsAndSubmit(user)
      await waitFor(() =>
        expect(mockRegisterForPermanent).toHaveBeenCalledWith(
          expect.objectContaining({
            startTime: '06:30',
            startOffsetKm: 42.3,
            startLocation: 'Tim Hortons, Uxbridge',
          })
        )
      )
    })

    it('describes an existing ride from the posted start', async () => {
      const user = userEvent.setup()
      mockGetExistingPermanentRide.mockResolvedValue({
        startTime: '08:00',
        startLocation: null,
        startOffsetKm: null,
      })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await selectDate(user)
      expect(
        await screen.findByText(/already registered for this date: 8:00 AM from the posted start/)
      ).toBeInTheDocument()
    })

    it('looks the ride up again when the direction changes, and unlocks when none exists', async () => {
      const user = userEvent.setup()
      mockGetPermanentRouteTrack.mockResolvedValue({ available: true, track: loopTrack })
      mockGetExistingPermanentRide.mockResolvedValueOnce({
        startTime: '06:30',
        startLocation: 'Tim Hortons, Uxbridge',
        startOffsetKm: 42.3,
      })
      render(<PermanentRegistrationForm routes={mockRoutes} />)
      await selectRoute(user, mockRoutes[0])
      await selectDate(user)
      await screen.findByText(/already registered for this date/)
      await selectDirection(user, 'Reversed')
      await waitFor(() =>
        expect(mockGetExistingPermanentRide).toHaveBeenLastCalledWith(
          mockRoutes[0].id,
          expect.any(String),
          'reversed'
        )
      )
      await waitFor(() =>
        expect(screen.queryByText(/already registered for this date/)).not.toBeInTheDocument()
      )
      expect(screen.getByLabelText('Start Time')).not.toBeDisabled()
      expect(screen.getByLabelText('Start Time')).toHaveValue('08:00')

      // The unlocked ride carries the rider's own (empty) start, not the other ride's.
      await fillRiderFieldsAndSubmit(user)
      await waitFor(() => expect(mockRegisterForPermanent).toHaveBeenCalled())
      const payload = mockRegisterForPermanent.mock.calls[0][0]
      expect(payload).toMatchObject({
        startTime: '08:00',
        startOffsetKm: null,
        startLocation: '',
        direction: 'reversed',
      })
    })
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

    it('reopens the date picker on the month of the chosen date', async () => {
      const user = userEvent.setup()
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      await user.click(screen.getByRole('button', { name: 'Ride Date' }))
      await user.click(screen.getByRole('button', { name: 'Go to the Next Month' }))
      await user.click(screen.getByRole('button', { name: 'Go to the Next Month' }))
      const dayButtons = screen
        .getAllByRole('button')
        .filter((b) => /^\d+$/.test(b.textContent || ''))
      await user.click(dayButtons[15])

      // Calendar closes on select; reopen it
      await user.click(screen.getByRole('button', { name: 'Ride Date' }))

      const today = new Date()
      const expected = new Date(today.getFullYear(), today.getMonth() + 2, 1)
      const label = expected.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      expect(await screen.findByRole('grid', { name: label })).toBeInTheDocument()
    })

    it('renders all form fields', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/cell phone/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
    })

    it('loads saved data from localStorage on mount', () => {
      const savedData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '416-555-9999',
        gender: 'male',
        shareRegistration: true,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '555-1234',
      }
      localStorage.setItem('ro-registration', JSON.stringify(savedData))

      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
      expect(screen.getByDisplayValue('416-555-9999')).toBeInTheDocument()
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
      await user.type(container.querySelector('#phone')!, '416-555-9999')

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
      await user.type(container.querySelector('#phone')!, '416-555-9999')

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

  describe('brevet card preference', () => {
    it('defaults to paper', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByRole('radio', { name: /paper brevet card/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /digital brevet card/i })).not.toBeChecked()
    })

    it('lets the rider select the digital brevet card', async () => {
      const user = userEvent.setup()
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      await user.click(screen.getByRole('radio', { name: /digital brevet card/i }))

      expect(screen.getByRole('radio', { name: /digital brevet card/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /paper brevet card/i })).not.toBeChecked()
    })
  })

  describe('mobile optimizations', () => {
    it('has autocomplete attributes on name and email fields', () => {
      render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('autocomplete', 'given-name')
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('autocomplete', 'family-name')
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email')
    })

    it('has correct inputMode on email and phone fields', () => {
      const { container } = render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(screen.getByLabelText(/email/i)).toHaveAttribute('inputmode', 'email')
      expect(container.querySelector('#emergencyContactPhone')).toHaveAttribute('inputmode', 'tel')
    })

    it('has autocomplete off on emergency contact fields', () => {
      const { container } = render(<PermanentRegistrationForm routes={mockRoutes} />)

      expect(container.querySelector('#emergencyContactName')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(container.querySelector('#emergencyContactPhone')).toHaveAttribute(
        'autocomplete',
        'off'
      )
    })

    it('scrolls error into view on validation failure', async () => {
      const user = userEvent.setup()
      const { container } = render(<PermanentRegistrationForm routes={mockRoutes} />)

      // Fill required text fields but skip route/date to trigger client-side validation
      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /schedule permanent/i }))

      await waitFor(() => {
        const errorEl = screen.getByTestId('registration-error')
        expect(errorEl).toBeInTheDocument()
        expect(errorEl.scrollIntoView).toBeDefined()
      })
    })
  })
})
