/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockGetRoutesByChapter = vi.fn().mockResolvedValue([])

// Keep the real (pure, static-config-backed) getChapterInfo/getAllChapterSlugs
// re-exports; only the Supabase-backed getRoutesByChapter needs mocking.
vi.mock('@/lib/data/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/routes')>()
  return {
    ...actual,
    getRoutesByChapter: (...args: unknown[]) => mockGetRoutesByChapter(...args),
  }
})

vi.mock('@/components/routes-page', () => ({
  RoutesPage: ({ chapter }: { chapter: string }) => <div data-testid="routes-page">{chapter}</div>,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

import ChapterRoutesPage from '@/app/routes/[chapter]/page'

describe('ChapterRoutesPage /routes/[chapter]', () => {
  it('renders the routes page and correct breadcrumb JSON-LD', async () => {
    const Page = await ChapterRoutesPage({ params: Promise.resolve({ chapter: 'toronto' }) })
    const { container, getByTestId } = render(Page)

    expect(getByTestId('routes-page')).toHaveTextContent('Toronto')

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Routes',
      'Toronto',
    ])
    expect(data.itemListElement[2].item).toMatch(/\/routes\/toronto$/)
  })
})
