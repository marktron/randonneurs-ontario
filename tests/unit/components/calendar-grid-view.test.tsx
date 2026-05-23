/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarGridView } from '@/components/calendar-grid-view'
import type { Event } from '@/components/event-card'

const sampleEvents: Event[] = [
  {
    slug: 'spring-100-2026-04-15',
    date: '2026-04-15',
    name: 'Spring 100',
    type: 'Populaire',
    distance: '100',
    startLocation: 'City Hall',
    startTime: '08:00',
    status: 'scheduled',
    chapterName: 'Toronto',
  },
  {
    slug: 'spring-200-2026-04-15',
    date: '2026-04-15',
    name: 'Spring 200',
    type: 'Brevet',
    distance: '200',
    startLocation: 'Park',
    startTime: '07:00',
    status: 'scheduled',
    chapterName: 'Ottawa',
  },
  {
    slug: 'spring-300-2026-05-01',
    date: '2026-05-01',
    name: 'Spring 300',
    type: 'Brevet',
    distance: '300',
    startLocation: 'Library',
    startTime: '06:00',
    status: 'scheduled',
    chapterName: 'Huron',
  },
]

describe('CalendarGridView', () => {
  it('renders month headers', () => {
    render(<CalendarGridView events={sampleEvents} />)

    expect(screen.getByText('April 2026')).toBeInTheDocument()
    expect(screen.getByText('May 2026')).toBeInTheDocument()
  })

  it('renders event names with distances', () => {
    render(<CalendarGridView events={sampleEvents} />)

    // Events appear in grid cells as "distance km — name"
    expect(screen.getAllByText(/Spring 100/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Spring 200/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Spring 300/).length).toBeGreaterThan(0)
  })

  it('renders multiple events on the same date', () => {
    render(<CalendarGridView events={sampleEvents} />)

    // Both April 15 events should be present
    expect(screen.getAllByText(/Spring 100/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Spring 200/).length).toBeGreaterThan(0)
  })

  it('renders links to registration pages', () => {
    render(<CalendarGridView events={sampleEvents} />)

    const links = screen.getAllByRole('link')
    const hrefs = links.map((link) => link.getAttribute('href'))
    expect(hrefs).toContain('/register/spring-100-2026-04-15')
    expect(hrefs).toContain('/register/spring-300-2026-05-01')
  })

  it('renders nothing for empty events', () => {
    const { container } = render(<CalendarGridView events={[]} />)

    // No month sections should be rendered
    expect(container.querySelectorAll('section')).toHaveLength(0)
  })

  it('renders day-of-week headers', () => {
    render(<CalendarGridView events={sampleEvents} />)

    // Desktop headers
    expect(screen.getAllByText('Mon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Tue').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Sun').length).toBeGreaterThan(0)
  })
})
