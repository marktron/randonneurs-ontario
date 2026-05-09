/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { EventResultsManager } from '@/components/admin/event-results-manager'

// Mock server actions used by the rider rows so the component renders cleanly
vi.mock('@/lib/actions/results', () => ({
  createResult: vi.fn(),
  updateResult: vi.fn(),
  deleteResult: vi.fn(),
  updateRegistrationTeamName: vi.fn(),
  adminCancelRegistration: vi.fn(),
  revalidateMembership: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// AddRiderDialog has its own complex dependencies — stub it out
vi.mock('@/components/admin/add-rider-dialog', () => ({
  AddRiderDialog: () => null,
}))

vi.mock('@/components/admin/submit-results-button', () => ({
  SubmitResultsButton: () => null,
}))

type Registration = Parameters<typeof EventResultsManager>[0]['registrations'][number]
type Result = Parameters<typeof EventResultsManager>[0]['results'][number]

function makeRegistration(
  overrides: Partial<Registration> & { riderId: string; firstName: string; lastName: string }
): Registration {
  const { riderId, firstName, lastName, ...rest } = overrides
  return {
    id: `reg-${riderId}`,
    rider_id: riderId,
    registered_at: '2026-04-01T00:00:00Z',
    status: 'registered',
    notes: null,
    team_name: null,
    is_team_captain: false,
    share_registration: true,
    riders: {
      id: riderId,
      first_name: firstName,
      last_name: lastName,
      email: `${firstName.toLowerCase()}@example.com`,
      emergency_contact_name: null,
      emergency_contact_phone: null,
      rider_memberships: [],
    },
    ...rest,
  } as Registration
}

const baseProps = {
  eventId: 'event-1',
  eventName: 'Test Brevet',
  eventDate: '2026-05-15',
  eventType: 'brevet',
  eventStatus: 'scheduled',
  isPastEvent: false,
  season: 2026,
  distanceKm: 200,
  cancelledRegistrations: [],
  results: [] as Result[],
}

describe('EventResultsManager — first event badge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the "First event" badge for riders in firstTimeRiderIds', () => {
    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-newbie', firstName: 'Nora', lastName: 'Newbie' }),
          makeRegistration({ riderId: 'rider-veteran', firstName: 'Vera', lastName: 'Veteran' }),
        ]}
        firstTimeRiderIds={['rider-newbie']}
      />
    )

    const newbieRow = screen.getByText('Nora Newbie').closest('tr')!
    const veteranRow = screen.getByText('Vera Veteran').closest('tr')!

    expect(within(newbieRow).getByText('First event')).toBeTruthy()
    expect(within(veteranRow).queryByText('First event')).toBeNull()
  })

  it('renders no badge when firstTimeRiderIds is empty', () => {
    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-1', firstName: 'Alex', lastName: 'Andrews' }),
        ]}
        firstTimeRiderIds={[]}
      />
    )

    expect(screen.queryByText('First event')).toBeNull()
  })

  it('renders the badge for a rider whose only result for this event is DNF', () => {
    // The page-level helper excludes DNS prior results — anything else (including
    // DNF for the *current* event) should still leave them flagged as first-time
    // because the current event's results are excluded from the prior-results check.
    const result: Result = {
      id: 'result-1',
      rider_id: 'rider-newbie',
      finish_time: null,
      status: 'dnf',
      team_name: null,
      distance_km: 200,
      note: null,
      gpx_url: null,
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      rider_notes: null,
      submitted_at: null,
      submission_token: null,
      riders: {
        id: 'rider-newbie',
        first_name: 'Nora',
        last_name: 'Newbie',
        email: 'nora@example.com',
      },
    }

    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-newbie', firstName: 'Nora', lastName: 'Newbie' }),
        ]}
        results={[result]}
        firstTimeRiderIds={['rider-newbie']}
      />
    )

    const row = screen.getByText('Nora Newbie').closest('tr')!
    expect(within(row).getByText('First event')).toBeTruthy()
  })
})

describe('EventResultsManager — membership badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Trial used" badge for incomplete: membership riders with a Trial Member entry for the season', () => {
    const reg = makeRegistration({
      riderId: 'rider-trial',
      firstName: 'Tara',
      lastName: 'Trial',
      status: 'incomplete: membership',
    })
    reg.riders!.rider_memberships = [{ membership_type: 'Trial Member', season: 2026 }]

    render(<EventResultsManager {...baseProps} registrations={[reg]} firstTimeRiderIds={[]} />)

    const row = screen.getByText('Tara Trial').closest('tr')!
    expect(within(row).getByText('Trial used')).toBeTruthy()
    expect(within(row).queryByText('Missing membership')).toBeNull()
  })

  it('shows "Missing membership" badge for incomplete: membership riders with no current-season membership', () => {
    const reg = makeRegistration({
      riderId: 'rider-nomemb',
      firstName: 'Nina',
      lastName: 'Nomemb',
      status: 'incomplete: membership',
    })

    render(<EventResultsManager {...baseProps} registrations={[reg]} firstTimeRiderIds={[]} />)

    const row = screen.getByText('Nina Nomemb').closest('tr')!
    expect(within(row).getByText('Missing membership')).toBeTruthy()
    expect(within(row).queryByText('Trial used')).toBeNull()
  })
})
