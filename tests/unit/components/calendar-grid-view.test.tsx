/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

  it('fills brevet cells with their ACP medal background colour', () => {
    const { container } = render(<CalendarGridView events={sampleEvents} />)

    // Spring 200 → yellow-600, Spring 300 → lime-600
    expect(container.querySelector('.bg-yellow-600')).not.toBeNull()
    expect(container.querySelector('.bg-lime-600')).not.toBeNull()
  })

  it('keeps populaire cells muted with no medal background', () => {
    const populaireOnly: Event[] = [sampleEvents[0]] // Spring 100 (Populaire)
    const { container } = render(<CalendarGridView events={populaireOnly} />)

    expect(container.querySelector('.bg-yellow-600')).toBeNull()
    expect(container.querySelector('[class*="bg-muted"]')).not.toBeNull()
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

describe('cancelled events', () => {
  it('renders a navigation link for cancelled events so visitors can read the announcement', () => {
    const events: Event[] = [
      {
        slug: 'spring-200-cancelled-fixture',
        date: '2026-04-15',
        name: 'Spring 200',
        type: 'Brevet',
        distance: '200',
        startLocation: 'City Hall',
        startTime: '08:00',
        status: 'cancelled',
        chapterName: 'Toronto',
      },
    ]
    render(<CalendarGridView events={events} />)

    expect(screen.getAllByText('(cancelled)').length).toBeGreaterThan(0)
    const navLinks = screen
      .queryAllByRole('link')
      .filter((el) => el.getAttribute('href')?.includes('/register/spring-200-cancelled-fixture'))
    expect(navLinks.length).toBeGreaterThan(0)
  })

  it('does not apply a medal background to cancelled events', () => {
    const events: Event[] = [
      {
        slug: 'spring-200-cancelled-fixture',
        date: '2026-04-15',
        name: 'Spring 200',
        type: 'Brevet',
        distance: '200',
        startLocation: 'City Hall',
        startTime: '08:00',
        status: 'cancelled',
        chapterName: 'Toronto',
      },
    ]
    const { container } = render(<CalendarGridView events={events} />)

    // Cancelled 200 km event stays muted rather than yellow-600
    expect(container.querySelector('.bg-yellow-600')).toBeNull()
  })
})

describe('hrefFor', () => {
  it('defaults to the public registration link', () => {
    render(<CalendarGridView events={[sampleEvents[0]]} />)
    expect(
      screen
        .getAllByRole('link')
        .some((l) => l.getAttribute('href') === '/register/spring-100-2026-04-15')
    ).toBe(true)
  })

  it('uses a custom link builder when provided', () => {
    const withId: Event = { ...sampleEvents[0], id: 'evt-1' }
    render(<CalendarGridView events={[withId]} hrefFor={(e) => `/admin/events/${e.id}`} />)
    const hrefs = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/admin/events/evt-1')
    expect(hrefs).not.toContain('/register/spring-100-2026-04-15')
  })
})

describe('draft events', () => {
  const draft: Event = {
    slug: 'spring-200-draft-fixture',
    date: '2026-04-15',
    name: 'Spring 200',
    type: 'Brevet',
    distance: '200',
    startLocation: 'TBD',
    startTime: '07:00',
    status: 'draft',
    chapterName: 'Toronto',
  }

  it('renders a Draft chip and no medal background', () => {
    const { container } = render(<CalendarGridView events={[draft]} />)
    // The fixture name deliberately does not contain "draft", so these
    // assertions can only pass because of the draft chip itself.
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getAllByText('(draft)').length).toBeGreaterThan(0)
    expect(container.querySelector('.bg-yellow-600')).toBeNull()
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })

  it('announces the draft state in the link label', () => {
    render(<CalendarGridView events={[draft]} />)
    const labels = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    expect(labels).toContain('Spring 200, 200 km, Wednesday, April 15, 7:00am, Toronto, draft')
  })
})

describe('cancelled events', () => {
  const cancelled: Event = {
    slug: 'spring-300-cancelled-fixture',
    date: '2026-04-16',
    name: 'Spring 300',
    type: 'Brevet',
    distance: '300',
    startLocation: 'Park',
    startTime: '06:00',
    status: 'cancelled',
    chapterName: 'Ottawa',
  }

  it('announces the cancelled state in the link label', () => {
    render(<CalendarGridView events={[cancelled]} />)
    const labels = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    // A 300 starting at 06:00 finishes at 02:00 the next day, so the label also
    // carries the two-day span.
    expect(labels).toContain(
      'Spring 300, 300 km, Thursday, April 16, 6:00am, 2 days (20h limit), Ottawa, cancelled'
    )
  })
})

describe('scheduled events', () => {
  it('leaves the link label free of a state suffix', () => {
    render(<CalendarGridView events={[sampleEvents[0]]} />)
    const labels = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    expect(labels).toContain('Spring 100, 100 km, Wednesday, April 15, 8:00am, Toronto')
  })
})

describe('multi-day bars', () => {
  const six: Event = {
    slug: 'saturday-600',
    date: '2026-05-16', // Saturday
    name: 'Saturday 600',
    type: 'Brevet',
    distance: '600',
    startLocation: 'Park',
    startTime: '06:00',
    status: 'scheduled',
    chapterName: 'Toronto',
  }

  /** Desktop bar wrappers expose their grid placement as data attributes. */
  function desktopBars(container: HTMLElement, name: string) {
    return Array.from(container.querySelectorAll('[data-col-start]')).filter((el) =>
      el.textContent?.includes(name)
    ) as HTMLElement[]
  }

  function placement(bar: HTMLElement) {
    return { start: bar.dataset.colStart, span: bar.dataset.colSpan }
  }

  it('renders a 600 once, as a bar spanning two columns', () => {
    const { container } = render(<CalendarGridView events={[six]} />)

    const bars = desktopBars(container, 'Saturday 600')
    expect(bars).toHaveLength(1)
    // Saturday is column 6 (1-indexed), and the ride runs into Sunday.
    expect(placement(bars[0])).toEqual({ start: '6', span: '2' })
  })

  it('keeps a same-day 200 as a single-column chip', () => {
    const { container } = render(<CalendarGridView events={[sampleEvents[1]]} />)

    const bars = desktopBars(container, 'Spring 200')
    expect(bars).toHaveLength(1)
    expect(placement(bars[0]).span).toBe('1')
  })

  it('keeps desktop bars in day order in the DOM so keyboard focus moves by date', () => {
    // A Thursday 1200 occupies lane 0 through Sunday, pushing Saturday rides to
    // lane 1 — but Tab should still visit Thursday, then Saturday, then Sunday.
    const thursday1200: Event = {
      ...six,
      slug: 'thu',
      name: 'Thursday 1200',
      date: '2026-05-14',
      distance: '1200',
      startTime: '04:00',
    }
    const saturday200: Event = {
      ...six,
      slug: 'sat',
      name: 'Saturday 200',
      date: '2026-05-16',
      distance: '200',
    }
    const sunday200: Event = {
      ...six,
      slug: 'sun',
      name: 'Sunday 200',
      date: '2026-05-17',
      distance: '200',
    }
    const { container } = render(
      <CalendarGridView events={[saturday200, sunday200, thursday1200]} />
    )

    const order = Array.from(container.querySelectorAll('[data-col-start] a')).map((el) =>
      el.getAttribute('href')
    )
    expect(order).toEqual(['/register/thu', '/register/sat', '/register/sun'])
  })

  it('shows the ACP limit on the bar for multi-day rides only', () => {
    render(<CalendarGridView events={[six]} />)
    expect(screen.getAllByText(/40h limit/).length).toBeGreaterThan(0)

    cleanup()
    render(<CalendarGridView events={[sampleEvents[1]]} />) // 200 km, same day
    expect(screen.queryByText(/limit/)).toBeNull()
  })

  it('announces the span in the link label', () => {
    render(<CalendarGridView events={[six]} />)
    const labels = screen.getAllByRole('link').map((l) => l.getAttribute('aria-label'))
    expect(labels).toContain(
      'Saturday 600, 600 km, Saturday, May 16, 6:00am, 2 days (40h limit), Toronto'
    )
  })

  it('emits the following month for a ride that continues into it', () => {
    const endOfMay: Event = { ...six, slug: 'may-31-600', date: '2026-05-31' } // Sunday
    render(<CalendarGridView events={[endOfMay]} />)

    expect(screen.getByText('May 2026')).toBeInTheDocument()
    expect(screen.getByText('June 2026')).toBeInTheDocument()
  })

  it('splits the bar at the week boundary with continuation flags', () => {
    const endOfMay: Event = { ...six, slug: 'may-31-600', date: '2026-05-31' } // Sunday
    const { container } = render(<CalendarGridView events={[endOfMay]} />)

    const bars = desktopBars(container, 'Saturday 600')
    // One segment on Sunday May 31, one on Monday June 1 (a separate month grid).
    expect(bars).toHaveLength(2)
    expect(placement(bars[0])).toEqual({ start: '7', span: '1' })
    expect(placement(bars[1])).toEqual({ start: '1', span: '1' })
    // The continuation segment flattens its left corner and carries the cue.
    expect(bars[1].querySelector('.rounded-l-none')).not.toBeNull()
    expect(bars[0].querySelector('.rounded-r-none')).not.toBeNull()
  })

  it('shows a mobile dot on every day a ride spans', () => {
    const { container } = render(<CalendarGridView events={[six]} />)

    const mobile = container.querySelector('.sm\\:hidden') as HTMLElement
    const counts = Array.from(mobile.querySelectorAll('.sr-only')).map((el) => el.textContent)
    // Saturday May 16 and Sunday May 17 both report an event.
    expect(counts).toEqual(['1 event', '1 event'])
  })

  it('lists a continued-in ride once, on the first week of the next month', () => {
    const endOfMay: Event = { ...six, slug: 'may-31-600', date: '2026-05-31' }
    const { container } = render(<CalendarGridView events={[endOfMay]} />)

    // May and June are separate sections, each with its own mobile block.
    const rows = Array.from(container.querySelectorAll('.sm\\:hidden')).flatMap((mobile) =>
      Array.from(mobile.querySelectorAll('a')).map((a) => a.textContent)
    )
    // Once in May (its start week) and once in June (the continuation).
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('Sun 31')
    expect(rows[1]).toContain('Mon 1')
  })

  it('does not claim an ARIA grid it cannot honour', () => {
    // Spanning bars break the 7-cells-per-row model and there is no arrow-key
    // navigation, so the month is a plain heading + links with full date labels.
    render(<CalendarGridView events={[six]} />)
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'May 2026' })).toBeInTheDocument()
  })
})
