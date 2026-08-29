/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { BrevetCardData } from '@/lib/actions/brevet-card'

const mockGetBrevetCardByToken = vi.fn()

vi.mock('@/lib/actions/brevet-card', () => ({
  getBrevetCardByToken: (token: string) => mockGetBrevetCardByToken(token),
}))
vi.mock('@/components/page-shell', () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/components/brevet-card-view', () => ({
  BrevetCard: () => <div data-testid="brevet-card" />,
}))

// Only the fields the page reads before deciding the card is unavailable.
function cardData(overrides: { eventType?: string; status?: string } = {}): BrevetCardData {
  return {
    registration: { id: 'reg-1', status: overrides.status ?? 'registered' },
    event: {
      name: 'Oak Ridges Moraine',
      distanceKm: 400,
      eventType: overrides.eventType ?? 'brevet',
      status: 'scheduled',
    },
    controls: [],
    checkins: [],
  } as unknown as BrevetCardData
}

async function renderPage(data: BrevetCardData) {
  mockGetBrevetCardByToken.mockResolvedValue(data)
  const { default: BrevetCardPage } = await import('@/app/card/[token]/page')
  const ui = await BrevetCardPage({ params: Promise.resolve({ token: 'tok' }) })
  return render(ui)
}

describe('/card/[token] when the card is unavailable', () => {
  beforeEach(() => {
    mockGetBrevetCardByToken.mockReset()
  })

  it('tells the rider to check back when the organizer has not set up controls yet', async () => {
    await renderPage(cardData())

    expect(
      screen.getByText(
        'The organizer hasn’t set up the digital control card for this event yet. Check back closer to the event, or use the paper brevet card handed out at the start.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /learn more about digital control cards/i })
    ).toHaveAttribute('href', '/digital-control-cards')
    expect(screen.getByRole('link', { name: /manage your registration/i })).toHaveAttribute(
      'href',
      '/registration/manage/tok'
    )
    expect(screen.queryByTestId('brevet-card')).toBeNull()
  })

  it('does not offer the help link when the event type has no digital card', async () => {
    await renderPage(cardData({ eventType: 'fleche' }))

    expect(
      screen.getByText('Digital brevet cards are not available for this type of event.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /learn more/i })).toBeNull()
  })
})
