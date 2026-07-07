/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { EventResultsManager } from '@/components/admin/event-results-manager'
import { updateResult } from '@/lib/actions/results'

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
      phone: null,
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

describe('EventResultsManager — flèche distance flooring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('floors decimal distances before sending to updateResult so Postgres INT does not reject them', async () => {
    vi.mocked(updateResult).mockResolvedValue({ success: true })

    const result: Result = {
      id: 'result-fleche-1',
      rider_id: 'rider-fleche',
      finish_time: '24:00:00',
      status: 'finished',
      team_name: 'Team Alpha',
      distance_km: 360,
      note: null,
      gpx_url: null,
      gpx_file_path: null,
      control_card_front_path: null,
      control_card_back_path: null,
      rider_notes: null,
      submitted_at: null,
      submission_token: null,
      riders: {
        id: 'rider-fleche',
        first_name: 'Fiona',
        last_name: 'Fleche',
        email: 'fiona@example.com',
      },
    }

    render(
      <EventResultsManager
        {...baseProps}
        eventType="fleche"
        registrations={[
          makeRegistration({
            riderId: 'rider-fleche',
            firstName: 'Fiona',
            lastName: 'Fleche',
          }),
        ]}
        results={[result]}
        firstTimeRiderIds={[]}
      />
    )

    const row = screen.getByText('Fiona Fleche').closest('tr')!
    const distanceInput = within(row).getByPlaceholderText('km') as HTMLInputElement

    fireEvent.change(distanceInput, { target: { value: '380.95' } })
    fireEvent.blur(distanceInput)

    await waitFor(() => {
      expect(vi.mocked(updateResult)).toHaveBeenCalled()
    })

    const [, payload] = vi.mocked(updateResult).mock.calls[0]
    expect(payload.distanceKm).toBe(380)
  })
})

describe('EventResultsManager — mobile card layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const finishedResult: Result = {
    id: 'result-mobile',
    rider_id: 'rider-mobile',
    finish_time: '10:30:00',
    status: 'finished',
    team_name: null,
    distance_km: 200,
    note: null,
    gpx_url: 'https://www.strava.com/activities/123',
    gpx_file_path: null,
    control_card_front_path: null,
    control_card_back_path: null,
    rider_notes: 'Great ride, thanks to the volunteers!',
    submitted_at: '2026-05-16T00:00:00Z',
    submission_token: null,
    riders: {
      id: 'rider-mobile',
      first_name: 'Mona',
      last_name: 'Mobile',
      email: 'mona@example.com',
    },
  }

  it('renders mobile-only field labels for the stacked card layout', () => {
    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-mobile', firstName: 'Mona', lastName: 'Mobile' }),
        ]}
        results={[finishedResult]}
        firstTimeRiderIds={[]}
      />
    )

    const row = screen.getByText('Mona Mobile').closest('tr')!
    for (const label of ['Status', 'Time', 'Evidence', 'Note']) {
      const el = within(row).getByText(label)
      expect(el.className).toContain('sm:hidden')
    }
    expect(within(row).getByText('Great ride, thanks to the volunteers!')).toBeTruthy()
  })

  it('hides empty Time, Evidence, and Note cells from the mobile card but keeps them on desktop', () => {
    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-empty', firstName: 'Edna', lastName: 'Empty' }),
        ]}
        firstTimeRiderIds={[]}
      />
    )

    const row = screen.getByText('Edna Empty').closest('tr')!
    const timeCell = within(row).getByPlaceholderText('HH:MM').closest('td')!
    const evidenceCell = within(row).getByText('Evidence').closest('td')!
    const noteCell = within(row).getByText('Note').closest('td')!

    for (const cell of [timeCell, evidenceCell, noteCell]) {
      expect(cell.className).toContain('hidden')
      expect(cell.className).toContain('sm:table-cell')
    }
  })

  it('shows the Time cell in the mobile card once the rider is marked finished', () => {
    render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-mobile', firstName: 'Mona', lastName: 'Mobile' }),
        ]}
        results={[finishedResult]}
        firstTimeRiderIds={[]}
      />
    )

    const row = screen.getByText('Mona Mobile').closest('tr')!
    const timeCell = within(row).getByPlaceholderText('HH:MM').closest('td')!
    expect(timeCell.className).toContain('flex')
    expect(timeCell.className).not.toContain('hidden')
  })

  it('hides the column header row on mobile', () => {
    const { container } = render(
      <EventResultsManager
        {...baseProps}
        registrations={[
          makeRegistration({ riderId: 'rider-1', firstName: 'Alex', lastName: 'Andrews' }),
        ]}
        firstTimeRiderIds={[]}
      />
    )

    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('hidden')
    expect(thead.className).toContain('sm:table-header-group')
  })
})

describe('EventResultsManager — rider phone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the rider phone number as a tel: link when present', () => {
    const reg = makeRegistration({
      riderId: 'rider-phone',
      firstName: 'Pat',
      lastName: 'Phone',
    })
    reg.riders!.phone = '416-555-1234'

    render(<EventResultsManager {...baseProps} registrations={[reg]} firstTimeRiderIds={[]} />)

    const row = screen.getByText('Pat Phone').closest('tr')!
    const link = within(row).getByText('416-555-1234')
    expect(link).toBeTruthy()
    expect(link.getAttribute('href')).toBe('tel:416-555-1234')
  })

  it('renders no phone line when the rider has no phone', () => {
    const reg = makeRegistration({
      riderId: 'rider-nophone',
      firstName: 'Quinn',
      lastName: 'Quiet',
    })

    render(<EventResultsManager {...baseProps} registrations={[reg]} firstTimeRiderIds={[]} />)

    const row = screen.getByText('Quinn Quiet').closest('tr')!
    expect(within(row).queryByText(/tel:/)).toBeNull()
  })
})
