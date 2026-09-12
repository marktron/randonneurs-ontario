/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarPage } from '@/components/calendar-page'
import type { Event } from '@/components/event-card'
import { isoDaysFromNow } from '@/tests/utils/test-helpers'

// Mock dynamic import for CalendarSubscribeButton
vi.mock('@/components/calendar-subscribe-button', () => ({
  CalendarSubscribeButton: () => <button>Subscribe</button>,
}))

// Mock next/dynamic to render synchronously
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    let Component: React.ComponentType | null = null
    loader().then((mod) => {
      Component = 'default' in mod ? mod.default : (mod as unknown as React.ComponentType)
    })
    return function DynamicComponent(props: Record<string, unknown>) {
      if (!Component) return null
      return <Component {...props} />
    }
  },
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock PageHero since it uses next/image
vi.mock('@/components/page-hero', () => ({
  PageHero: ({ title, eyebrow }: { title: string; eyebrow?: string }) => (
    <div data-testid="page-hero">
      {eyebrow && <span data-testid="page-hero-eyebrow">{eyebrow}</span>}
      {title}
    </div>
  ),
}))

// Mock lib/season since the real helper reads NEXT_PUBLIC_CURRENT_SEASON
vi.mock('@/lib/season', () => ({
  getCurrentSeason: () => 2031,
  getCurrentSeasonLabel: () => '2031',
}))

// Mock page-shell
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

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
    slug: 'spring-200-2026-04-20',
    date: '2026-04-20',
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
  {
    slug: 'summer-600-2026-06-15',
    date: '2026-06-15',
    name: 'Summer 600',
    type: 'Brevet',
    distance: '600',
    startLocation: 'Arena',
    startTime: '05:00',
    status: 'scheduled',
    chapterName: 'Toronto',
  },
]

describe('CalendarPage', () => {
  const defaultProps = {
    chapter: 'Toronto',
    chapterSlug: 'toronto',
    description: 'Toronto chapter events',
    events: sampleEvents,
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the current season in the hero eyebrow', () => {
    render(<CalendarPage {...defaultProps} />)
    expect(screen.getByTestId('page-hero-eyebrow')).toHaveTextContent('2031 Season')
  })

  it('defaults the hero h1 to the chapter name when no title override is given', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Toronto')
  })

  it('uses the title override for the hero h1 when provided', () => {
    render(<CalendarPage {...defaultProps} title="Toronto Chapter Ride Calendar" />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Toronto Chapter Ride Calendar')
  })

  it('renders the distance filter dropdown', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByRole('combobox', { name: 'Filter by distance' })).toBeInTheDocument()
  })

  it('renders the view toggle', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'List view' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Grid view' })).toBeInTheDocument()
  })

  it('shows list view by default', () => {
    render(<CalendarPage {...defaultProps} />)

    const listToggle = screen.getByRole('radio', { name: 'List view' })
    expect(listToggle).toHaveAttribute('data-state', 'on')
  })

  it('shows all events by default', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByText('Spring 100')).toBeInTheDocument()
    expect(screen.getByText('Spring 200')).toBeInTheDocument()
    expect(screen.getByText('Spring 300')).toBeInTheDocument()
    expect(screen.getByText('Summer 600')).toBeInTheDocument()
  })

  it('switches to grid view when grid toggle is clicked', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    const gridToggle = screen.getByRole('radio', { name: 'Grid view' })
    expect(gridToggle).toHaveAttribute('data-state', 'on')
  })

  it('persists view preference to localStorage', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    expect(localStorage.getItem('ro-calendar-view')).toBe('grid')
  })

  it('restores view preference from localStorage', () => {
    localStorage.setItem('ro-calendar-view', 'grid')
    render(<CalendarPage {...defaultProps} />)

    const gridToggle = screen.getByRole('radio', { name: 'Grid view' })
    expect(gridToggle).toHaveAttribute('data-state', 'on')
  })

  it('ignores invalid localStorage values', () => {
    localStorage.setItem('ro-calendar-view', 'invalid')
    render(<CalendarPage {...defaultProps} />)

    const listToggle = screen.getByRole('radio', { name: 'List view' })
    expect(listToggle).toHaveAttribute('data-state', 'on')
  })

  it('filters to 200 km events', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    expect(screen.getByText('Spring 200')).toBeInTheDocument()
    expect(screen.queryByText('Spring 100')).not.toBeInTheDocument()
    expect(screen.queryByText('Spring 300')).not.toBeInTheDocument()
    expect(screen.queryByText('Summer 600')).not.toBeInTheDocument()
  })

  it('filters to populaires (under 200 km)', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: 'Populaires (under 200 km)' }))

    expect(screen.getByText('Spring 100')).toBeInTheDocument()
    expect(screen.queryByText('Spring 200')).not.toBeInTheDocument()
    expect(screen.queryByText('Spring 300')).not.toBeInTheDocument()
    expect(screen.queryByText('Summer 600')).not.toBeInTheDocument()
  })

  it('shows empty state when no events match filter', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: '400 km' }))

    const matches = screen.getAllByText('No events match the selected filter.')
    // One visible, one in the sr-only live region
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches.some((el) => !el.classList.contains('sr-only'))).toBe(true)
  })

  it('can switch back to all distances', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    // Filter to 200 km
    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    expect(screen.queryByText('Spring 100')).not.toBeInTheDocument()

    // Switch back to all
    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: 'All Distances' }))

    expect(screen.getByText('Spring 100')).toBeInTheDocument()
    expect(screen.getByText('Spring 200')).toBeInTheDocument()
    expect(screen.getByText('Spring 300')).toBeInTheDocument()
    expect(screen.getByText('Summer 600')).toBeInTheDocument()
  })

  it('applies distance filter in grid view too', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    // Switch to grid view
    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    // Filter to 200 km
    await user.click(screen.getByRole('combobox', { name: 'Filter by distance' }))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    // Only the 200km event text should appear
    expect(screen.getAllByText(/Spring 200/).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Spring 100/)).toHaveLength(0)
  })

  it('hides the view/filter controls row in print', () => {
    const { container } = render(<CalendarPage {...defaultProps} />)
    const controlsRow = screen
      .getByRole('radiogroup', { name: 'Calendar view' })
      .closest('div.mb-8')
    expect(controlsRow?.className).toContain('print:hidden')
    // Sanity: the row we found is the one the test intends to check.
    expect(container.querySelector('.print\\:hidden.mb-8')).not.toBeNull()
  })

  it('omits the chapter suffix in print when scoped to a single chapter', async () => {
    const user = userEvent.setup()
    const { container } = render(<CalendarPage {...defaultProps} chapterSlug="toronto" />)

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    const chip = container.querySelector('.bg-yellow-600') as HTMLElement
    const chapterSpan = Array.from(chip.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('Ottawa')
    )
    expect(chapterSpan?.className).toContain('print:hidden')
  })

  it('keeps the chapter suffix visible in print for the all-chapters calendar', async () => {
    const user = userEvent.setup()
    const { container } = render(<CalendarPage {...defaultProps} chapterSlug="all" />)

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    const chip = container.querySelector('.bg-yellow-600') as HTMLElement
    const chapterSpan = Array.from(chip.querySelectorAll('span')).find((el) =>
      el.textContent?.includes('Ottawa')
    )
    expect(chapterSpan?.className).not.toContain('print:hidden')
  })

  it('passes a print heading containing the chapter title to the grid view', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <CalendarPage {...defaultProps} title="Toronto Chapter Ride Calendar" />
    )

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    expect(
      Array.from(container.querySelectorAll('p')).some((p) =>
        p.textContent?.includes('Toronto Chapter Ride Calendar')
      )
    ).toBe(true)
  })
})

describe('CalendarPage — draft schedule notice', () => {
  const defaultProps = {
    chapter: 'Toronto',
    chapterSlug: 'toronto',
    description: 'Toronto chapter events',
    events: sampleEvents,
  }

  // Relative to "today" so the fixture never silently expires (see
  // docs/TESTING.md -> "Avoiding Test Rot").
  const draftEventDate = isoDaysFromNow(300)
  const draftEventYear = new Date(draftEventDate + 'T00:00:00').getFullYear()

  const draftEvent: Event = {
    slug: 'winter-draft',
    date: draftEventDate,
    name: 'Winter Draft',
    type: 'Brevet',
    distance: '200',
    startLocation: 'TBD',
    startTime: '08:00',
    status: 'draft',
    chapterName: 'Toronto',
  }

  beforeEach(() => {
    localStorage.clear()
  })

  it('does not show the notice when there are no draft events', () => {
    render(<CalendarPage {...defaultProps} />)
    expect(screen.queryByText(/schedule is a draft/)).not.toBeInTheDocument()
  })

  it('shows the draft schedule notice with the earliest draft year, verbatim', () => {
    render(<CalendarPage {...defaultProps} events={[...sampleEvents, draftEvent]} />)
    expect(
      screen.getByText(
        `The ${draftEventYear} schedule is a draft. Events and dates may change. Registration opens once the schedule is final.`
      )
    ).toBeInTheDocument()
  })

  it('uses the earliest year among multiple draft events', () => {
    // 365+ days apart guarantees the two dates fall in different calendar
    // years regardless of what "today" is when this test runs.
    const laterDate = isoDaysFromNow(500)
    const earlierDate = isoDaysFromNow(30)
    const earlierYear = new Date(earlierDate + 'T00:00:00').getFullYear()
    const laterDraft: Event = { ...draftEvent, slug: 'later-draft', date: laterDate }
    const earlierDraft: Event = { ...draftEvent, slug: 'earlier-draft', date: earlierDate }

    render(<CalendarPage {...defaultProps} events={[...sampleEvents, laterDraft, earlierDraft]} />)

    expect(
      screen.getByText(new RegExp(`^The ${earlierYear} schedule is a draft\\.`))
    ).toBeInTheDocument()
  })

  it('shows the notice in grid view too', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} events={[...sampleEvents, draftEvent]} />)

    await user.click(screen.getByRole('radio', { name: 'Grid view' }))

    expect(screen.getByText(/schedule is a draft/)).toBeInTheDocument()
  })

  it('shrinks the draft notice text for print', () => {
    render(<CalendarPage {...defaultProps} events={[...sampleEvents, draftEvent]} />)

    const notice = screen.getByText(/schedule is a draft/)
    expect(notice.className).toContain('print:text-xs')
  })
})
