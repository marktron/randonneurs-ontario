/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlCardsForm } from '@/components/admin/control-cards-form'
import type { CardRider } from '@/types/control-card'
import type { AdminEventControl } from '@/lib/actions/event-controls'
import { toast } from 'sonner'

const mockSaveEventControls = vi.fn()
const mockGetEventControlsForAdmin = vi.fn()
const mockImportEventControlsFromRwgps = vi.fn()
const mockGetEventCollectionLegs = vi.fn()
const mockImportEventControlsFromRwgpsCollection = vi.fn()

vi.mock('@/lib/actions/event-controls', () => ({
  saveEventControls: (...args: unknown[]) => mockSaveEventControls(...args),
  getEventControlsForAdmin: (...args: unknown[]) => mockGetEventControlsForAdmin(...args),
  importEventControlsFromRwgps: (...args: unknown[]) => mockImportEventControlsFromRwgps(...args),
  getEventCollectionLegs: (...args: unknown[]) => mockGetEventCollectionLegs(...args),
  importEventControlsFromRwgpsCollection: (...args: unknown[]) =>
    mockImportEventControlsFromRwgpsCollection(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const event = {
  id: 'event-1',
  name: 'Test Brevet',
  routeName: 'Test Brevet',
  distance: 200,
  eventDate: '2026-05-15',
  startTime: '06:00',
  startLocation: 'Test Start',
  chapter: 'Toronto',
  rwgpsId: null,
  rwgpsCollectionId: null,
  eventType: 'brevet',
}

const organizer = { name: 'Org Anizer', phone: '416-555-1212', email: 'org@example.com' }

const riders: CardRider[] = [
  { id: 'rider-a', firstName: 'Alice', lastName: 'Adams' },
  { id: 'rider-b', firstName: 'Bob', lastName: 'Brar' },
  { id: 'rider-c', firstName: 'Cy', lastName: 'Chen' },
]

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

function renderForm(props?: {
  riders?: CardRider[]
  event?: ComponentProps<typeof ControlCardsForm>['event']
  savedControls?: AdminEventControl[]
  eventSubmitted?: boolean
}) {
  return render(
    <ControlCardsForm
      event={props?.event ?? event}
      organizer={organizer}
      riders={props?.riders ?? riders}
      savedControls={props?.savedControls}
      eventSubmitted={props?.eventSubmitted}
    />
  )
}

beforeEach(() => {
  mockSaveEventControls.mockReset().mockResolvedValue({ success: true })
  mockGetEventControlsForAdmin.mockReset().mockResolvedValue({ success: true, data: [] })
  mockImportEventControlsFromRwgps.mockReset().mockResolvedValue({ success: true, data: [] })
  mockGetEventCollectionLegs.mockReset().mockResolvedValue({ success: true, data: [] })
  mockImportEventControlsFromRwgpsCollection
    .mockReset()
    .mockResolvedValue({ success: true, data: [] })
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

/** The generate link href, decoded for assertions. */
function generateHref(): string {
  const link = screen.getByRole('link', { name: /Generate .* Control Card/i })
  return decodeURIComponent(link.getAttribute('href') || '')
}

describe('ControlCardsForm rider selection', () => {
  beforeEach(() => {
    // Provide control-point distances so the form is valid by default.
    // (Start=0, Finish=200 are seeded by the component.)
  })

  it('defaults to All mode and omits riderIds from the print URL', () => {
    renderForm()
    expect(generateHref()).not.toContain('riderIds')
  })

  it('shows the rider count for everyone in the generate button', () => {
    renderForm()
    expect(screen.getByRole('link', { name: 'Generate 3 Control Cards' })).toBeTruthy()
  })

  it('reveals checkboxes when Choose individually is selected, all pre-checked', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: 'Choose' }))
    const checks = screen.getAllByRole('checkbox')
    // 3 rider checkboxes + 1 select-all checkbox
    expect(checks).toHaveLength(4)
    // Radix Checkbox is a button element; state is exposed via data-state, not .checked
    expect(checks.every((c) => c.getAttribute('data-state') === 'checked')).toBe(true)
  })

  it('adds only the checked rider ids to the print URL in individual mode', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: 'Choose' }))
    await user.click(screen.getByLabelText('Bob Brar')) // uncheck Bob
    const href = generateHref()
    expect(href).toContain('riderIds=rider-a,rider-c')
    expect(href).not.toContain('rider-b')
    expect(screen.getByRole('link', { name: 'Generate 2 Control Cards' })).toBeTruthy()
  })

  it('disables Generate when individual mode has zero riders selected', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('radio', { name: 'Choose' }))
    await user.click(screen.getByLabelText('Select all')) // toggles all off (all were on)
    const link = screen.getByRole('link', { name: /Generate/i })
    expect(link.className).toContain('pointer-events-none')
    expect(screen.getByText(/Select at least one rider/i)).toBeTruthy()
  })

  it('hides the Choose individually option when there are no registered riders', () => {
    renderForm({ riders: [] })
    expect(screen.queryByRole('radio', { name: 'Choose' })).toBeNull()
  })
})

const eventWithRwgps = { ...event, rwgpsId: '12345' }

const savedThree: AdminEventControl[] = [
  makeSaved({ id: 'ctrl-1', position: 1, name: 'Start', distanceKm: 0, lat: 43.6, lng: -79.4 }),
  makeSaved({ id: 'ctrl-2', position: 2, name: 'Midway', distanceKm: 100, lat: 44.0, lng: -79.9 }),
  makeSaved({ id: 'ctrl-3', position: 3, name: 'Finish', distanceKm: 200, lat: 43.6, lng: -79.4 }),
]

function controlNameInputs(): HTMLInputElement[] {
  return screen.getAllByPlaceholderText('Control name') as HTMLInputElement[]
}

describe('ControlCardsForm digital-card sync', () => {
  it('prefills rows from savedControls and does not auto-import from RWGPS', () => {
    renderForm({ event: eventWithRwgps, savedControls: savedThree })

    const names = controlNameInputs().map((i) => i.value)
    expect(names).toEqual(['Start', 'Midway', 'Finish'])
    expect(mockImportEventControlsFromRwgps).not.toHaveBeenCalled()
    // No import means no auto-save either — saved controls are left untouched.
    expect(mockSaveEventControls).not.toHaveBeenCalled()
    // Starts in sync with the saved controls.
    expect(screen.getByText(/In sync with the digital brevet card controls/i)).toBeTruthy()
  })

  it('auto-imports on mount when there are no saved controls and a route is linked', async () => {
    renderForm({ event: eventWithRwgps })
    await waitFor(() => expect(mockImportEventControlsFromRwgps).toHaveBeenCalledWith('event-1'))
  })

  it('shows the drift note when a prefilled row is edited, and Reset to saved restores it', async () => {
    const user = userEvent.setup()
    renderForm({ event: eventWithRwgps, savedControls: savedThree })

    expect(screen.getByText(/In sync with the digital brevet card controls/i)).toBeTruthy()

    await user.type(controlNameInputs()[1], 'X') // Midway -> MidwayX

    expect(
      screen.getByText(/These controls differ from the saved digital-card controls/i)
    ).toBeTruthy()
    expect(screen.queryByText(/In sync with the digital brevet card controls/i)).toBeNull()

    await user.click(screen.getByRole('button', { name: /Reset to saved/i }))

    expect(
      screen.queryByText(/These controls differ from the saved digital-card controls/i)
    ).toBeNull()
    expect(screen.getByText(/In sync with the digital brevet card controls/i)).toBeTruthy()
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Start', 'Midway', 'Finish'])
  })

  it('Update saved controls saves with saved ids and coordinates preserved', async () => {
    const user = userEvent.setup()
    mockGetEventControlsForAdmin.mockResolvedValue({ success: true, data: savedThree })
    renderForm({ event: eventWithRwgps, savedControls: savedThree })

    await user.type(controlNameInputs()[1], 'X') // drift
    await user.click(screen.getByRole('button', { name: /Update saved controls/i }))

    await waitFor(() => expect(mockSaveEventControls).toHaveBeenCalled())
    const [eventId, inputs] = mockSaveEventControls.mock.calls[0]
    expect(eventId).toBe('event-1')
    expect(inputs).toHaveLength(3)
    // Saved ids preserved so save updates in place (does not wipe check-ins).
    expect(inputs.map((c: { id?: string }) => c.id)).toEqual(['ctrl-1', 'ctrl-2', 'ctrl-3'])
    // Coordinates carried through untouched.
    expect(inputs[0]).toMatchObject({ lat: 43.6, lng: -79.4, radiusM: 500 })
  })

  it('shows Save controls to this event only when there are no saved controls', () => {
    const { unmount } = renderForm({ event: eventWithRwgps })
    expect(screen.getByRole('button', { name: /Save controls to this event/i })).toBeTruthy()
    unmount()

    renderForm({ event: eventWithRwgps, savedControls: savedThree })
    expect(screen.queryByRole('button', { name: /Save controls to this event/i })).toBeNull()
  })

  it('flips from the save button to the in-sync affordance after the first save', async () => {
    const user = userEvent.setup()
    // No savedControls prop: the form seeds Test Start (0) / Finish (200).
    // The post-save snapshot refresh returns those rows with fresh ids.
    mockGetEventControlsForAdmin.mockResolvedValue({
      success: true,
      data: [
        makeSaved({ id: 'new-1', position: 1, name: 'Test Start', distanceKm: 0 }),
        makeSaved({ id: 'new-2', position: 2, name: 'Finish', distanceKm: 200 }),
      ],
    })
    renderForm()

    await user.click(screen.getByRole('button', { name: /Save controls to this event/i }))

    await waitFor(() => {
      expect(screen.getByText(/In sync with the digital brevet card controls/i)).toBeTruthy()
    })
    expect(screen.queryByRole('button', { name: /Save controls to this event/i })).toBeNull()
  })

  it('hides all sync affordances when the event is submitted', () => {
    renderForm({ event: eventWithRwgps, savedControls: savedThree, eventSubmitted: true })
    expect(screen.queryByRole('button', { name: /Save controls to this event/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /Update saved controls/i })).toBeNull()
    expect(screen.queryByText(/In sync with the digital brevet card controls/i)).toBeNull()
    expect(
      screen.queryByText(/These controls differ from the saved digital-card controls/i)
    ).toBeNull()
  })
})

const importedTwo = [
  { name: 'Start', distanceKm: 0, lat: 43.6, lng: -79.4 },
  { name: 'Finish', distanceKm: 200, lat: 43.7, lng: -79.5 },
]

describe('ControlCardsForm mount auto-save', () => {
  it('auto-saves the imported rows on mount when there are no saved controls, then lands in sync', async () => {
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })
    mockGetEventControlsForAdmin.mockResolvedValue({
      success: true,
      data: [
        makeSaved({
          id: 'new-1',
          position: 1,
          name: 'Start',
          distanceKm: 0,
          lat: 43.6,
          lng: -79.4,
        }),
        makeSaved({
          id: 'new-2',
          position: 2,
          name: 'Finish',
          distanceKm: 200,
          lat: 43.7,
          lng: -79.5,
        }),
      ],
    })

    renderForm({ event: eventWithRwgps })

    await waitFor(() => expect(mockSaveEventControls).toHaveBeenCalledTimes(1))
    const [eventId, inputs] = mockSaveEventControls.mock.calls[0]
    expect(eventId).toBe('event-1')
    // Imported rows are saved with their coordinates carried through.
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toMatchObject({ name: 'Start', distanceKm: 0, lat: 43.6, lng: -79.4 })
    expect(inputs[1]).toMatchObject({ name: 'Finish', distanceKm: 200, lat: 43.7, lng: -79.5 })
    // Distinct success toast for the auto-import + save path.
    expect(toast.success).toHaveBeenCalledWith(
      'Controls imported from RWGPS and saved to this event'
    )
    // After the snapshot refresh the form reports in sync.
    await waitFor(() =>
      expect(screen.getByText(/In sync with the digital brevet card controls/i)).toBeTruthy()
    )
  })

  it('does not auto-save when the event is submitted (import still runs for printing)', async () => {
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })
    renderForm({ event: eventWithRwgps, eventSubmitted: true })

    await waitFor(() => expect(mockImportEventControlsFromRwgps).toHaveBeenCalledWith('event-1'))
    expect(mockSaveEventControls).not.toHaveBeenCalled()
  })

  it('does not auto-save on a manual Import from RWGPS click when saved controls exist', async () => {
    const user = userEvent.setup()
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })
    renderForm({ event: eventWithRwgps, savedControls: savedThree })

    // Saved controls prefilled — nothing imports on mount.
    expect(mockImportEventControlsFromRwgps).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))

    await waitFor(() => expect(mockImportEventControlsFromRwgps).toHaveBeenCalledWith('event-1'))
    // Manual imports populate rows only; the drift UI persists them, so no save fires.
    expect(mockSaveEventControls).not.toHaveBeenCalled()
  })

  it('leaves the save button available when the auto-save fails', async () => {
    mockImportEventControlsFromRwgps.mockResolvedValue({ success: true, data: importedTwo })
    mockSaveEventControls.mockResolvedValue({ success: false, error: 'Save exploded' })

    renderForm({ event: eventWithRwgps })

    await waitFor(() => expect(mockSaveEventControls).toHaveBeenCalled())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Save exploded'))
    // Snapshot was never refreshed, so the form degrades to the manual save affordance.
    expect(screen.getByRole('button', { name: /Save controls to this event/i })).toBeTruthy()
  })
})

function manySaved(n: number): AdminEventControl[] {
  return Array.from({ length: n }, (_, i) =>
    makeSaved({
      id: `ctrl-${i + 1}`,
      position: i + 1,
      name: `Control ${i + 1}`,
      distanceKm: i * 10,
    })
  )
}

describe('ControlCardsForm control-count cap', () => {
  it('disables Generate and explains when controls exceed 24', () => {
    renderForm({ savedControls: manySaved(25) })
    const link = screen.getByRole('link', { name: /Generate/i })
    expect((link.getAttribute('class') || '').split(/\s+/)).toContain('pointer-events-none')
    expect(link.getAttribute('href')).toBe('#')
    expect(screen.getByText(/25 controls — printed cards support at most 24/i)).toBeTruthy()
  })

  it('allows exactly 24 controls', () => {
    renderForm({ savedControls: manySaved(24) })
    const link = screen.getByRole('link', { name: /Generate/i })
    expect((link.getAttribute('class') || '').split(/\s+/)).not.toContain('pointer-events-none')
    expect(link.getAttribute('href')).toContain('/control-cards/print?')
    expect(screen.queryByText(/printed cards support at most 24/i)).toBeNull()
  })

  it('does not stack the generic validity hint on top of the cap message', () => {
    renderForm({ savedControls: manySaved(25) })
    expect(
      screen.queryByText(/Please fill in all organizer details and control points/i)
    ).toBeNull()
  })
})

describe('ControlCardsForm no-route hint', () => {
  it('shows the generic "no route linked" hint for a single-route event with no saved controls', () => {
    renderForm()
    expect(screen.getByText(/No RWGPS route linked to this event/i)).toBeTruthy()
  })

  it('points to the "Import from RWGPS" button and the Digital Brevet Card page for a collection event with no saved controls', () => {
    renderForm({ event: { ...event, rwgpsId: null, rwgpsCollectionId: 'coll-1' } })

    expect(screen.queryByText(/No RWGPS route linked to this event/i)).toBeNull()
    expect(screen.getByText(/This event uses a route collection/i)).toBeTruthy()
    expect(screen.getByText(/Use "Import from RWGPS" to choose legs/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Digital Brevet Card/i })
    expect(link.getAttribute('href')).toBe('/admin/events/event-1/brevet-card')
  })

  it('shows no hint for a collection event once leg-grouped controls are saved', () => {
    const legSaved: AdminEventControl[] = [
      makeSaved({
        id: 'l1-start',
        position: 1,
        name: 'L1 Start',
        distanceKm: 0,
        legRwgpsId: '101',
        legName: 'Leg 1: A',
      }),
      makeSaved({
        id: 'l2-start',
        position: 2,
        name: 'L2 Start',
        distanceKm: 0,
        legRwgpsId: '102',
        legName: 'Leg 2: B',
      }),
    ]
    renderForm({
      event: { ...event, rwgpsId: null, rwgpsCollectionId: 'coll-1' },
      savedControls: legSaved,
    })

    expect(screen.queryByText(/No RWGPS route linked to this event/i)).toBeNull()
    expect(screen.queryByText(/This event uses a route collection/i)).toBeNull()
  })
})

describe('ControlCardsForm collection legs', () => {
  const legSaved: AdminEventControl[] = [
    makeSaved({
      id: 'l1-start',
      position: 1,
      name: 'L1 Start',
      distanceKm: 0,
      legRwgpsId: '101',
      legName: 'Leg 1: A',
    }),
    makeSaved({
      id: 'l1-fin',
      position: 2,
      name: 'L1 Finish',
      distanceKm: 200,
      legRwgpsId: '101',
      legName: 'Leg 1: A',
    }),
    makeSaved({
      id: 'l2-start',
      position: 3,
      name: 'L2 Start',
      distanceKm: 0,
      legRwgpsId: '102',
      legName: 'Leg 2: B',
    }),
    makeSaved({
      id: 'l2-fin',
      position: 4,
      name: 'L2 Finish',
      distanceKm: 300,
      legRwgpsId: '102',
      legName: 'Leg 2: B',
    }),
  ]

  it('multiplies the card count by the number of legs (riders × legs)', () => {
    renderForm({ savedControls: legSaved })
    // 3 riders × 2 legs = 6
    expect(screen.getByRole('link', { name: 'Generate 6 Control Cards' })).toBeTruthy()
  })

  it('omits the controls param entirely for leg-grouped controls (print reads saved rows)', () => {
    // Encoding every leg-tagged control into the URL blows past platform
    // request-line limits (~14 KB on Vercel); the admin print page reads the
    // stored event_controls rows instead.
    renderForm({ savedControls: legSaved })
    const href = generateHref()
    expect(new URLSearchParams(href.split('?')[1]).get('controls')).toBeNull()
    // Count display is unaffected: 3 riders × 2 legs.
    expect(screen.getByRole('link', { name: 'Generate 6 Control Cards' })).toBeTruthy()
  })

  it('notes that printed leg cards use the saved controls when leg rows drift', async () => {
    // With the DB as the print-time source of truth, unsaved edits do not
    // affect leg printing — the drift warning must say so.
    const user = userEvent.setup()
    renderForm({ savedControls: legSaved })

    await user.type(controlNameInputs()[0], 'X')

    expect(
      screen.getByText(/These controls differ from the saved digital-card controls/i)
    ).toBeTruthy()
    expect(screen.getByText(/Printed leg cards use the saved controls/i)).toBeTruthy()
  })

  it('does not show the leg-print note for single-route drift', async () => {
    const user = userEvent.setup()
    renderForm({ savedControls: savedThree })

    await user.type(controlNameInputs()[0], 'X')

    expect(
      screen.getByText(/These controls differ from the saved digital-card controls/i)
    ).toBeTruthy()
    expect(screen.queryByText(/Printed leg cards use the saved controls/i)).toBeNull()
  })

  it('keeps the single-route controls param shape unchanged (no leg keys)', () => {
    renderForm({
      savedControls: [
        makeSaved({ id: 's', position: 1, name: 'Start', distanceKm: 0 }),
        makeSaved({ id: 'f', position: 2, name: 'Finish', distanceKm: 200 }),
      ],
    })
    const href = generateHref()
    const controlsJson = new URLSearchParams(href.split('?')[1]).get('controls')!
    expect(JSON.parse(controlsJson)).toEqual([
      { name: 'Start', distance: 0 },
      { name: 'Finish', distance: 200 },
    ])
  })

  it('applies MAX_CARD_CONTROLS per leg and names the offending leg', () => {
    const bigLeg = Array.from({ length: 25 }, (_, i) =>
      makeSaved({
        id: `big-${i}`,
        position: i + 1,
        name: `C${i}`,
        distanceKm: i * 10,
        legRwgpsId: '101',
        legName: 'Leg 1: A',
      })
    )
    const smallLeg = makeSaved({
      id: 'l2',
      position: 26,
      name: 'L2 Start',
      distanceKm: 0,
      legRwgpsId: '102',
      legName: 'Leg 2: B',
    })
    renderForm({ savedControls: [...bigLeg, smallLeg] })
    expect(screen.getByText(/Leg 1: A has 25 controls/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Generate/i })
    expect(link.className).toContain('pointer-events-none')
  })

  it('does not trip the global cap when legs are each under it', () => {
    // 2 legs × 20 controls = 40 total, but ≤ 24 per leg — printable.
    const legs = ['101', '102'].flatMap((legId, li) =>
      Array.from({ length: 20 }, (_, i) =>
        makeSaved({
          id: `${legId}-${i}`,
          position: li * 20 + i + 1,
          name: `C${li}-${i}`,
          distanceKm: i * 10,
          legRwgpsId: legId,
          legName: `Leg ${li + 1}: X${li}`,
        })
      )
    )
    renderForm({ savedControls: legs })
    expect(screen.queryByText(/printed cards support at most/)).toBeNull()
    // 3 riders × 2 legs = 6
    expect(screen.getByRole('link', { name: 'Generate 6 Control Cards' })).toBeTruthy()
  })
})

const legSavedForGating: AdminEventControl[] = [
  makeSaved({
    id: 'g1-start',
    position: 1,
    name: 'L1 Start',
    distanceKm: 0,
    legRwgpsId: '101',
    legName: 'Leg 1: A',
  }),
  makeSaved({
    id: 'g1-fin',
    position: 2,
    name: 'L1 Finish',
    distanceKm: 200,
    legRwgpsId: '101',
    legName: 'Leg 1: A',
  }),
  makeSaved({
    id: 'g2-start',
    position: 3,
    name: 'L2 Start',
    distanceKm: 0,
    legRwgpsId: '102',
    legName: 'Leg 2: B',
  }),
  makeSaved({
    id: 'g2-fin',
    position: 4,
    name: 'L2 Finish',
    distanceKm: 300,
    legRwgpsId: '102',
    legName: 'Leg 2: B',
  }),
]

describe('ControlCardsForm Generate gating on save (leg events)', () => {
  it('disables Generate for a leg event once controls drift from saved (unsaved leg imports must not print stale/blank backs)', async () => {
    const user = userEvent.setup()
    renderForm({ savedControls: legSavedForGating })

    // Starts in sync -> enabled with a real print URL.
    expect(generateHref()).toContain('/control-cards/print?')

    await user.type(controlNameInputs()[0], 'X')

    const link = screen.getByRole('link', { name: /Generate/i })
    expect(link.className).toContain('pointer-events-none')
    expect(link.getAttribute('href')).toBe('#')
    // A visible reason near the Generate button, not just the amber banner
    // above (which can be scrolled past the Control Points card).
    expect(screen.getByText(/Save your imported controls before generating cards/i)).toBeTruthy()
  })

  it('re-enables Generate for a leg event once controls are back in sync with saved', async () => {
    const user = userEvent.setup()
    renderForm({ savedControls: legSavedForGating })

    await user.type(controlNameInputs()[0], 'X')
    expect(screen.getByRole('link', { name: /Generate/i }).className).toContain(
      'pointer-events-none'
    )

    await user.click(screen.getByRole('button', { name: /Reset to saved/i }))

    const link = screen.getByRole('link', { name: /Generate/i })
    // Token check, not substring: the button's base classes always include
    // the Tailwind variant "disabled:pointer-events-none", which would
    // falsely match a plain .toContain('pointer-events-none') string check.
    expect((link.getAttribute('class') || '').split(/\s+/)).not.toContain('pointer-events-none')
    expect(link.getAttribute('href')).toContain('/control-cards/print?')
    expect(screen.queryByText(/Save your imported controls before generating cards/i)).toBeNull()
  })

  it('leaves Generate enabled for a single-route event with unsaved edits (URL carries the controls; unaffected by this gate)', async () => {
    const user = userEvent.setup()
    renderForm({ savedControls: savedThree })

    await user.type(controlNameInputs()[0], 'X')
    expect(
      screen.getByText(/These controls differ from the saved digital-card controls/i)
    ).toBeTruthy()

    const link = screen.getByRole('link', { name: /Generate/i })
    expect((link.getAttribute('class') || '').split(/\s+/)).not.toContain('pointer-events-none')
    expect(link.getAttribute('href')).toContain('/control-cards/print?')
  })
})

const collectionEvent = { ...event, rwgpsId: null, rwgpsCollectionId: 'coll-1' }

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

describe('ControlCardsForm collection leg import', () => {
  it('shows the Import from RWGPS button for a collection event', () => {
    renderForm({ event: collectionEvent })
    expect(screen.getByRole('button', { name: /Import from RWGPS/i })).toBeTruthy()
  })

  it('does not show the collection import button for a single-route event', () => {
    renderForm({ event: { ...event, rwgpsId: null, rwgpsCollectionId: null } })
    expect(screen.queryByRole('button', { name: /Import from RWGPS/i })).toBeNull()
  })

  it('fetches legs, all pre-checked, when the dialog is opened', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockResolvedValue({ success: true, data: legsThree })
    renderForm({ event: collectionEvent })

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))

    await waitFor(() => expect(mockGetEventCollectionLegs).toHaveBeenCalledWith('event-1'))
    const checks = await screen.findAllByRole('checkbox')
    expect(checks).toHaveLength(3)
    expect(checks.every((c) => c.getAttribute('data-state') === 'checked')).toBe(true)
  })

  it('imports the selected legs, replaces the control list with leg headings, and saves immediately', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockResolvedValue({ success: true, data: legsThree })
    mockImportEventControlsFromRwgpsCollection.mockResolvedValue({
      success: true,
      data: importedLegControls,
    })
    mockGetEventControlsForAdmin.mockResolvedValue({
      success: true,
      data: importedLegControls.map((c, i) =>
        makeSaved({
          id: `saved-${i}`,
          position: i + 1,
          name: c.name,
          distanceKm: c.distanceKm,
          lat: c.lat,
          lng: c.lng,
          legRwgpsId: c.legRwgpsId,
          legName: c.legName,
        })
      ),
    })

    renderForm({ event: collectionEvent })

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))
    await screen.findAllByRole('checkbox')

    // Uncheck the combined/overview route, then import the remaining two legs.
    await user.click(screen.getByLabelText(/CCE Full Route/))
    await user.click(screen.getByRole('button', { name: /Import 2 legs/i }))

    await waitFor(() =>
      expect(mockImportEventControlsFromRwgpsCollection).toHaveBeenCalledWith('event-1', [
        '101',
        '102',
      ])
    )

    // Rows replace the seeded Start/Finish rows and land grouped under leg headings.
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(screen.getByText('Leg 1: CCE 200 - Gravenhurst')).toBeTruthy()
    expect(screen.getByText('Leg 2: CCE 300 - Haliburton')).toBeTruthy()

    // Leg-event printing reads the DB, so the import must save immediately.
    await waitFor(() => expect(mockSaveEventControls).toHaveBeenCalled())
    const [eventId, inputs] = mockSaveEventControls.mock.calls[0]
    expect(eventId).toBe('event-1')
    expect(inputs).toHaveLength(3)
    expect(inputs.map((c: { legRwgpsId: string | null }) => c.legRwgpsId)).toEqual([
      '101',
      '101',
      '102',
    ])
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/3 controls/i))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/2 legs/i))
  })

  it('preserves saved control ids leg-scoped on re-import (never matches across legs)', async () => {
    // Regression test for the data-loss bug: handleCollectionImported used to
    // stamp savedId: undefined on every row, so the immediate save deleted
    // and reinserted every control — cascading to rider check-ins. It must
    // instead carry over each surviving control's id, and the matching must
    // be scoped per leg: both legs below share a "Start"/"Control" name pair
    // with distances chosen so a *flat* (unscoped) match would swap the two
    // legs' "Control" ids with each other.
    const user = userEvent.setup()
    const savedLegControls: AdminEventControl[] = [
      makeSaved({
        id: 'a-start',
        position: 1,
        name: 'Start',
        distanceKm: 0,
        legRwgpsId: 'legA',
        legName: 'Leg 1: Alpha Loop',
      }),
      makeSaved({
        id: 'a-ctrl',
        position: 2,
        name: 'Control',
        distanceKm: 50,
        radiusM: 300,
        notes: 'Coffee stop',
        legRwgpsId: 'legA',
        legName: 'Leg 1: Alpha Loop',
      }),
      makeSaved({
        id: 'b-start',
        position: 3,
        name: 'Start',
        distanceKm: 0,
        legRwgpsId: 'legB',
        legName: 'Leg 2: Beta Loop',
      }),
      makeSaved({
        id: 'b-ctrl',
        position: 4,
        name: 'Control',
        distanceKm: 60,
        legRwgpsId: 'legB',
        legName: 'Leg 2: Beta Loop',
      }),
    ]
    mockGetEventCollectionLegs.mockResolvedValue({
      success: true,
      data: [
        { legRwgpsId: 'legA', name: 'Alpha Loop', distanceKm: 100 },
        { legRwgpsId: 'legB', name: 'Beta Loop', distanceKm: 120 },
      ],
    })
    // Re-import: leg A's "Control" (61) is numerically closer to leg B's
    // saved "Control" (60, delta 1) than to its own leg's saved "Control"
    // (50, delta 11) — and vice versa for leg B's "Control" (50, delta 0 to
    // leg A's saved "Control"). A flat match would swap them.
    mockImportEventControlsFromRwgpsCollection.mockResolvedValue({
      success: true,
      data: [
        {
          name: 'Start',
          distanceKm: 0,
          lat: null,
          lng: null,
          notes: null,
          legRwgpsId: 'legA',
          legName: 'Leg 1: Alpha Loop',
        },
        {
          name: 'Control',
          distanceKm: 61,
          lat: null,
          lng: null,
          notes: null,
          legRwgpsId: 'legA',
          legName: 'Leg 1: Alpha Loop',
        },
        {
          name: 'Start',
          distanceKm: 0,
          lat: null,
          lng: null,
          notes: null,
          legRwgpsId: 'legB',
          legName: 'Leg 2: Beta Loop',
        },
        {
          name: 'Control',
          distanceKm: 50,
          lat: null,
          lng: null,
          notes: null,
          legRwgpsId: 'legB',
          legName: 'Leg 2: Beta Loop',
        },
      ],
    })

    renderForm({ event: collectionEvent, savedControls: savedLegControls })

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))
    await screen.findAllByRole('checkbox')
    await user.click(screen.getByRole('button', { name: /Import 2 legs/i }))

    await waitFor(() => expect(mockSaveEventControls).toHaveBeenCalled())
    const [, inputs] = mockSaveEventControls.mock.calls[0]
    expect(inputs.map((c: { id?: string }) => c.id)).toEqual([
      'a-start',
      'a-ctrl',
      'b-start',
      'b-ctrl',
    ])
    // Radius/notes carried over from the matched saved row, not defaults.
    expect(inputs[1]).toMatchObject({ radiusM: 300, notes: 'Coffee stop' })
    // A genuinely new control (no saved match) still falls back to defaults.
    expect(inputs[0]).toMatchObject({ radiusM: 500, notes: null })
  })

  it('does not save the import when the event is submitted', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockResolvedValue({ success: true, data: legsThree })
    mockImportEventControlsFromRwgpsCollection.mockResolvedValue({
      success: true,
      data: importedLegControls,
    })

    renderForm({ event: collectionEvent, eventSubmitted: true })

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))
    await screen.findAllByRole('checkbox')
    await user.click(screen.getByRole('button', { name: /Import 3 legs/i }))

    await waitFor(() =>
      expect(mockImportEventControlsFromRwgpsCollection).toHaveBeenCalledWith('event-1', [
        '101',
        '102',
        '103',
      ])
    )
    expect(controlNameInputs().map((i) => i.value)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(mockSaveEventControls).not.toHaveBeenCalled()
  })

  it('closes the leg dialog with an error toast when loading the legs rejects', async () => {
    const user = userEvent.setup()
    mockGetEventCollectionLegs.mockRejectedValue(new Error('network down'))
    renderForm({ event: collectionEvent })

    await user.click(screen.getByRole('button', { name: /Import from RWGPS/i }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText(/loading legs/i)).toBeNull())
  })
})

describe('ControlCardsForm leg heading rows', () => {
  it('renders no leg headings for a single-route control list', () => {
    renderForm({ savedControls: savedThree })
    expect(screen.queryByText(/^Leg \d/)).toBeNull()
  })

  it('renders a heading before the first control of each leg', () => {
    const legSaved: AdminEventControl[] = [
      makeSaved({
        id: 'l1-start',
        position: 1,
        name: 'L1 Start',
        distanceKm: 0,
        legRwgpsId: '101',
        legName: 'Leg 1: A',
      }),
      makeSaved({
        id: 'l1-fin',
        position: 2,
        name: 'L1 Finish',
        distanceKm: 200,
        legRwgpsId: '101',
        legName: 'Leg 1: A',
      }),
      makeSaved({
        id: 'l2-start',
        position: 3,
        name: 'L2 Start',
        distanceKm: 0,
        legRwgpsId: '102',
        legName: 'Leg 2: B',
      }),
    ]
    renderForm({ savedControls: legSaved })

    // One heading per leg, not one per control.
    expect(screen.getAllByText('Leg 1: A')).toHaveLength(1)
    expect(screen.getAllByText('Leg 2: B')).toHaveLength(1)
  })
})
