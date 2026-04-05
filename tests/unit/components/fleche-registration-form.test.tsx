/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FlecheRegistrationForm } from '@/components/fleche-registration-form'
import type { FlecheTeam } from '@/lib/data/events'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock server actions
vi.mock('@/lib/actions/register', () => ({
  registerForEvent: vi.fn(),
  completeRegistrationWithRider: vi.fn(),
}))

vi.mock('@/lib/actions/rider-results', () => ({
  getUpcomingEventsByEventId: vi.fn().mockResolvedValue({ success: true, data: [] }),
}))

vi.mock('@/components/rider-match-dialog', () => ({
  RiderMatchDialog: () => null,
}))

vi.mock('@/components/membership-error-modal', () => ({
  MembershipErrorModal: () => null,
}))

const emptyTeams: FlecheTeam[] = []

const existingTeams: FlecheTeam[] = [
  { teamName: 'Speed Demons', memberCount: 3, captain: 'Alice A.' },
  { teamName: 'Slow Rollers', memberCount: 5, captain: 'Bob B.' },
  { teamName: 'Night Owls', memberCount: 2, captain: null },
]

const defaultProps = {
  eventId: 'fleche-1',
  existingTeams: emptyTeams,
}

describe('FlecheRegistrationForm', () => {
  it('renders team section with create/join buttons', () => {
    render(<FlecheRegistrationForm {...defaultProps} />)

    expect(screen.getByText('Create team')).toBeInTheDocument()
    expect(screen.getByText('Join team')).toBeInTheDocument()
  })

  it('defaults to create mode when no existing teams', () => {
    render(<FlecheRegistrationForm {...defaultProps} existingTeams={emptyTeams} />)

    expect(screen.getByLabelText('Team name')).toBeInTheDocument()
  })

  it('defaults to join mode when existing teams are present', () => {
    render(<FlecheRegistrationForm {...defaultProps} existingTeams={existingTeams} />)

    expect(screen.getByText('Choose a team…')).toBeInTheDocument()
  })

  it('disables join button when no teams exist', () => {
    render(<FlecheRegistrationForm {...defaultProps} existingTeams={emptyTeams} />)

    const joinButton = screen.getByText('Join team')
    expect(joinButton).toBeDisabled()
  })

  it('shows team name input in create mode', async () => {
    const user = userEvent.setup()
    render(<FlecheRegistrationForm {...defaultProps} existingTeams={existingTeams} />)

    await user.click(screen.getByText('Create team'))
    expect(screen.getByLabelText('Team name')).toBeInTheDocument()
  })

  it('renders personal details fields', () => {
    render(<FlecheRegistrationForm {...defaultProps} />)

    expect(screen.getByLabelText('First name')).toBeInTheDocument()
    expect(screen.getByLabelText('Last name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByText('Emergency contact')).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /appear on the registered riders list/i })
    ).toBeInTheDocument()
  })

  it('renders fleche team helper text', () => {
    render(<FlecheRegistrationForm {...defaultProps} />)

    expect(screen.getByText(/Fleche teams have 3–5 riders/)).toBeInTheDocument()
  })

  it('shows card variant with title', () => {
    render(<FlecheRegistrationForm {...defaultProps} variant="card" />)

    // The h2 "Register" heading appears in card variant
    const heading = screen.getByRole('heading', { name: 'Register' })
    expect(heading).toBeInTheDocument()
  })
})
