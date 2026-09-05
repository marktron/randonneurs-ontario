/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EventControlsManager } from '@/components/admin/event-controls-manager'
import type { AdminEventControl } from '@/lib/actions/event-controls'
import type { OrganizerContact } from '@/lib/actions/event-organizer'
import { toast } from 'sonner'

const mockSaveEventControls = vi.fn()
const mockImportEventControlsFromRwgps = vi.fn()
const mockGetEventCollectionLegs = vi.fn()
const mockImportEventControlsFromRwgpsCollection = vi.fn()
const mockSaveEventOrganizer = vi.fn()

vi.mock('@/lib/actions/event-controls', () => ({
  saveEventControls: (...args: unknown[]) => mockSaveEventControls(...args),
  importEventControlsFromRwgps: (...args: unknown[]) => mockImportEventControlsFromRwgps(...args),
  getEventCollectionLegs: (...args: unknown[]) => mockGetEventCollectionLegs(...args),
  importEventControlsFromRwgpsCollection: (...args: unknown[]) =>
    mockImportEventControlsFromRwgpsCollection(...args),
}))

vi.mock('@/lib/actions/event-organizer', () => ({
  saveEventOrganizer: (...args: unknown[]) => mockSaveEventOrganizer(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

function makeSaved(overrides: Partial<AdminEventControl> = {}): AdminEventControl {
  return {
    id: 'ctrl-1',
    position: 1,
    name: 'Start',
    distanceKm: 0,
    lat: 43.65,
    lng: -79.38,
    radiusM: 500,
    notes: null,
    legRwgpsId: null,
    legName: null,
    checkinCount: 0,
    ...overrides,
  }
}

const importedTwo = [
  { name: 'Alpha', distanceKm: 0, lat: 43.6, lng: -79.4 },
  { name: 'Omega', distanceKm: 100, lat: null, lng: null },
]

function controlNameInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText('Control name') as HTMLInputElement[]
}

const emptyOrganizer: OrganizerContact = { name: '', phone: '', email: '' }

beforeEach(() => {
  mockSaveEventControls.mockReset().mockResolvedValue({ success: true })
  mockImportEventControlsFromRwgps.mockReset().mockResolvedValue({ success: true, data: [] })
  mockGetEventCollectionLegs.mockReset().mockResolvedValue({ success: true, data: [] })
  mockImportEventControlsFromRwgpsCollection
    .mockReset()
    .mockResolvedValue({ success: true, data: [] })
  mockSaveEventOrganizer.mockReset().mockResolvedValue({ success: true })
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

describe('EventControlsManager mount auto-load', () => {
  it('auto-imports from RWGPS on mount when there are no controls and a route is linked', async () => {
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })

    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[]}
        hasRwgpsRoute={true}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    await waitFor(() => expect(mockImportEventControlsFromRwgps).toHaveBeenCalledWith('event-1'))
    // Imported rows populate the (unsaved) table for review.
    await waitFor(() => expect(controlNameInputs().map((i) => i.value)).toEqual(['Alpha', 'Omega']))
    // Auto-load never auto-saves — the admin reviews and clicks Save.
    expect(mockSaveEventControls).not.toHaveBeenCalled()
  })

  it('does not auto-import when initial controls already exist', () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[makeSaved({ name: 'Start' })]}
        hasRwgpsRoute={true}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    expect(mockImportEventControlsFromRwgps).not.toHaveBeenCalled()
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Start'])
  })

  it('does not auto-import when the event has no RWGPS route', async () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    // Give any (unexpected) effect a chance to fire.
    await Promise.resolve()
    expect(mockImportEventControlsFromRwgps).not.toHaveBeenCalled()
  })
})

describe('EventControlsManager mobile card layout', () => {
  it('stacks control rows into labelled cards on mobile', () => {
    const { container } = render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[makeSaved({ name: 'Start', checkinCount: 3 })]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('hidden')
    expect(thead.className).toContain('sm:table-header-group')

    const row = controlNameInputs()[0].closest('tr')!
    expect(row.className).toContain('block')
    expect(row.className).toContain('sm:table-row')

    for (const label of ['Name', 'Km', 'Latitude', 'Longitude', 'Radius (m)', 'Notes']) {
      const el = within(row).getByText(label)
      expect(el.className).toContain('sm:hidden')
    }

    // Check-ins line is present because this control has recorded check-ins
    const checkinsCell = within(row).getByText('Check-ins').closest('td')!
    expect(checkinsCell.className).toContain('flex')
  })

  it('omits the check-ins line from the mobile card when a control has none', () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[makeSaved({ name: 'Start', checkinCount: 0 })]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    const row = controlNameInputs()[0].closest('tr')!
    const checkinsCell = within(row).getByText('Check-ins').closest('td')!
    expect(checkinsCell.className).toContain('hidden')
    expect(checkinsCell.className).toContain('sm:table-cell')
  })
})

const legsThree = [
  { legRwgpsId: '101', name: 'CCE 200 - Gravenhurst', distanceKm: 205.3 },
  { legRwgpsId: '102', name: 'CCE 300 - Haliburton', distanceKm: 302.1 },
  { legRwgpsId: '103', name: 'CCE Full Route', distanceKm: 2007.4 },
]

const importedLegControls = [
  {
    name: 'Alpha',
    distanceKm: 0,
    lat: 43.6,
    lng: -79.4,
    notes: null,
    legRwgpsId: '101',
    legName: 'Leg 1: CCE 200 - Gravenhurst',
  },
  {
    name: 'Beta',
    distanceKm: 205.3,
    lat: null,
    lng: null,
    notes: null,
    legRwgpsId: '101',
    legName: 'Leg 1: CCE 200 - Gravenhurst',
  },
  {
    name: 'Gamma',
    distanceKm: 0,
    lat: null,
    lng: null,
    notes: null,
    legRwgpsId: '102',
    legName: 'Leg 2: CCE 300 - Haliburton',
  },
]

function renderCollectionManager(initialControls: AdminEventControl[] = []) {
  return render(
    <EventControlsManager
      eventId="event-1"
      initialControls={initialControls}
      hasRwgpsRoute={false}
      hasRwgpsCollection={true}
      initialOrganizer={emptyOrganizer}
    />
  )
}

describe('EventControlsManager collection import', () => {
  it('never auto-imports on mount for collection events', async () => {
    renderCollectionManager()
    // Give any stray effect a tick to fire.
    await new Promise((r) => setTimeout(r, 0))
    expect(mockImportEventControlsFromRwgps).not.toHaveBeenCalled()
    expect(mockImportEventControlsFromRwgpsCollection).not.toHaveBeenCalled()
  })

  it('opens the leg dialog with all legs checked and imports the selected subset', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockResolvedValue({ success: true, data: legsThree })
    mockImportEventControlsFromRwgpsCollection.mockResolvedValue({
      success: true,
      data: importedLegControls,
    })

    renderCollectionManager()

    await user.click(screen.getByRole('button', { name: /import from rwgps/i }))
    await waitFor(() => expect(mockGetEventCollectionLegs).toHaveBeenCalledWith('event-1'))

    // All legs pre-checked (Radix Checkbox exposes state via data-state).
    const checks = await screen.findAllByRole('checkbox')
    expect(checks).toHaveLength(3)
    expect(checks.every((c) => c.getAttribute('data-state') === 'checked')).toBe(true)

    // Uncheck the combined route, then import the remaining two legs.
    await user.click(screen.getByLabelText(/CCE Full Route/))
    await user.click(screen.getByRole('button', { name: /import 2 legs/i }))

    await waitFor(() =>
      expect(mockImportEventControlsFromRwgpsCollection).toHaveBeenCalledWith('event-1', [
        '101',
        '102',
      ])
    )
    // Rows land grouped under leg headings.
    await screen.findByText('Leg 1: CCE 200 - Gravenhurst')
    screen.getByText('Leg 2: CCE 300 - Haliburton')
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('saves leg fields through to saveEventControls', async () => {
    const user = userEvent.setup()
    renderCollectionManager([
      makeSaved({
        id: 'c1',
        position: 1,
        name: 'Alpha',
        distanceKm: 0,
        legRwgpsId: '101',
        legName: 'Leg 1: CCE 200 - Gravenhurst',
      }),
    ])

    await user.click(screen.getByRole('button', { name: /save controls/i }))

    await waitFor(() =>
      expect(mockSaveEventControls).toHaveBeenCalledWith('event-1', [
        expect.objectContaining({
          name: 'Alpha',
          legRwgpsId: '101',
          legName: 'Leg 1: CCE 200 - Gravenhurst',
        }),
      ])
    )
  })

  it('per-leg Add control appends a row inheriting the leg, after that leg', async () => {
    const user = userEvent.setup()
    renderCollectionManager([
      makeSaved({
        id: 'c1',
        position: 1,
        name: 'Alpha',
        distanceKm: 0,
        legRwgpsId: '101',
        legName: 'Leg 1: CCE 200 - Gravenhurst',
      }),
      makeSaved({
        id: 'c2',
        position: 2,
        name: 'Gamma',
        distanceKm: 0,
        legRwgpsId: '102',
        legName: 'Leg 2: CCE 300 - Haliburton',
      }),
    ])

    await user.click(
      screen.getByRole('button', { name: 'Add control to Leg 1: CCE 200 - Gravenhurst' })
    )

    // New (empty) row sits between Alpha (leg 1) and Gamma (leg 2).
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Alpha', '', 'Gamma'])

    await user.type(controlNameInputs()[1], 'Newstop')
    // The new row needs a distance for parseRows to accept it; the Km input
    // has no accessible name on desktop, so target it by DOM order within
    // the new row (2nd control-name input's row).
    const newRow = controlNameInputs()[1].closest('tr')!
    const kmInput = within(newRow).getAllByRole('textbox')[1] as HTMLInputElement
    await user.type(kmInput, '210')
    await user.click(screen.getByRole('button', { name: /save controls/i }))
    await waitFor(() =>
      expect(mockSaveEventControls).toHaveBeenCalledWith(
        'event-1',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Newstop',
            legRwgpsId: '101',
            legName: 'Leg 1: CCE 200 - Gravenhurst',
          }),
        ])
      )
    )
  })

  it('closes the leg dialog with an error toast when loading the legs rejects', async () => {
    // Without a catch, a rejected action leaves the dialog stuck on
    // "Loading legs…" forever.
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockRejectedValue(new Error('network down'))

    renderCollectionManager()

    await user.click(screen.getByRole('button', { name: /import from rwgps/i }))

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/loading legs/i)).toBeNull())
  })

  it('keeps the dialog usable with an error toast when the collection import rejects', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockResolvedValue({ success: true, data: legsThree })
    mockImportEventControlsFromRwgpsCollection.mockRejectedValue(new Error('network down'))

    renderCollectionManager()

    await user.click(screen.getByRole('button', { name: /import from rwgps/i }))
    await screen.findAllByRole('checkbox')
    await user.click(screen.getByRole('button', { name: /import 3 legs/i }))

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled())
    // The import button recovers (no stuck spinner) so the admin can retry.
    expect(screen.getByRole('button', { name: /import 3 legs/i })).toBeEnabled()
  })
})

describe('EventControlsManager collapsible sections', () => {
  it('folds a populated controls table by default so the check-in grid is reachable', () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[makeSaved({ name: 'Oakville' })]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    expect(screen.getByRole('button', { name: 'Show Controls' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    // Folded, not unmounted — the rows keep their values for when it reopens.
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Oakville'])
    expect(screen.getByText('1 control')).toBeInTheDocument()
  })

  it('leaves the controls section open when there is nothing saved to fold', () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    expect(screen.getByRole('button', { name: 'Hide Controls' })).toHaveAttribute(
      'aria-expanded',
      'true'
    )
  })

  it('folds the ride organizer and names the saved organizer in its summary', () => {
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={{ name: 'Ada Lovelace', phone: '', email: '' }}
      />
    )

    expect(screen.getByRole('button', { name: 'Show Ride organizer' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('reopens the controls section on tap', async () => {
    const user = userEvent.setup()
    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[makeSaved({ name: 'Oakville' })]}
        hasRwgpsRoute={false}
        hasRwgpsCollection={false}
        initialOrganizer={emptyOrganizer}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Show Controls' }))

    expect(screen.getByRole('button', { name: 'Hide Controls' })).toBeInTheDocument()
    // Save folds away with the rest of the header actions, so reopening has
    // to bring it back.
    expect(
      screen.getByRole('button', { name: /save controls/i }).parentElement!.className
    ).not.toContain('hidden')
  })
})
