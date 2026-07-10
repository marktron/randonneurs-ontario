/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { EventControlsManager } from '@/components/admin/event-controls-manager'
import type { AdminEventControl } from '@/lib/actions/event-controls'
import type { OrganizerContact } from '@/lib/actions/event-organizer'

const mockSaveEventControls = vi.fn()
const mockImportEventControlsFromRwgps = vi.fn()
const mockSaveEventOrganizer = vi.fn()

vi.mock('@/lib/actions/event-controls', () => ({
  saveEventControls: (...args: unknown[]) => mockSaveEventControls(...args),
  importEventControlsFromRwgps: (...args: unknown[]) => mockImportEventControlsFromRwgps(...args),
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
  mockSaveEventOrganizer.mockReset().mockResolvedValue({ success: true })
})

describe('EventControlsManager mount auto-load', () => {
  it('auto-imports from RWGPS on mount when there are no controls and a route is linked', async () => {
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })

    render(
      <EventControlsManager
        eventId="event-1"
        initialControls={[]}
        hasRwgpsRoute={true}
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
        initialOrganizer={emptyOrganizer}
      />
    )

    const row = controlNameInputs()[0].closest('tr')!
    const checkinsCell = within(row).getByText('Check-ins').closest('td')!
    expect(checkinsCell.className).toContain('hidden')
    expect(checkinsCell.className).toContain('sm:table-cell')
  })
})
