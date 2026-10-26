/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import RegisterPage from '@/app/register/[slug]/page'
import type { EventDetails } from '@/lib/data/events'
import { torontoCalendarYear } from '@/lib/season'

const mockGetEventBySlug = vi.fn()

vi.mock('@/lib/data/events', () => ({
  getEventBySlug: (...args: unknown[]) => mockGetEventBySlug(...args),
  getEventSlugRedirect: vi.fn().mockResolvedValue(null),
  getRegisteredRiders: vi.fn().mockResolvedValue([]),
  getFlecheTeams: vi.fn().mockResolvedValue([]),
  getRegisteredRidersWithTeams: vi.fn().mockResolvedValue([]),
}))

const mockRegistrationSeasonBlock = vi.fn()
vi.mock('@/lib/memberships/season-gate', () => ({
  registrationSeasonBlock: (...args: unknown[]) => mockRegistrationSeasonBlock(...args),
}))

vi.mock('@/lib/rwgps', () => ({
  fetchRwgpsCollection: vi.fn().mockResolvedValue(null),
  buildRwgpsCollectionUrl: (id: string) => `https://ridewithgps.com/collections/${id}`,
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

// The real CTA renders this button (mobile) next to the full form (desktop).
vi.mock('@/components/register-cta', () => ({
  RegisterCTA: () => <button type="button">Register for this event</button>,
}))

vi.mock('@/components/rwgps-embed', () => ({
  RwgpsEmbed: () => null,
}))

vi.mock('@/components/rwgps-collection-embed', () => ({
  RwgpsCollectionEmbed: () => null,
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

// Same clock the page compares against, so the fixture can't drift around New Year's.
const nextSeason = torontoCalendarYear() + 1

const nextSeasonEvent: EventDetails = {
  id: 'evt-next',
  slug: 'new-year-200',
  name: 'New Year 200',
  date: `${nextSeason}-01-15`,
  startTime: '08:00',
  startLocation: 'City Hall',
  distance: 200,
  type: 'Brevet',
  chapterName: 'Toronto',
  chapterSlug: 'toronto',
  rwgpsId: null,
  rwgpsCollectionId: null,
  routeSlug: null,
  cueSheetUrl: null,
  description: null,
  imageUrl: null,
  erwCanonicalUrl: null,
  status: 'scheduled',
}

const closedMessage = `Registration for ${nextSeason} events opens once ${nextSeason} Randonneurs Ontario & Ontario Cycling memberships are available. Check back soon.`

async function renderPage() {
  render(await RegisterPage({ params: Promise.resolve({ slug: nextSeasonEvent.slug }) }))
}

describe('RegisterPage /register/[slug] — next-season gate', () => {
  beforeEach(() => {
    mockGetEventBySlug.mockResolvedValue(nextSeasonEvent)
    mockRegistrationSeasonBlock.mockReset()
  })

  it('shows the closed message in place of the register form when the season gate blocks', async () => {
    mockRegistrationSeasonBlock.mockResolvedValue(closedMessage)

    await renderPage()

    expect(mockRegistrationSeasonBlock).toHaveBeenCalledWith(nextSeason)
    // The alert carries the full gate message; both closed boxes carry the short line.
    expect(screen.getAllByText(closedMessage)).toHaveLength(1)
    expect(screen.getByText(closedMessage)).toHaveAttribute('data-slot', 'alert-description')
    expect(
      screen.getAllByText(`Registration is not open yet for ${nextSeason} events.`)
    ).toHaveLength(2)
    expect(
      screen.getByText(`Registration opens with ${nextSeason} memberships`)
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Register for this event' })
    ).not.toBeInTheDocument()
  })

  it('renders the form when the gate allows', async () => {
    mockRegistrationSeasonBlock.mockResolvedValue(null)

    await renderPage()

    expect(screen.getAllByRole('button', { name: 'Register for this event' })).toHaveLength(2)
    expect(screen.queryByText(closedMessage)).not.toBeInTheDocument()
    expect(
      screen.queryByText(`Registration opens with ${nextSeason} memberships`)
    ).not.toBeInTheDocument()
  })

  it('does not consult the gate for a current-season event', async () => {
    mockGetEventBySlug.mockResolvedValue({
      ...nextSeasonEvent,
      date: `${nextSeason - 1}-12-31`,
    })

    await renderPage()

    expect(mockRegistrationSeasonBlock).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: 'Register for this event' })).toHaveLength(2)
  })

  it('keeps the draft closed state ahead of the season gate', async () => {
    mockGetEventBySlug.mockResolvedValue({ ...nextSeasonEvent, status: 'draft' })
    mockRegistrationSeasonBlock.mockResolvedValue(closedMessage)

    await renderPage()

    expect(screen.getByText('This event is a draft')).toBeInTheDocument()
    expect(screen.queryByText(closedMessage)).not.toBeInTheDocument()
    expect(
      screen.queryByText(`Registration opens with ${nextSeason} memberships`)
    ).not.toBeInTheDocument()
  })
})
