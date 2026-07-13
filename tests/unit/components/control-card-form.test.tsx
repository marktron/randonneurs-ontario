/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ControlCardForm } from '@/components/control-card-form'
import type { ActiveRouteWithRwgps } from '@/lib/data/routes'

// The form imports RWGPS fetch helpers at module level; stub them so no
// network-capable code is pulled into the test environment.
vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsControls: vi.fn(),
  fetchRwgpsRoute: vi.fn(),
  parseRwgpsRouteRef: vi.fn(),
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

describe('ControlCardForm control-count cap', () => {
  it('shows the cap message once controls exceed 21, even with no route/date picked', async () => {
    const user = userEvent.setup()
    render(<ControlCardForm routes={[]} />)

    // Seeded with Start + Finish (2 rows); 20 clicks → 22 rows.
    const addControl = screen.getByRole('button', { name: /Add Control/i })
    for (let i = 0; i < 20; i++) {
      await user.click(addControl)
    }

    expect(screen.getByText(/22 controls — printed cards support at most 21/i)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Generate Control Cards/i })
    expect((link.getAttribute('class') || '').split(/\s+/)).toContain('pointer-events-none')
  })

  it('clears the cap message at exactly 21 controls', async () => {
    const user = userEvent.setup()
    render(<ControlCardForm routes={[]} />)

    const addControl = screen.getByRole('button', { name: /Add Control/i })
    for (let i = 0; i < 19; i++) {
      await user.click(addControl) // 2 seeded + 19 = 21
    }

    expect(screen.queryByText(/printed cards support at most 21/i)).toBeNull()
  })

  it('disables Generate at 22 controls even when the rest of the form is otherwise valid', async () => {
    const user = userEvent.setup()
    await buildValidForm(user)

    // 2 seeded + 20 filled additions = 22, one over the cap.
    for (let i = 0; i < 20; i++) {
      await addFilledControl(user, i)
    }

    const link = generateLink()
    expect((link.getAttribute('class') || '').split(/\s+/)).toContain('pointer-events-none')
    expect(link.getAttribute('href')).toBe('#')
  }, 15000)

  it('enables Generate at exactly 21 controls when the rest of the form is valid', async () => {
    const user = userEvent.setup()
    await buildValidForm(user)

    // 2 seeded + 19 filled additions = 21, exactly at the cap.
    for (let i = 0; i < 19; i++) {
      await addFilledControl(user, i)
    }

    const link = generateLink()
    expect((link.getAttribute('class') || '').split(/\s+/)).not.toContain('pointer-events-none')
    expect(link.getAttribute('href')).toContain('/control-cards/print?')
  }, 15000)
})
