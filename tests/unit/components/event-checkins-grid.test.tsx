/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventCheckinsGrid, type GridControl } from '@/components/admin/event-checkins-grid'
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

const controls: GridControl[] = [
  { id: 'ctrl-1', name: 'Start', distanceKm: 0, windowLabel: 'Sat 08:00 – Sat 08:30' },
  { id: 'ctrl-2', name: 'Control 2', distanceKm: 100, windowLabel: 'Sat 11:00 – Sat 14:00' },
]

function makeRider(overrides: Partial<AdminCheckinGridRider>): AdminCheckinGridRider {
  return {
    registrationId: 'reg-1',
    riderId: 'rider-1',
    riderName: 'Ada Lovelace',
    managementToken: 'tok-abc',
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
    accuracyM: 10,
    distanceToControlM: 5,
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
