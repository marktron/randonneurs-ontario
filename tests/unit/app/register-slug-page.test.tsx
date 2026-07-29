/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegisterPage, * as registerPageModule from '@/app/register/[slug]/page'

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

vi.mock('@/components/structured-data', () => ({
  EventJsonLd: () => null,
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
