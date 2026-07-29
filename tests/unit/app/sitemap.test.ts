import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/content', () => ({
  getAllPages: vi.fn(),
}))

vi.mock('@/lib/data/events', () => ({
  getAllEventSlugs: vi.fn(),
}))

// Keep the real (pure, static-config-backed) getAllChapterSlugs/getChapterInfo
// re-exports so calendar/route chapter pages still resolve; only the
// Supabase-backed getActiveRoutes needs mocking.
vi.mock('@/lib/data/routes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/data/routes')>()
  return {
    ...actual,
    getActiveRoutes: vi.fn(),
  }
})

vi.mock('@/lib/data/riders', () => ({
  getAllRiders: vi.fn(),
}))

vi.mock('@/lib/data/results', () => ({
  getAllChaptersWithYears: vi.fn(),
}))

import sitemap from '@/app/sitemap'
import { getAllPages, type PageMeta } from '@/lib/content'
import { getAllEventSlugs } from '@/lib/data/events'
import { getActiveRoutes } from '@/lib/data/routes'
import { getAllRiders } from '@/lib/data/riders'
import { getAllChaptersWithYears } from '@/lib/data/results'

const BASE_URL = 'https://www.randonneursontario.ca'

// Relative to "today" so the fixture never silently expires (see
// docs/TESTING.md -> "Avoiding Test Rot" -> never hardcode absolute dates).
function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString()
}

function contentPage(overrides: Partial<PageMeta>): PageMeta {
  return {
    slug: 'origins',
    title: 'Origins',
    description: '',
    lastUpdated: '',
    lastModifiedDate: new Date('2026-01-01'),
    ...overrides,
  }
}

describe('sitemap', () => {
  beforeEach(() => {
    vi.mocked(getAllEventSlugs).mockResolvedValue([])
    vi.mocked(getActiveRoutes).mockResolvedValue([])
    vi.mocked(getAllRiders).mockResolvedValue([])
    vi.mocked(getAllChaptersWithYears).mockResolvedValue([])
    vi.mocked(getAllPages).mockReturnValue([])
  })

  it('does not include the deleted /test-page placeholder', async () => {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls.some((url) => url.endsWith('/test-page'))).toBe(false)
  })

  it('includes the new /awards, /live-tracking, and /control-cards static pages', async () => {
    const entries = await sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls).toContain(`${BASE_URL}/awards`)
    expect(urls).toContain(`${BASE_URL}/live-tracking`)
    expect(urls).toContain(`${BASE_URL}/control-cards`)
  })

  it('lists /about exactly once, even though content/pages/about.md also exists', async () => {
    vi.mocked(getAllPages).mockReturnValue([
      contentPage({ slug: 'about', title: 'About' }),
      contentPage({ slug: 'origins', title: 'Origins' }),
    ])

    const entries = await sitemap()
    const aboutEntries = entries.filter((entry) => entry.url === `${BASE_URL}/about`)

    expect(aboutEntries).toHaveLength(1)
    // The non-colliding content page should still come through.
    expect(entries.some((entry) => entry.url === `${BASE_URL}/origins`)).toBe(true)
  })

  it('sets lastModified on content pages from getAllPages(), but omits it on static pages', async () => {
    vi.mocked(getAllPages).mockReturnValue([
      contentPage({ slug: 'origins', lastModifiedDate: new Date('2025-06-15') }),
    ])

    const entries = await sitemap()
    const origins = entries.find((entry) => entry.url === `${BASE_URL}/origins`)
    const home = entries.find((entry) => entry.url === BASE_URL)

    expect(origins?.lastModified).toEqual(new Date('2025-06-15'))
    expect(home?.lastModified).toBeUndefined()
  })

  it('includes the /routes static page', async () => {
    const entries = await sitemap()
    const routesPage = entries.find((entry) => entry.url === `${BASE_URL}/routes`)

    expect(routesPage).toBeDefined()
    expect(routesPage?.changeFrequency).toBe('monthly')
    expect(routesPage?.priority).toBe(0.7)
  })

  it('sets lastModified on event registration pages from updated_at', async () => {
    const updatedAt = isoDaysFromNow(-3)
    vi.mocked(getAllEventSlugs).mockResolvedValue([{ slug: 'spring-200-2026', updatedAt }])

    const entries = await sitemap()
    const eventPage = entries.find((entry) => entry.url === `${BASE_URL}/register/spring-200-2026`)

    expect(eventPage?.lastModified).toBe(updatedAt)
  })

  it('sets lastModified on route detail pages from updated_at', async () => {
    const updatedAt = isoDaysFromNow(-10)
    vi.mocked(getActiveRoutes).mockResolvedValue([
      {
        id: 'route-1',
        name: 'Toronto 200',
        slug: 'toronto-200',
        distanceKm: 200,
        chapterId: 'chapter-1',
        chapterName: 'Toronto',
        updatedAt,
      },
    ])

    const entries = await sitemap()
    const routePage = entries.find(
      (entry) => entry.url === `${BASE_URL}/routes/toronto/toronto-200`
    )

    expect(routePage?.lastModified).toBe(updatedAt)
  })

  it('sets lastModified on rider pages from updated_at', async () => {
    const updatedAt = isoDaysFromNow(-1)
    vi.mocked(getAllRiders).mockResolvedValue([
      { slug: 'jane-doe', firstName: 'Jane', lastName: 'Doe', updatedAt },
    ])

    const entries = await sitemap()
    const riderPage = entries.find((entry) => entry.url === `${BASE_URL}/riders/jane-doe`)

    expect(riderPage?.lastModified).toBe(updatedAt)
  })
})
