/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RoutesIndexPage from '@/app/routes/page'

const mockGetRoutesByChapter = vi.fn()

vi.mock('@/lib/data/routes', () => ({
  getRoutesByChapter: (...args: unknown[]) => mockGetRoutesByChapter(...args),
}))

vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} alt={props.alt ?? ''} />
  ),
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

describe('RoutesIndexPage /routes', () => {
  it('renders a link to every chapter route library with a route count', async () => {
    mockGetRoutesByChapter.mockImplementation(async (slug: string) => {
      const routesBySlug: Record<string, number> = {
        toronto: 3,
        ottawa: 2,
        'simcoe-muskoka': 0,
        huron: 1,
      }
      const count = routesBySlug[slug] ?? 0
      if (count === 0) return []
      return [
        {
          name: '200 km',
          routes: Array.from({ length: count }, (_, i) => ({
            slug: `${slug}-route-${i}`,
            name: `${slug} route ${i}`,
            distance: '200',
            rwgpsUrl: null,
            cueSheetUrl: null,
          })),
        },
      ]
    })

    const Page = await RoutesIndexPage()
    render(Page)

    // Every core chapter is linked to its /routes/{slug} library
    expect(screen.getByRole('link', { name: /toronto/i })).toHaveAttribute(
      'href',
      '/routes/toronto'
    )
    expect(screen.getByRole('link', { name: /ottawa/i })).toHaveAttribute('href', '/routes/ottawa')
    expect(screen.getByRole('link', { name: /simcoe-muskoka/i })).toHaveAttribute(
      'href',
      '/routes/simcoe-muskoka'
    )
    expect(screen.getByRole('link', { name: /huron/i })).toHaveAttribute('href', '/routes/huron')

    // Route counts are surfaced per chapter
    expect(screen.getByText('3 routes')).toBeInTheDocument()
    expect(screen.getByText('2 routes')).toBeInTheDocument()
    expect(screen.getByText('0 routes')).toBeInTheDocument()
    expect(screen.getByText('1 route')).toBeInTheDocument()
  })
})
