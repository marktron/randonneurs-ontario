/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockGetRouteBySlug = vi.fn()
const mockGetRouteResults = vi.fn().mockResolvedValue([])

// Keep the real (pure, static-config-backed) getChapterInfo re-export; only the
// Supabase-backed fetches need mocking.
vi.mock('@/lib/data/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/routes')>()
  return {
    ...actual,
    getRouteBySlug: (...args: unknown[]) => mockGetRouteBySlug(...args),
    getRouteResults: (...args: unknown[]) => mockGetRouteResults(...args),
  }
})

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/page-hero', () => ({
  PageHero: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('@/components/award-badge', () => ({
  AwardBadge: ({ award }: { award: { title: string } }) => <span>{award.title}</span>,
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: React.ReactNode
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

import RouteDetailPage from '@/app/routes/[chapter]/[slug]/page'

describe('RouteDetailPage /routes/[chapter]/[slug]', () => {
  it('renders correct breadcrumb JSON-LD for the route', async () => {
    mockGetRouteBySlug.mockResolvedValue({
      slug: 'spring-200',
      name: 'Spring 200',
      distanceKm: 200,
      chapterName: 'Toronto',
      rwgpsId: null,
      rwgpsCollectionId: null,
      cueSheetUrl: null,
    })

    const Page = await RouteDetailPage({
      params: Promise.resolve({ chapter: 'toronto', slug: 'spring-200' }),
    })
    const { container } = render(Page)

    const script = container.querySelector('script[type="application/ld+json"]')
    expect(script).not.toBeNull()
    const data = JSON.parse(script!.innerHTML)

    expect(data['@type']).toBe('BreadcrumbList')
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Routes',
      'Toronto',
      'Spring 200',
    ])
    expect(data.itemListElement[3].item).toMatch(/\/routes\/toronto\/spring-200$/)
  })
})
