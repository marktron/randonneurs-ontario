/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ResultsPage } from '@/components/results-page'
import type { EventResult } from '@/lib/data/results'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// Mock PageShell and PageHero
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/page-hero', () => ({
  PageHero: () => <div data-testid="page-hero" />,
}))

vi.mock('@/components/award-badge', () => ({
  AwardBadge: () => <span data-testid="award-badge" />,
}))

vi.mock('@/lib/dev-data', () => ({
  devData: () => ({}),
}))

const baseFlecheEvent: EventResult = {
  id: 'fleche-1',
  date: '2025-04-26',
  name: 'Ontario Fleche',
  distance: '360',
  eventType: 'fleche',
  routeSlug: null,
  riders: [
    { name: 'Alice Anderson', slug: 'alice-anderson', time: '', isFirstBrevet: false },
    { name: 'Bob Brown', slug: 'bob-brown', time: '', isFirstBrevet: false },
    { name: 'Carol Clark', slug: 'carol-clark', time: '', isFirstBrevet: false },
    { name: 'Dave Davis', slug: 'dave-davis', time: 'DNF', isFirstBrevet: false },
  ],
  teams: [
    {
      teamName: 'Speed Demons',
      distance: '412',
      riders: [
        { name: 'Alice Anderson', slug: 'alice-anderson', time: '', isFirstBrevet: false },
        { name: 'Bob Brown', slug: 'bob-brown', time: '', isFirstBrevet: false },
      ],
    },
    {
      teamName: 'Slow Rollers',
      distance: '380',
      riders: [
        { name: 'Carol Clark', slug: 'carol-clark', time: '', isFirstBrevet: false },
        { name: 'Dave Davis', slug: 'dave-davis', time: 'DNF', isFirstBrevet: false },
      ],
    },
  ],
}

const baseBrevetEvent: EventResult = {
  id: 'brevet-1',
  date: '2025-05-10',
  name: 'Spring 200',
  distance: '200',
  eventType: 'brevet',
  routeSlug: 'spring-200',
  riders: [
    { name: 'Alice Anderson', slug: 'alice-anderson', time: '10:30', isFirstBrevet: false },
    { name: 'Bob Brown', slug: 'bob-brown', time: '11:00', isFirstBrevet: true },
  ],
}

const defaultProps = {
  chapter: 'Other Events',
  chapterSlug: 'other',
  year: 2025,
  description: 'Test description',
  availableYears: [2025, 2024],
}

describe('Fleche results display', () => {
  it('renders team headers and distances for fleche events', () => {
    render(<ResultsPage {...defaultProps} events={[baseFlecheEvent]} />)

    expect(screen.getByText('Speed Demons')).toBeInTheDocument()
    expect(screen.getByText('412 km')).toBeInTheDocument()
    expect(screen.getByText('Slow Rollers')).toBeInTheDocument()
    expect(screen.getByText('380 km')).toBeInTheDocument()
  })

  it('renders riders within team groups', () => {
    render(<ResultsPage {...defaultProps} events={[baseFlecheEvent]} />)

    expect(screen.getByText('Alice Anderson')).toBeInTheDocument()
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('Carol Clark')).toBeInTheDocument()
    expect(screen.getByText('Dave Davis')).toBeInTheDocument()
  })

  it('shows team and rider counts in fleche header', () => {
    render(<ResultsPage {...defaultProps} events={[baseFlecheEvent]} />)

    expect(screen.getByText(/2 teams/)).toBeInTheDocument()
    expect(screen.getByText(/4 riders/)).toBeInTheDocument()
  })

  it('shows DNF status for DNF riders in fleche teams', () => {
    render(<ResultsPage {...defaultProps} events={[baseFlecheEvent]} />)

    const dnfElements = screen.getAllByText('DNF')
    expect(dnfElements.length).toBeGreaterThan(0)
  })

  it('renders Unknown Team with subdued styling', () => {
    const eventWithUnknownTeam: EventResult = {
      ...baseFlecheEvent,
      teams: [
        {
          teamName: 'Unknown Team',
          distance: '360',
          riders: [{ name: 'Eve Evans', slug: 'eve-evans', time: '', isFirstBrevet: false }],
        },
      ],
    }

    render(<ResultsPage {...defaultProps} events={[eventWithUnknownTeam]} />)

    const unknownTeamHeader = screen.getByText('Unknown Team')
    // Unknown Team's parent container has opacity-60 for subdued appearance
    expect(unknownTeamHeader.closest('[class*="opacity"]')?.className).toContain('opacity-60')
  })
})

describe('Non-fleche results display (regression)', () => {
  it('renders flat rider grid for brevet events', () => {
    render(<ResultsPage {...defaultProps} events={[baseBrevetEvent]} />)

    expect(screen.getByText('Alice Anderson')).toBeInTheDocument()
    expect(screen.getByText('10:30')).toBeInTheDocument()
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('11:00')).toBeInTheDocument()
  })

  it('does not render team headers for brevet events', () => {
    render(<ResultsPage {...defaultProps} events={[baseBrevetEvent]} />)

    expect(screen.queryByText('Speed Demons')).not.toBeInTheDocument()
    expect(screen.queryByText('Unknown Team')).not.toBeInTheDocument()
  })

  it('shows distance in header for brevet events', () => {
    render(<ResultsPage {...defaultProps} events={[baseBrevetEvent]} />)

    expect(screen.getByText(/200 km/)).toBeInTheDocument()
  })

  it('renders First Brevet badge for non-fleche events', () => {
    render(<ResultsPage {...defaultProps} events={[baseBrevetEvent]} />)

    expect(screen.getAllByTestId('award-badge').length).toBeGreaterThan(0)
  })
})
