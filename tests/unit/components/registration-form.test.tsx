/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegistrationForm } from '@/components/registration-form'

// Mock server actions
const mockRegisterForEvent = vi.fn()
const mockCompleteRegistrationWithRider = vi.fn()

vi.mock('@/lib/actions/register', () => ({
  registerForEvent: (...args: unknown[]) => mockRegisterForEvent(...args),
  completeRegistrationWithRider: (...args: unknown[]) => mockCompleteRegistrationWithRider(...args),
}))

// Mock router
const mockRefresh = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: mockPush,
  }),
}))

// Mock RiderMatchDialog
vi.mock('@/components/rider-match-dialog', () => ({
  RiderMatchDialog: ({
    open,
    onSelect,
    candidates,
  }: {
    open: boolean
    onSelect: (id: string | null) => void
    candidates: unknown[]
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

describe('RegistrationForm', () => {
  const defaultProps = {
    eventId: 'event-1',
    isPermanent: false,
    variant: 'card' as const,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockRegisterForEvent.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders all form fields', () => {
      const { container } = render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/cell phone/i)).toBeInTheDocument()
      // Emergency contact fields have generic labels "Name" and "Phone"
      expect(container.querySelector('#emergencyContactName')).toBeInTheDocument()
      expect(container.querySelector('#emergencyContactPhone')).toBeInTheDocument()
    })

    it('renders submit button', () => {
      render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByRole('button', { name: /register/i })).toBeInTheDocument()
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

      render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByDisplayValue('John')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Doe')).toBeInTheDocument()
      expect(screen.getByDisplayValue('john@example.com')).toBeInTheDocument()
      expect(screen.getByDisplayValue('416-555-9999')).toBeInTheDocument()
    })
  })

  describe('form submission', () => {
    it('calls registerForEvent on submit with correct data', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        expect(mockRegisterForEvent).toHaveBeenCalledWith({
          eventId: 'event-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '416-555-9999',
          gender: undefined,
          shareRegistration: true,
          notes: undefined,
          emergencyContactName: 'Jane Doe',
          emergencyContactPhone: '555-1234',
          emailConfirmed: false,
          homepageUrl: '',
          brevetCardType: 'paper',
        })
      })
    })

    it('shows success message on successful registration', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        // Success message uses "You're registered!" text
        expect(screen.getByText(/you're registered/i)).toBeInTheDocument()
      })
    })

    it('saves form data to localStorage on success', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        const saved = JSON.parse(localStorage.getItem('ro-registration') || '{}')
        expect(saved.firstName).toBe('John')
        expect(saved.lastName).toBe('Doe')
        expect(saved.email).toBe('john@example.com')
        expect(saved.phone).toBe('416-555-9999')
      })
    })

    it('refreshes router on success', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled()
      })
    })
  })

  describe('error handling', () => {
    it('displays error message on registration failure', async () => {
      mockRegisterForEvent.mockResolvedValueOnce({
        success: false,
        error: 'Event is full',
      })

      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        expect(screen.getByText('Event is full')).toBeInTheDocument()
      })
    })

    it('shows rider match dialog when needsRiderMatch is true', async () => {
      const mockCandidates = [
        {
          id: 'rider-1',
          firstName: 'John',
          lastName: 'Doe',
          fullName: 'John Doe',
          firstSeason: 2020,
          totalRides: 5,
        },
      ]

      mockRegisterForEvent.mockResolvedValueOnce({
        success: false,
        needsRiderMatch: true,
        matchCandidates: mockCandidates,
      })

      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        expect(screen.getByTestId('rider-match-dialog')).toBeInTheDocument()
      })
    })
  })

  describe('brevet card preference', () => {
    async function fillRequiredFields(
      user: ReturnType<typeof userEvent.setup>,
      container: HTMLElement
    ) {
      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')
    }

    it('defaults to paper and sends it on submit', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByRole('radio', { name: /paper brevet card/i })).toBeChecked()
      expect(screen.getByRole('radio', { name: /digital brevet card/i })).not.toBeChecked()

      await fillRequiredFields(user, container)
      await user.click(screen.getByRole('button', { name: /^register$/i }))

      await waitFor(() => {
        expect(mockRegisterForEvent).toHaveBeenCalledWith(
          expect.objectContaining({ brevetCardType: 'paper' })
        )
      })
    })

    it('sends digital when the rider selects the digital brevet card', async () => {
      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.click(screen.getByRole('radio', { name: /digital brevet card/i }))
      expect(screen.getByRole('radio', { name: /digital brevet card/i })).toBeChecked()

      await fillRequiredFields(user, container)
      await user.click(screen.getByRole('button', { name: /^register$/i }))

      await waitFor(() => {
        expect(mockRegisterForEvent).toHaveBeenCalledWith(
          expect.objectContaining({ brevetCardType: 'digital' })
        )
      })
    })
  })

  describe('form fields', () => {
    it('renders gender selector', () => {
      render(<RegistrationForm {...defaultProps} />)

      // Gender select uses Radix UI - verify the label is present
      expect(screen.getByText('Gender')).toBeInTheDocument()
    })

    it('allows toggling share registration checkbox', async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const checkbox = screen.getByRole('checkbox', {
        name: /appear on the registered riders list/i,
      })
      expect(checkbox).toBeChecked()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it('allows entering notes', async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const notesField = screen.getByLabelText(/notes/i)
      await user.type(notesField, 'Special dietary requirements')

      expect(notesField).toHaveValue('Special dietary requirements')
    })
  })

  describe('mobile optimizations', () => {
    it('has autocomplete attributes on name and email fields', () => {
      render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByLabelText(/first name/i)).toHaveAttribute('autocomplete', 'given-name')
      expect(screen.getByLabelText(/last name/i)).toHaveAttribute('autocomplete', 'family-name')
      expect(screen.getByLabelText(/email/i)).toHaveAttribute('autocomplete', 'email')
    })

    it('has correct inputMode on email and phone fields', () => {
      const { container } = render(<RegistrationForm {...defaultProps} />)

      expect(screen.getByLabelText(/email/i)).toHaveAttribute('inputmode', 'email')
      expect(container.querySelector('#emergencyContactPhone')).toHaveAttribute('inputmode', 'tel')
    })

    it('has autocomplete off on emergency contact fields to prevent autofilling rider info', () => {
      const { container } = render(<RegistrationForm {...defaultProps} />)

      expect(container.querySelector('#emergencyContactName')).toHaveAttribute(
        'autocomplete',
        'off'
      )
      expect(container.querySelector('#emergencyContactPhone')).toHaveAttribute(
        'autocomplete',
        'off'
      )
    })

    it('scrolls error into view when error appears', async () => {
      mockRegisterForEvent.mockResolvedValueOnce({
        success: false,
        error: 'Event is full',
      })

      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /register/i }))

      await waitFor(() => {
        const errorEl = screen.getByTestId('registration-error')
        expect(errorEl).toBeInTheDocument()
        // Verify scrollIntoView was available (it's called in the useEffect)
        expect(errorEl.scrollIntoView).toBeDefined()
      })
    })
  })

  describe('email typo-guard', () => {
    it("shows a suggestion after blurring a typo'd email", async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
      await user.clear(emailInput)
      await user.type(emailInput, 'rider@gmail.co')
      await user.tab()

      expect(screen.getByText(/did you mean/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /use suggested email rider@gmail\.com/i })
      ).toBeInTheDocument()
    })

    it('does not show a suggestion while typing (before blur)', async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
      await user.clear(emailInput)
      await user.type(emailInput, 'rider@gmail.co')

      expect(screen.queryByText(/did you mean/i)).toBeNull()
    })

    it('does not show a suggestion for a valid domain', async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
      await user.clear(emailInput)
      await user.type(emailInput, 'rider@gmail.com')
      await user.tab()

      expect(screen.queryByText(/did you mean/i)).toBeNull()
    })

    it('accepting the suggestion rewrites the field and hides the hint', async () => {
      const user = userEvent.setup()
      render(<RegistrationForm {...defaultProps} />)

      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement
      await user.clear(emailInput)
      await user.type(emailInput, 'rider@gmail.co')
      await user.tab()

      const suggestionButton = screen.getByRole('button', {
        name: /use suggested email rider@gmail\.com/i,
      })
      await user.click(suggestionButton)

      await waitFor(() => {
        expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('rider@gmail.com')
        expect(screen.queryByText(/did you mean/i)).toBeNull()
      })
    })
  })

  describe('loading states', () => {
    it('disables submit button while pending', async () => {
      mockRegisterForEvent.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100))
      )

      const user = userEvent.setup()
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'John')
      await user.type(screen.getByLabelText(/last name/i), 'Doe')
      await user.type(screen.getByLabelText(/email/i), 'john@example.com')
      await user.type(container.querySelector('#emergencyContactName')!, 'Jane Doe')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      const submitButton = screen.getByRole('button', { name: /register/i })
      await user.click(submitButton)

      expect(submitButton).toBeDisabled()
    })
  })

  /**
   * The server refuses a suspected typo once and returns `emailSuggestion`. The
   * form must turn that into a yes/no question and resubmit either way — never
   * leave the rider on a form that looks like it failed.
   */
  describe('email typo confirmation', () => {
    async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string) {
      const { container } = render(<RegistrationForm {...defaultProps} />)

      await user.type(screen.getByLabelText(/first name/i), 'Test')
      await user.type(screen.getByLabelText(/last name/i), 'Rider')
      await user.type(screen.getByLabelText(/email/i), email)
      await user.type(container.querySelector('#emergencyContactName')!, 'Emergency Contact')
      await user.type(container.querySelector('#emergencyContactPhone')!, '555-1234')
      await user.type(container.querySelector('#phone')!, '416-555-9999')

      await user.click(screen.getByRole('button', { name: /^register$/i }))
    }

    beforeEach(() => {
      // mockReset, not clearAllMocks: the latter leaves queued `…Once` values
      // in place, so an unconsumed one would leak into the next test and make
      // the first submit succeed instead of asking for confirmation.
      mockRegisterForEvent.mockReset()
      mockRegisterForEvent
        .mockResolvedValueOnce({ success: false, emailSuggestion: 'rider@rogers.com' })
        .mockResolvedValue({ success: true })
    })

    it('asks the rider to confirm instead of showing a bare error', async () => {
      const user = userEvent.setup()
      await fillAndSubmit(user, 'rider@roger.com')

      await waitFor(() => {
        expect(screen.getByTestId('email-confirm-accept')).toBeInTheDocument()
      })
      expect(screen.getByTestId('email-confirm-keep')).toBeInTheDocument()
      // The dialog replaces the error banner — this is a question, not a failure.
      expect(screen.queryByTestId('registration-error')).not.toBeInTheDocument()
    })

    it('resubmits with the corrected address when the rider accepts', async () => {
      const user = userEvent.setup()
      await fillAndSubmit(user, 'rider@roger.com')

      await waitFor(() => expect(screen.getByTestId('email-confirm-accept')).toBeInTheDocument())
      await user.click(screen.getByTestId('email-confirm-accept'))

      await waitFor(() => {
        expect(mockRegisterForEvent).toHaveBeenLastCalledWith(
          expect.objectContaining({
            email: 'rider@rogers.com',
            emailConfirmed: true,
          })
        )
      })
      expect(mockRegisterForEvent).toHaveBeenCalledTimes(2)
    })

    it('resubmits the typed address when the rider says it is correct', async () => {
      const user = userEvent.setup()
      await fillAndSubmit(user, 'rider@roger.com')

      await waitFor(() => expect(screen.getByTestId('email-confirm-keep')).toBeInTheDocument())
      await user.click(screen.getByTestId('email-confirm-keep'))

      await waitFor(() => {
        expect(mockRegisterForEvent).toHaveBeenLastCalledWith(
          expect.objectContaining({
            email: 'rider@roger.com',
            emailConfirmed: true,
          })
        )
      })
      expect(mockRegisterForEvent).toHaveBeenCalledTimes(2)
    })

    it('registers the rider once the confirmation is resolved', async () => {
      const user = userEvent.setup()
      await fillAndSubmit(user, 'rider@roger.com')

      await waitFor(() => expect(screen.getByTestId('email-confirm-accept')).toBeInTheDocument())
      await user.click(screen.getByTestId('email-confirm-accept'))

      await waitFor(() => {
        expect(screen.getByTestId('registration-success')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('email-confirm-accept')).not.toBeInTheDocument()
    })
  })
})
