/**
 * @vitest-environment node
 *
 * The homepage grid stacks in source order below lg, so where NewsSection
 * sits in the server HTML decides whether notices are visible on a phone
 * without scrolling past the intro. Guard that order, and that no empty
 * wrapper (and its grid gap) is emitted when there is nothing to show.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToString } from 'react-dom/server'

const mockGetPublishedNews = vi.fn()

vi.mock('@/lib/data/news', () => ({
  getPublishedNews: () => mockGetPublishedNews(),
}))
vi.mock('@/lib/hero-images', () => ({ getHeroImages: () => [] }))
vi.mock('@/components/hero', () => ({ Hero: () => <div data-hero /> }))
vi.mock('@/components/upcoming-rides', () => ({ UpcomingRides: () => <div>upcoming</div> }))
vi.mock('@/components/my-rides-section', () => ({ MyRidesSection: () => <div>my rides</div> }))
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

async function renderHome() {
  const { default: Page } = await import('@/app/page')
  return renderToString(await Page())
}

describe('homepage layout', () => {
  beforeEach(() => {
    mockGetPublishedNews.mockReset()
  })

  it('renders news before the headline so it stacks above the intro on small screens', async () => {
    mockGetPublishedNews.mockResolvedValue([
      {
        id: '1',
        title: 'Start moved to 6am',
        body: 'Details',
        teaser: null,
        created_at: '2026-10-01T00:00:00Z',
      },
    ])

    const html = await renderHome()
    const news = html.indexOf('aria-label="News and notices"')
    const headline = html.indexOf('Long-Distance Cycling, at Your Own Pace')
    const upcoming = html.indexOf('upcoming')

    expect(news).toBeGreaterThan(-1)
    expect(news).toBeLessThan(headline)
    expect(headline).toBeLessThan(upcoming)
  })

  it('omits the news block entirely when nothing is published', async () => {
    mockGetPublishedNews.mockResolvedValue([])

    const html = await renderHome()

    expect(html).not.toContain('News and notices')
    // Count grid cells: with no news only the intro and sidebar remain.
    expect(html.match(/lg:col-start-2/g)?.length ?? 0).toBe(1)
  })
})
