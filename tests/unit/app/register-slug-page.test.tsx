/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegisterPage, * as registerPageModule from '@/app/register/[slug]/page'
import { isoDaysFromNow } from '@/tests/utils/test-helpers'

const mockGetEventBySlug = vi.fn()
const mockGetRegisteredRiders = vi.fn().mockResolvedValue([])
const mockGetFlecheTeams = vi.fn().mockResolvedValue([])
const mockGetRegisteredRidersWithTeams = vi.fn().mockResolvedValue([])

vi.mock('@/lib/data/events', () => ({
  getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
  getRegisteredRiders: (...args: unknown[]) => mockGetRegisteredRiders(...args),
  getFlecheTeams: (...args: unknown[]) => mockGetFlecheTeams(...args),
  getRegisteredRidersWithTeams: (...args: unknown[]) => mockGetRegisteredRidersWithTeams(...args),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/markdown-content', () => ({
  MarkdownContent: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}))

vi.mock('@/components/register-cta', () => ({
  RegisterCTA: () => <div data-testid="register-cta">register-cta</div>,
}))

vi.mock('@/components/rwgps-embed', () => ({
  RwgpsEmbed: () => <div data-testid="rwgps-embed" />,
}))

const mockEventJsonLd = vi.fn()
vi.mock('@/components/structured-data', () => ({
  EventJsonLd: (props: unknown) => {
    mockEventJsonLd(props)
    return null
  },
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

describe('RegisterPage /register/[slug] — route config', () => {
  // The page is the site's most-crawled content: it must stay cached and rely
  // on tag invalidation (registrations / events / event-${slug}) for freshness,
  // with the hourly window as a backstop. Reverting to force-dynamic would make
  // every crawl a full SSR again.
  it('renders with ISR rather than force-dynamic', () => {
    const config = registerPageModule as Record<string, unknown>
    expect(config.revalidate).toBe(3600)
    expect(config.dynamic).toBeUndefined()
  })
})

describe('RegisterPage /register/[slug] — cancelled event', () => {
  it('renders the cancelled banner, hides RegisterCTA, and shows the description', async () => {
    mockGetEventBySlug.mockResolvedValue({
      id: 'evt-1',
      slug: 'spring-200',
      name: 'Spring 200',
      date: '2030-06-15',
      startTime: '08:00',
      startLocation: 'City Hall',
      distance: 200,
      type: 'Brevet',
      chapterName: 'Toronto',
      chapterSlug: 'toronto',
      rwgpsId: null,
      routeSlug: null,
      cueSheetUrl: null,
      description: 'CANCELLED: weather forecast.\n\nA brevet through Toronto.',
      imageUrl: null,
      erwCanonicalUrl: null,
      status: 'cancelled',
    })

    const Page = await RegisterPage({ params: Promise.resolve({ slug: 'spring-200' }) })
    render(Page)

    expect(screen.getByText(/this event has been cancelled/i)).toBeInTheDocument()
    // The destructive alert role makes the banner discoverable
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByTestId('register-cta')).not.toBeInTheDocument()
    expect(screen.getByTestId('markdown-content')).toHaveTextContent(/CANCELLED: weather forecast/)
  })
})

const draftEvent = {
  id: 'evt-2',
  slug: 'winter-draft',
  name: 'Winter Draft',
  date: isoDaysFromNow(300),
  startTime: '08:00',
  startLocation: 'TBD',
  distance: 200,
  type: 'Brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
  rwgpsId: null,
  routeSlug: null,
  cueSheetUrl: null,
  description: null,
  imageUrl: null,
  erwCanonicalUrl: null,
  status: 'draft',
}

describe('RegisterPage /register/[slug] — draft event', () => {
  beforeEach(() => {
    mockEventJsonLd.mockClear()
  })

  it('renders the draft alert, hides RegisterCTA, shows the closed message, and skips EventJsonLd', async () => {
    mockGetEventBySlug.mockResolvedValue(draftEvent)

    const Page = await RegisterPage({ params: Promise.resolve({ slug: 'winter-draft' }) })
    render(Page)

    expect(screen.getByText('This event is a draft')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The date and details are proposed and may change. Registration opens once the schedule is final.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByTestId('register-cta')).not.toBeInTheDocument()
    // Both the mobile and desktop CTA sites render the closed message.
    expect(screen.getAllByText('Registration is not open yet for this draft event.')).toHaveLength(
      2
    )
    expect(mockEventJsonLd).not.toHaveBeenCalled()
  })

  it('hides the registered-riders section for drafts', async () => {
    mockGetEventBySlug.mockResolvedValue(draftEvent)

    const Page = await RegisterPage({ params: Promise.resolve({ slug: 'winter-draft' }) })
    render(Page)

    expect(screen.queryByText('Registered')).not.toBeInTheDocument()
    expect(screen.queryByText(/No riders registered yet/)).not.toBeInTheDocument()
  })

  it('skips the riders/teams data fetches entirely for drafts (nothing to show, so no reason to fetch)', async () => {
    mockGetEventBySlug.mockResolvedValue(draftEvent)
    mockGetRegisteredRiders.mockClear()
    mockGetRegisteredRidersWithTeams.mockClear()
    mockGetFlecheTeams.mockClear()

    await RegisterPage({ params: Promise.resolve({ slug: 'winter-draft' }) })

    expect(mockGetRegisteredRiders).not.toHaveBeenCalled()
    expect(mockGetRegisteredRidersWithTeams).not.toHaveBeenCalled()
    expect(mockGetFlecheTeams).not.toHaveBeenCalled()
  })

  it('does not show the cancelled banner for a draft event', async () => {
    mockGetEventBySlug.mockResolvedValue(draftEvent)

    const Page = await RegisterPage({ params: Promise.resolve({ slug: 'winter-draft' }) })
    render(Page)

    expect(screen.queryByText(/this event has been cancelled/i)).not.toBeInTheDocument()
  })
})

describe('RegisterPage /register/[slug] — generateMetadata for drafts', () => {
  it('sets robots noindex/nofollow and appends (draft) to the title instead of "Register for"', async () => {
    mockGetEventBySlug.mockResolvedValue(draftEvent)

    const metadata = (await registerPageModule.generateMetadata({
      params: Promise.resolve({ slug: 'winter-draft' }),
    })) as { title: string; robots?: { index: boolean; follow: boolean } }

    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.title).toBe('Winter Draft 200km (draft)')
  })

  it('does not set robots on a scheduled event', async () => {
    mockGetEventBySlug.mockResolvedValue({ ...draftEvent, status: 'scheduled' })

    const metadata = (await registerPageModule.generateMetadata({
      params: Promise.resolve({ slug: 'winter-draft' }),
    })) as { title: string; robots?: { index: boolean; follow: boolean } }

    expect(metadata.robots).toBeUndefined()
    expect(metadata.title).toBe('Register for Winter Draft 200km')
  })
})
