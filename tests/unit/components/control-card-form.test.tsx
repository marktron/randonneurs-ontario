/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlCardForm } from '@/components/control-card-form'
import type { ActiveRouteWithRwgps } from '@/lib/data/routes'

// The form imports RWGPS server actions at module level; stub them so no
// server-only code is pulled into the test environment. `parseRwgpsRouteRef`
// stays real — it's a pure, client-safe parser from '@/lib/rwgps'.
vi.mock('@/lib/actions/rwgps', () => ({
  loadRwgpsControls: vi.fn(async () => ({ success: true, data: [] })),
  loadRwgpsRoute: vi.fn(async () => ({ success: true, data: null })),
}))

// rwgpsId: null so picking the route never triggers the RWGPS auto-import effect.
const route: ActiveRouteWithRwgps = {
  id: 'route-1',
  name: 'Test Brevet',
  slug: 'test-brevet',
  distanceKm: 200,
  chapterId: 'chapter-1',
  chapterName: 'Toronto',
  rwgpsId: null,
}

type SetupUser = ReturnType<typeof userEvent.setup>

/**
 * Drives the form to an otherwise-valid state: a route picked (via the
 * combobox), a start date picked (via the react-day-picker Calendar), and
 * the seeded Finish control given an explicit distance.
 */
async function buildValidForm(user: SetupUser) {
  render(<ControlCardForm routes={[route]} />)

  await user.click(screen.getByRole('combobox'))
  await user.click(await screen.findByText(route.name))

  await user.click(screen.getByRole('button', { name: 'Start Date' }))
  const dayButtons = screen.getAllByRole('button').filter((b) => /^\d+$/.test(b.textContent || ''))
  await user.click(dayButtons[15])

  const finishDistance = screen.getAllByPlaceholderText('km').at(-1) as HTMLInputElement
  await user.clear(finishDistance)
  await user.type(finishDistance, String(route.distanceKm))
}

/**
 * Clicks "Add Control" once and fills the newly-inserted row (it lands just
 * before the Finish row, which addControl always keeps last) so it doesn't
 * itself violate the name/distance validity check.
 */
async function addFilledControl(user: SetupUser, n: number) {
  await user.click(screen.getByRole('button', { name: /Add Control/i }))
  const names = screen.getAllByPlaceholderText('Control name') as HTMLInputElement[]
  const distances = screen.getAllByPlaceholderText('km') as HTMLInputElement[]
  const newIndex = names.length - 2 // second-to-last row, just before Finish
  await user.type(names[newIndex], `Control ${n}`)
  await user.type(distances[newIndex], String(10 + n))
}

function generateLink() {
  return screen.getByRole('link', { name: /Generate Control Cards/i })
}

describe('ControlCardForm date picker', () => {
  it('reopens on the month of the chosen date rather than today', async () => {
    const user = userEvent.setup()
    render(<ControlCardForm routes={[route]} />)

    await user.click(screen.getByRole('button', { name: 'Start Date' }))
    await user.click(screen.getByRole('button', { name: 'Go to the Next Month' }))
    await user.click(screen.getByRole('button', { name: 'Go to the Next Month' }))
    const dayButtons = screen
      .getAllByRole('button')
      .filter((b) => /^\d+$/.test(b.textContent || ''))
    await user.click(dayButtons[15])

    // Calendar closes on select; reopen it
    await user.click(screen.getByRole('button', { name: 'Start Date' }))

    const today = new Date()
    const expected = new Date(today.getFullYear(), today.getMonth() + 2, 1)
    const label = expected.toLocaleString('en-US', { month: 'long', year: 'numeric' })
    expect(await screen.findByRole('grid', { name: label })).toBeInTheDocument()
  })
})

describe('ControlCardForm control-count cap', () => {
  it('shows the cap message once controls exceed 24, even with no route/date picked', async () => {
    const user = userEvent.setup()
    render(<ControlCardForm routes={[]} />)

    // Seeded with Start + Finish (2 rows); 23 clicks → 25 rows.
    const addControl = screen.getByRole('button', { name: /Add Control/i })
    for (let i = 0; i < 23; i++) {
      await user.click(addControl)
    }

    expect(screen.getByText(/25 controls — printed cards support at most 24/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Generate Control Cards/i })
    expect((link.getAttribute('class') || '').split(/\s+/)).toContain('pointer-events-none')
  })

  it('clears the cap message at exactly 24 controls', async () => {
    const user = userEvent.setup()
    render(<ControlCardForm routes={[]} />)

    const addControl = screen.getByRole('button', { name: /Add Control/i })
    for (let i = 0; i < 22; i++) {
      await user.click(addControl) // 2 seeded + 22 = 24
    }

    expect(screen.queryByText(/printed cards support at most 24/i)).toBeNull()
  })

  it('disables Generate at 25 controls even when the rest of the form is otherwise valid', async () => {
    const user = userEvent.setup()
    await buildValidForm(user)

    // 2 seeded + 23 filled additions = 25, one over the cap.
    for (let i = 0; i < 23; i++) {
      await addFilledControl(user, i)
    }

    const link = generateLink()
    expect((link.getAttribute('class') || '').split(/\s+/)).toContain('pointer-events-none')
    expect(link.getAttribute('href')).toBe('#')
  }, 20000)

  it('enables Generate at exactly 24 controls when the rest of the form is valid', async () => {
    const user = userEvent.setup()
    await buildValidForm(user)

    // 2 seeded + 22 filled additions = 24, exactly at the cap.
    for (let i = 0; i < 22; i++) {
      await addFilledControl(user, i)
    }

    const link = generateLink()
    expect((link.getAttribute('class') || '').split(/\s+/)).not.toContain('pointer-events-none')
    expect(link.getAttribute('href')).toContain('/control-cards/print?')
  }, 20000)
})
