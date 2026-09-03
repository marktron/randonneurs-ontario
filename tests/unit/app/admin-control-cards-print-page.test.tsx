/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

/**
 * The printed card's headline identity comes from the event's own name in our
 * database, not from the linked RWGPS route's name. Route names drift from
 * what riders were told they signed up for (they carry RWGPS-side edits,
 * distance suffixes, versioning), and a route is often shared by several
 * events. The one exception is a collection event, where each printed card is
 * for a single leg and takes that leg's name.
 */

const mockRequireAdmin = vi.fn().mockResolvedValue({
  name: 'Admin Person',
  phone: '',
  email: 'admin@example.com',
})
vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: () => mockRequireAdmin(),
}))

vi.mock('@/lib/data/first-time-riders', () => ({
  getFirstTimeRiderIds: vi.fn().mockResolvedValue([]),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound')
  },
}))

// qrcode.react renders a <canvas>-free SVG, but keep it trivial for speed.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-qr={value} />,
}))

let eventRow: Record<string, unknown> | null = null
let controlRows: Record<string, unknown>[] = []
let registrationRows: Record<string, unknown>[] = []

/**
 * Minimal chainable stand-in for the three queries this page makes:
 *   events         → .select().eq().single()
 *   registrations  → .select().eq().eq().order()
 *   event_controls → .select().eq().order()
 */
function makeQueryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    single: async () => ({ data: table === 'events' ? eventRow : null }),
    order: async () => ({
      data:
        table === 'event_controls'
          ? controlRows
          : table === 'registrations'
            ? registrationRows
            : [],
    }),
  }
  return builder
}

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => makeQueryBuilder(table) }),
}))

import PrintPage from '@/app/admin/events/[id]/control-cards/print/page'

const CONTROLS = JSON.stringify([
  { name: 'Start', distance: 0 },
  { name: 'Finish', distance: 200 },
])

function renderPage(searchParams: Record<string, string> = {}) {
  return PrintPage({
    params: Promise.resolve({ id: 'event-1' }),
    searchParams: Promise.resolve({ controls: CONTROLS, ...searchParams }),
  })
}

beforeEach(() => {
  controlRows = []
  registrationRows = []
  eventRow = {
    id: 'event-1',
    name: 'Ottawa 200 Brevet',
    event_date: '2026-08-01',
    start_time: '06:00',
    start_location: 'Ottawa',
    distance_km: 200,
    event_type: 'brevet',
    status: 'open',
    chapters: { id: 'ch-1', name: 'Ottawa' },
    routes: { id: 'r-1', name: 'Carleton Place 1000 v3 (RWGPS)', rwgps_id: '12345' },
  }
})

describe('Admin control-cards print page — card identity', () => {
  it('titles the card with the event name, not the linked route name', async () => {
    const { container } = render(await renderPage())

    const routeNames = Array.from(container.querySelectorAll('.route-name')).map(
      (el) => el.textContent
    )
    expect(routeNames.length).toBeGreaterThan(0)
    for (const name of routeNames) {
      expect(name).toBe('Ottawa 200 Brevet')
    }
    expect(container.textContent).not.toContain('Carleton Place 1000 v3 (RWGPS)')
  })

  it('uses the event name in the back-page column header too', async () => {
    const { container } = render(await renderPage())

    const backHeaders = Array.from(container.querySelectorAll('.back-header')).map(
      (el) => el.textContent
    )
    expect(backHeaders.some((h) => h?.includes('Ottawa 200 Brevet 200 km'))).toBe(true)
  })

  it('still uses the linked route for the Route Map QR code', async () => {
    const { container } = render(await renderPage())

    expect(container.querySelector('[data-qr="https://ridewithgps.com/routes/12345"]')).toBeTruthy()
  })

  it('keeps per-leg names on collection events', async () => {
    controlRows = [
      { name: 'A Start', distance_km: 0, leg_rwgps_id: '101', leg_name: 'Leg 1: Gravenhurst' },
      { name: 'A Finish', distance_km: 205.3, leg_rwgps_id: '101', leg_name: 'Leg 1: Gravenhurst' },
      { name: 'B Start', distance_km: 0, leg_rwgps_id: '102', leg_name: 'Leg 2: Haliburton' },
      { name: 'B Finish', distance_km: 302.1, leg_rwgps_id: '102', leg_name: 'Leg 2: Haliburton' },
    ]

    const { container } = render(await renderPage())

    const routeNames = Array.from(container.querySelectorAll('.route-name')).map(
      (el) => el.textContent
    )
    expect(routeNames).toContain('Leg 1: Gravenhurst')
    expect(routeNames).toContain('Leg 2: Haliburton')
    // The event name must not leak onto a leg card's headline.
    expect(routeNames).not.toContain('Ottawa 200 Brevet')
  })

  it('prints one whole-event card per rider when cardLayout=event', async () => {
    eventRow = {
      ...eventRow,
      distance_km: 507.4,
      routes: {
        id: 'r-1',
        name: 'Test collection',
        rwgps_id: null,
        rwgps_collection_id: '999',
      },
    }
    controlRows = [
      { name: 'A Start', distance_km: 0, leg_rwgps_id: '101', leg_name: 'Leg 1: Gravenhurst' },
      {
        name: 'Overnight control',
        distance_km: 205.3,
        leg_rwgps_id: '101',
        leg_name: 'Leg 1: Gravenhurst',
      },
      { name: 'B Start', distance_km: 0, leg_rwgps_id: '102', leg_name: 'Leg 2: Haliburton' },
      { name: 'B Finish', distance_km: 302.1, leg_rwgps_id: '102', leg_name: 'Leg 2: Haliburton' },
    ]

    const { container } = render(await renderPage({ cardLayout: 'event' }))

    const routeNames = Array.from(container.querySelectorAll('.route-name')).map(
      (el) => el.textContent
    )
    expect(routeNames).toEqual(['Ottawa 200 Brevet', 'Ottawa 200 Brevet'])
    expect(container.textContent).not.toContain('Leg 1: Gravenhurst')
    expect(container.textContent).not.toContain('Leg 2: Haliburton')
    // The shared boundary appears once on each of the two default blank cards.
    expect(container.querySelectorAll('.control-name')).toHaveLength(6)
    expect(container.textContent).toContain('507.4 km')
    expect(
      container.querySelector('[data-qr="https://ridewithgps.com/collections/999"]')
    ).toBeTruthy()
  })
})

describe('Admin control-cards print page — digital card riders', () => {
  beforeEach(() => {
    registrationRows = [
      {
        id: 'reg-1',
        rider_id: 'rider-1',
        management_token: 'token-1',
        brevet_card_type: 'paper',
        riders: { id: 'rider-1', first_name: 'Paper', last_name: 'Rider' },
      },
      {
        id: 'reg-2',
        rider_id: 'rider-2',
        management_token: 'token-2',
        brevet_card_type: 'digital',
        riders: { id: 'rider-2', first_name: 'Digital', last_name: 'Rider' },
      },
    ]
  })

  it('does not print a card for a digital-card rider when printing everyone', async () => {
    const { container } = render(await renderPage())

    expect(container.textContent).toContain('Paper Rider')
    expect(container.textContent).not.toContain('Digital Rider')
  })

  it('prints the digital-card rider when explicitly selected via riderIds', async () => {
    const { container } = render(await renderPage({ riderIds: 'rider-2' }))

    expect(container.textContent).toContain('Digital Rider')
  })
})
