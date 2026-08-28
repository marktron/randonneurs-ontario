/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventCheckinsGrid, type GridControl } from '@/components/admin/event-checkins-grid'
import { formatCheckinDistanceLabel } from '@/lib/checkin-evidence'
import type { AdminCheckin, AdminCheckinGridRider } from '@/lib/actions/control-checkins'
import { toast } from 'sonner'

const mockAdminSetCheckin = vi.fn()
const mockAdminDeleteCheckin = vi.fn()

vi.mock('@/lib/actions/control-checkins', () => ({
  adminSetCheckin: (...args: unknown[]) => mockAdminSetCheckin(...args),
  adminDeleteCheckin: (...args: unknown[]) => mockAdminDeleteCheckin(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const mockCheckinMap = vi.fn((_props: unknown) => <div data-testid="checkin-map" />)
vi.mock('@/components/admin/checkin-map', () => ({
  CheckinMap: (props: unknown) => mockCheckinMap(props),
}))

const controls: GridControl[] = [
  {
    id: 'ctrl-1',
    name: 'Start',
    distanceKm: 0,
    windowLabel: 'Sat 08:00 – Sat 08:30',
    lat: 43.65,
    lng: -79.38,
    radiusM: 500,
  },
  {
    id: 'ctrl-2',
    name: 'Control 2',
    distanceKm: 100,
    windowLabel: 'Sat 11:00 – Sat 14:00',
    lat: null,
    lng: null,
    radiusM: 500,
  },
]

function makeRider(overrides: Partial<AdminCheckinGridRider>): AdminCheckinGridRider {
  return {
    registrationId: 'reg-1',
    riderId: 'rider-1',
    riderName: 'Ada Lovelace',
    managementToken: 'tok-abc',
    preRideDate: null,
    preRideStartTime: null,
    checkins: [],
    ...overrides,
  }
}

function makeCheckin(overrides: Partial<AdminCheckin>): AdminCheckin {
  return {
    id: 'checkin-1',
    controlId: 'ctrl-1',
    registrationId: 'reg-1',
    checkedInAt: '2026-06-06T12:32:00.000Z',
    receivedAt: '2026-06-06T12:32:05.000Z',
    method: 'gps',
    lat: 43.6501,
    lng: -79.3799,
    accuracyM: 10,
    distanceToControlM: 5,
    locationFailureReason: null,
    locationFailureStage: null,
    locationElapsedMs: null,
    locationContext: null,
    note: null,
    flags: {
      outOfRadius: false,
      noGps: false,
      early: false,
      late: false,
      lateSync: false,
    },
    ...overrides,
  }
}

describe('EventCheckinsGrid rider card link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('links each rider to their digital card page in a new tab', () => {
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({ managementToken: 'tok-abc' })]}
      />
    )

    const link = screen.getByRole('link', { name: /open ada lovelace's digital card/i })
    expect(link).toHaveAttribute('href', '/card/tok-abc')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('omits the card link when the rider has no management token', () => {
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({ managementToken: null })]}
      />
    )

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /digital card/i })).not.toBeInTheDocument()
  })
})

describe('EventCheckinsGrid correction dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the dialog naming the rider and control when a cell is clicked', async () => {
    const user = userEvent.setup()
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({})]}
      />
    )

    await user.click(screen.getAllByText('—')[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(/Ada Lovelace at Start/)).toBeInTheDocument()
    expect(screen.getByText('Add check-in')).toBeInTheDocument()
  })

  it('does not open the dialog when the event is submitted', async () => {
    const user = userEvent.setup()
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={true}
        controls={controls}
        riders={[makeRider({})]}
      />
    )

    await user.click(screen.getAllByText('—')[0])

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('errors and does not call adminSetCheckin when saving without a note', async () => {
    const user = userEvent.setup()
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({})]}
      />
    )

    await user.click(screen.getAllByText('—')[0])
    await user.type(screen.getByLabelText(/check-in time/i), '2026-06-06T08:30')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(toast.error).toHaveBeenCalledWith('A note explaining the correction is required')
    expect(mockAdminSetCheckin).not.toHaveBeenCalled()
  })

  it('calls adminSetCheckin with the right payload and closes on success', async () => {
    const user = userEvent.setup()
    mockAdminSetCheckin.mockResolvedValue({ success: true })

    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({})]}
      />
    )

    await user.click(screen.getAllByText('—')[0])
    await user.type(screen.getByLabelText(/check-in time/i), '2026-06-06T08:30')
    await user.type(screen.getByLabelText(/note/i), "Rider's phone died; receipt shows 08:30")
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    expect(mockAdminSetCheckin).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: 'evt-1',
        registrationId: 'reg-1',
        controlId: 'ctrl-1',
        note: "Rider's phone died; receipt shows 08:30",
      })
    )
    expect(toast.success).toHaveBeenCalledWith('Check-in saved')
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the delete button only when correcting an existing check-in', async () => {
    const user = userEvent.setup()
    const rider = makeRider({ checkins: [makeCheckin({ controlId: 'ctrl-1' })] })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    // ctrl-1 has an existing check-in — clicking it should show Delete.
    await user.click(screen.getByText('Sat 08:32'))
    expect(screen.getByRole('button', { name: /delete check-in/i })).toBeInTheDocument()
  })

  it('omits the delete button when adding a new check-in', async () => {
    const user = userEvent.setup()
    const rider = makeRider({ checkins: [makeCheckin({ controlId: 'ctrl-1' })] })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    // ctrl-2 has no check-in for this rider.
    const dashes = screen.getAllByText('—')
    await user.click(dashes[0])

    expect(screen.getByText('Add check-in')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete check-in/i })).not.toBeInTheDocument()
  })
})

describe('EventCheckinsGrid correction dialog map', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the map with rider and control coordinates for a GPS check-in', async () => {
    const user = userEvent.setup()
    const rider = makeRider({
      checkins: [makeCheckin({ controlId: 'ctrl-1', lat: 43.6501, lng: -79.3799, accuracyM: 12 })],
    })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    await user.click(screen.getByText('Sat 08:32'))

    expect(screen.getByTestId('checkin-map')).toBeInTheDocument()
    expect(mockCheckinMap).toHaveBeenCalledWith(
      expect.objectContaining({
        rider: { lat: 43.6501, lng: -79.3799, accuracyM: 12 },
        control: { lat: 43.65, lng: -79.38, radiusM: 500 },
      })
    )
    expect(screen.getByText(/gps fix recorded 5 m from the control/i)).toBeInTheDocument()
  })

  it('passes a null control to the map and notes missing coordinates when the control has none saved', async () => {
    const user = userEvent.setup()
    const rider = makeRider({
      checkins: [
        makeCheckin({
          controlId: 'ctrl-2',
          lat: 43.6501,
          lng: -79.3799,
          accuracyM: 12,
          distanceToControlM: null,
        }),
      ],
    })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    await user.click(screen.getByText('Sat 08:32'))

    expect(mockCheckinMap).toHaveBeenCalledWith(expect.objectContaining({ control: null }))
    expect(screen.getByText(/this control has no saved coordinates/i)).toBeInTheDocument()
  })

  it('shows a "no GPS fix" note and no map for a non-GPS check-in', async () => {
    const user = userEvent.setup()
    const rider = makeRider({
      checkins: [
        makeCheckin({
          controlId: 'ctrl-1',
          method: 'manual',
          lat: null,
          lng: null,
          accuracyM: null,
        }),
      ],
    })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    await user.click(screen.getByText('Sat 08:32'))

    expect(screen.getByText(/no gps fix was recorded for this check-in/i)).toBeInTheDocument()
    expect(screen.queryByTestId('checkin-map')).not.toBeInTheDocument()
  })

  it('shows the no-GPS cause, acquisition stage, timing, and context when recorded', async () => {
    const user = userEvent.setup()
    const rider = makeRider({
      checkins: [
        makeCheckin({
          controlId: 'ctrl-1',
          method: 'manual',
          lat: null,
          lng: null,
          accuracyM: null,
          locationFailureReason: 'timeout',
          locationFailureStage: 'high_accuracy',
          locationElapsedMs: 42150,
          locationContext: 'embedded',
        }),
      ],
    })
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[rider]}
      />
    )

    await user.click(screen.getByText('Sat 08:32'))

    expect(
      screen.getByText(
        'No GPS: Location timed out during the high-accuracy attempt after 42 s (embedded browser)'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/no gps fix was recorded for this check-in/i)).not.toBeInTheDocument()
  })

  it('renders no map and no GPS note in add-check-in mode', async () => {
    const user = userEvent.setup()
    render(
      <EventCheckinsGrid
        eventId="evt-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({})]}
      />
    )

    await user.click(screen.getAllByText('—')[0])

    expect(screen.getByText('Add check-in')).toBeInTheDocument()
    expect(screen.queryByTestId('checkin-map')).not.toBeInTheDocument()
    expect(screen.queryByText(/no gps fix was recorded/i)).not.toBeInTheDocument()
  })
})

describe('formatCheckinDistanceLabel', () => {
  it('formats sub-kilometre distances in metres', () => {
    expect(formatCheckinDistanceLabel(320, null)).toBe('GPS fix recorded 320 m from the control')
  })

  it('formats distances at or above a kilometre with one decimal', () => {
    expect(formatCheckinDistanceLabel(2400, null)).toBe('GPS fix recorded 2.4 km from the control')
  })

  it('rounds metres to the nearest whole number', () => {
    expect(formatCheckinDistanceLabel(319.6, null)).toBe('GPS fix recorded 320 m from the control')
  })

  it('appends accuracy when present', () => {
    expect(formatCheckinDistanceLabel(320, 25)).toBe(
      'GPS fix recorded 320 m from the control (±25 m accuracy)'
    )
  })

  it('omits accuracy when null', () => {
    expect(formatCheckinDistanceLabel(320, null)).toBe('GPS fix recorded 320 m from the control')
  })

  it('omits accuracy when zero or non-finite', () => {
    expect(formatCheckinDistanceLabel(320, 0)).toBe('GPS fix recorded 320 m from the control')
    expect(formatCheckinDistanceLabel(320, Number.NaN)).toBe(
      'GPS fix recorded 320 m from the control'
    )
  })

  it('exactly one kilometre is formatted in km', () => {
    expect(formatCheckinDistanceLabel(1000, null)).toBe('GPS fix recorded 1.0 km from the control')
  })
})

describe('EventCheckinsGrid mobile card layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('stacks rider rows into cards with a labelled line per control', () => {
    render(
      <EventCheckinsGrid
        eventId="event-1"
        eventSubmitted={false}
        controls={controls}
        riders={[makeRider({ checkins: [makeCheckin({})] })]}
      />
    )

    const row = screen.getByText('Ada Lovelace').closest('tr')!
    expect(row.className).toContain('block')
    expect(row.className).toContain('sm:table-row')

    const thead = row.closest('table')!.querySelector('thead')!
    expect(thead.className).toContain('hidden')
    expect(thead.className).toContain('sm:table-header-group')

    // Each control cell carries a mobile-only label with the control name and distance
    const startLabel = screen.getByText('Start · 0 km')
    expect(startLabel.className).toContain('sm:hidden')
    expect(screen.getByText('Control 2 · 100 km')).toBeTruthy()
  })
})
