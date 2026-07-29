/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockGetChapterResults = vi.fn().mockResolvedValue([])
const mockGetAvailableYears = vi.fn().mockResolvedValue([2025, 2024])

// Keep the real (pure, static-config-backed) getChapterMeta/getAllChaptersWithYears
// re-exports where possible; only the Supabase-backed fetches need mocking.
vi.mock('@/lib/data/results', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/results')>()
  return {
    ...actual,
    getChapterResults: (...args: unknown[]) => mockGetChapterResults(...args),
    getAvailableYears: (...args: unknown[]) => mockGetAvailableYears(...args),
  }
})

vi.mock('@/components/results-page', () => ({
  ResultsPage: ({ chapter, year }: { chapter: string; year: number }) => (
    <div data-testid="results-page">
      {chapter} {year}
    </div>
  ),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import ChapterResultsPage from '@/app/results/[year]/[chapter]/page'

describe('ChapterResultsPage /results/[year]/[chapter]', () => {
  it('renders the results page and correct breadcrumb JSON-LD', async () => {
    const Page = await ChapterResultsPage({
      params: Promise.resolve({ year: '2025', chapter: 'toronto' }),
    })
    const { container, getByTestId } = render(Page)

    expect(getByTestId('results-page')).toHaveTextContent('Toronto 2025')

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Results',
      '2025 Toronto',
    ])
    expect(data.itemListElement[2].item).toMatch(/\/results\/2025\/toronto$/)
  })
})
