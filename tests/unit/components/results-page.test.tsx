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

  it('renders the event date in long form', () => {
    render(<ResultsPage {...defaultProps} />)

    expect(screen.getByText(/April 15, 2025/)).toBeInTheDocument()
  })

  it('still renders event dates when the browser cannot build a DateTimeFormat', () => {
    // Some browsers throw `TypeError: failed to initialize DateTimeFormat`
    // (broken ICU data, unrecognized system time zone). The page must not
    // depend on Intl to render a date.
    // Stub both entry points: the Date intrinsic does not go through the
    // global Intl.DateTimeFormat binding, so stubbing only one would let a
    // rewrite via the other slip past this test.
    const fail = () => {
      throw new TypeError('failed to initialize DateTimeFormat')
    }
    const dateSpy = vi.spyOn(Date.prototype, 'toLocaleDateString').mockImplementation(fail)
    const intlSpy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(fail)

    try {
      expect(() => render(<ResultsPage {...defaultProps} />)).not.toThrow()
      expect(screen.getByText(/April 15, 2025/)).toBeInTheDocument()
    } finally {
      dateSpy.mockRestore()
      intlSpy.mockRestore()
    }
  })

  it('falls back to the raw string for a malformed date', () => {
    const events: EventResult[] = [{ ...sampleEvents[0], date: 'not-a-date' }]

    render(<ResultsPage {...defaultProps} events={events} />)

    expect(screen.getByText(/not-a-date/)).toBeInTheDocument()
  })
})
