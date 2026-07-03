/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCheckinsGrid, type GridControl } from '@/components/admin/event-checkins-grid'
import type { AdminCheckinGridRider } from '@/lib/actions/control-checkins'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const controls: GridControl[] = [
  { id: 'ctrl-1', name: 'Start', distanceKm: 0, windowLabel: 'Sat 08:00 – Sat 08:30' },
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

describe('EventCheckinsGrid rider card link', () => {
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
