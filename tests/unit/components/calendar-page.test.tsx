/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarPage } from '@/components/calendar-page'
import type { Event } from '@/components/event-card'

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

// Mock PageHero since it uses next/image
vi.mock('@/components/page-hero', () => ({
  PageHero: ({ title }: { title: string }) => <div data-testid="page-hero">{title}</div>,
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

  it('renders the distance filter dropdown', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('renders the view toggle', () => {
    render(<CalendarPage {...defaultProps} />)

    expect(screen.getByRole('group', { name: 'Calendar view' })).toBeInTheDocument()
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

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    expect(screen.getByText('Spring 200')).toBeInTheDocument()
    expect(screen.queryByText('Spring 100')).not.toBeInTheDocument()
    expect(screen.queryByText('Spring 300')).not.toBeInTheDocument()
    expect(screen.queryByText('Summer 600')).not.toBeInTheDocument()
  })

  it('filters to populaires (under 200 km)', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Populaires (under 200 km)' }))

    expect(screen.getByText('Spring 100')).toBeInTheDocument()
    expect(screen.queryByText('Spring 200')).not.toBeInTheDocument()
    expect(screen.queryByText('Spring 300')).not.toBeInTheDocument()
    expect(screen.queryByText('Summer 600')).not.toBeInTheDocument()
  })

  it('shows empty state when no events match filter', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '400 km' }))

    expect(screen.getByText('No events match the selected filter.')).toBeInTheDocument()
  })

  it('can switch back to all distances', async () => {
    const user = userEvent.setup()
    render(<CalendarPage {...defaultProps} />)

    // Filter to 200 km
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    expect(screen.queryByText('Spring 100')).not.toBeInTheDocument()

    // Switch back to all
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'All distances' }))

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
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: '200 km' }))

    // Only the 200km event text should appear
    expect(screen.getAllByText(/Spring 200/).length).toBeGreaterThan(0)
    expect(screen.queryAllByText(/Spring 100/)).toHaveLength(0)
  })
})
