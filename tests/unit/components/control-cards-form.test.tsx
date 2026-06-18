/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlCardsForm } from '@/components/admin/control-cards-form'
import type { CardRider } from '@/types/control-card'

// Avoid the on-mount RWGPS fetch firing during tests.
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsControls: vi.fn().mockResolvedValue([]),
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
  eventType: 'brevet',
}

const organizer = { name: 'Org Anizer', phone: '416-555-1212', email: 'org@example.com' }

const riders: CardRider[] = [
  { id: 'rider-a', firstName: 'Alice', lastName: 'Adams' },
  { id: 'rider-b', firstName: 'Bob', lastName: 'Brar' },
  { id: 'rider-c', firstName: 'Cy', lastName: 'Chen' },
]

function renderForm(props?: { riders?: CardRider[] }) {
  return render(
    <ControlCardsForm event={event} organizer={organizer} riders={props?.riders ?? riders} />
  )
}

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
