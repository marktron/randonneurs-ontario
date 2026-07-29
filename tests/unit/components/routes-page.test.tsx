/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoutesPage, type RouteCollection } from '@/components/routes-page'

// Mock PageHero since it uses next/image
vi.mock('@/components/page-hero', () => ({
  PageHero: ({ title }: { title: string }) => <div data-testid="page-hero">{title}</div>,
}))

// Mock page-shell
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// Mock RoutePreviewLink to avoid unrelated dependencies
vi.mock('@/components/route-preview-link', () => ({
  RoutePreviewLink: ({ name }: { name: string }) => <span>{name}</span>,
}))

const sampleCollections: RouteCollection[] = [
  {
    name: '200 km',
    routes: [
      {
        slug: 'spring-200',
        name: 'Spring 200',
        distance: '200',
        rwgpsUrl: null,
        cueSheetUrl: null,
      },
    ],
  },
]

describe('RoutesPage', () => {
  const defaultProps = {
    chapter: 'Toronto',
    chapterSlug: 'toronto',
    description: 'Toronto chapter routes',
    collections: sampleCollections,
  }

  it('renders a descriptive hero h1 including chapter and "Routes"', () => {
    render(<RoutesPage {...defaultProps} />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Toronto Chapter Routes')
  })

  it('reflects the chapter prop in the h1 text', () => {
    render(<RoutesPage {...defaultProps} chapter="Ottawa" chapterSlug="ottawa" />)

    expect(screen.getByTestId('page-hero')).toHaveTextContent('Ottawa Chapter Routes')
  })
})
