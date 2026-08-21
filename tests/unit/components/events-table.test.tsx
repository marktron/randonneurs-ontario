/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventsTable } from '@/components/admin/events-table'
import type { EventForAdminList } from '@/types/queries'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const events: EventForAdminList[] = [
  {
    id: 'event-1',
    name: 'Kissing Bridge',
    event_date: '2026-07-25',
    distance_km: 300,
    event_type: 'brevet',
    status: 'scheduled',
    chapter_id: 'chapter-1',
    chapters: { name: 'Toronto' },
    rider_count: 5,
  } as EventForAdminList,
]

describe('EventsTable', () => {
  it('renders event rows linking to the detail page', () => {
    render(<EventsTable events={events} buildEventDetailUrl={(id) => `/admin/events/${id}`} />)

    const row = screen.getByText('Kissing Bridge').closest('tr')!
    expect(row.getAttribute('role')).toBe('link')
    expect(screen.getByText('Scheduled')).toBeTruthy()
  })

  it('renders an empty state when there are no events', () => {
    render(<EventsTable events={[]} buildEventDetailUrl={(id) => `/admin/events/${id}`} />)

    expect(screen.getByText('No events found')).toBeTruthy()
  })

  it('stacks rows into cards on mobile: hidden header, block rows, distance inline with date', () => {
    const { container } = render(
      <EventsTable events={events} buildEventDetailUrl={(id) => `/admin/events/${id}`} />
    )

    const thead = container.querySelector('thead')!
    expect(thead.className).toContain('hidden')
    expect(thead.className).toContain('sm:table-header-group')

    const row = screen.getByText('Kissing Bridge').closest('tr')!
    expect(row.className).toContain('block')
    expect(row.className).toContain('sm:table-row')

    // Distance rides along with the date on mobile (the Distance column is sm-only)
    const mobileDistance = screen.getByText(/· 300 km/)
    expect(mobileDistance.className).toContain('sm:hidden')

    // Status badge is pinned to the card's top-right corner on mobile
    const statusCell = screen.getByText('Scheduled').closest('td')!
    expect(statusCell.className).toContain('absolute')
    expect(statusCell.className).toContain('sm:static')
  })

  it('renders a Draft badge for draft events', () => {
    render(
      <EventsTable
        events={[{ ...events[0], id: 'event-2', status: 'draft' } as EventForAdminList]}
        buildEventDetailUrl={(id) => `/admin/events/${id}`}
      />
    )

    expect(screen.getByText('Draft')).toBeTruthy()
  })
})
