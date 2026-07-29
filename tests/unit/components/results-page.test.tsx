/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultsPage } from '@/components/results-page'
import type { EventResult } from '@/lib/data/results'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock PageHero since it uses next/image
vi.mock('@/components/page-hero', () => ({
  PageHero: ({ title }: { title: string }) => <div data-testid="page-hero">{title}</div>,
}))

// Mock page-shell
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const sampleEvents: EventResult[] = [
  {
    id: 'evt-1',
    date: '2025-04-15',
    name: 'Spring 200',
    distance: '200',
    routeSlug: 'spring-200',
    riders: [
      {
        name: 'Jane Doe',
        slug: 'jane-doe',
        time: '9:30',
        isFirstBrevet: false,
        isCompletedDevilWeek: false,
      },
    ],
  },
]

describe('ResultsPage', () => {
  const defaultProps = {
    chapter: 'Toronto',
    chapterSlug: 'toronto',
    year: 2025,
    description: 'Toronto chapter results',
    events: sampleEvents,
    availableYears: [2025, 2024],
  }

  it('renders a descriptive hero h1 including chapter, year, and "Results"', () => {
    render(<ResultsPage {...defaultProps} />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Toronto Chapter 2025 Results')
  })

  it('reflects the chapter and year props in the h1 text', () => {
    render(<ResultsPage {...defaultProps} chapter="Ottawa" chapterSlug="ottawa" year={2023} />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Ottawa Chapter 2023 Results')
  })
})
