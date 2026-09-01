/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ControlCardsPrint } from '@/components/admin/control-cards-print'
import type { CardEvent, CardRider, OrganizerInfo, ControlPoint } from '@/types/control-card'

const baseEvent: CardEvent = {
  id: 'event-1',
  name: 'Test Brevet',
  routeName: 'Test Brevet',
  distance: 200,
  nominalDistance: 200,
  date: new Date('2026-05-15T06:00:00-04:00'),
  startTime: '06:00',
  startLocation: 'Test Start',
  chapter: 'Toronto',
}

const baseOrganizer: OrganizerInfo = {
  name: 'Org Anizer',
  phone: '416-555-1212',
  email: 'org@example.com',
}

const baseControls: ControlPoint[] = [
  { id: 'c0', name: 'Start', distance: 0, openTime: 'Fri 06h00', closeTime: 'Fri 07h00' },
  { id: 'c1', name: 'Finish', distance: 200, openTime: 'Fri 11h53', closeTime: 'Fri 19h30' },
]

function renderWithRiders(riders: CardRider[]) {
  return render(
    <ControlCardsPrint
      event={baseEvent}
      organizer={baseOrganizer}
      controls={baseControls}
      riders={riders}
      totalAllowableTime={{ hours: 13, minutes: 30 }}
      formattedDate="Fri, May 15, 2026"
    />
  )
}

describe('ControlCardsPrint — first-time rider indicator', () => {
  it('prepends ★ to the vertical name on the front for first-time riders', () => {
    renderWithRiders([
      { id: 'r-newbie', firstName: 'Nora', lastName: 'Newbie', isFirstTimeRider: true },
    ])

    expect(screen.getByText('★ Newbie, Nora')).toBeTruthy()
  })

  it('does not prepend ★ for experienced riders', () => {
    renderWithRiders([
      { id: 'r-vet', firstName: 'Vera', lastName: 'Veteran', isFirstTimeRider: false },
    ])

    expect(screen.getByText('Veteran, Vera')).toBeTruthy()
    expect(screen.queryByText(/^★/)).toBeNull()
  })

  it('does not prepend ★ when the flag is omitted', () => {
    renderWithRiders([{ id: 'r-unknown', firstName: 'Unk', lastName: 'Nown' }])

    expect(screen.getByText('Nown, Unk')).toBeTruthy()
    expect(screen.queryByText(/^★/)).toBeNull()
  })
})

/**
 * Event names usually carry the distance already ("Ottawa 200"), and the card
 * appends "{distance} km" in two places — the front's distance/date line and
 * the back's middle column header. Appending unconditionally reads as
 * "Ottawa 200 200 km".
 */
describe('ControlCardsPrint — distance already stated in the title', () => {
  function renderNamed(routeName: string, distance: number) {
    return render(
      <ControlCardsPrint
        event={{ ...baseEvent, routeName, distance }}
        organizer={baseOrganizer}
        controls={baseControls}
        riders={[{ id: 'r1', firstName: 'Solo', lastName: 'Rider' }]}
        totalAllowableTime={{ hours: 13, minutes: 30 }}
        formattedDate="Fri, May 15, 2026"
      />
    )
  }

  it('does not repeat the distance in the back header when the name states it', () => {
    const { container } = renderNamed('Ottawa 200', 200)
    expect(container.textContent).not.toContain('Ottawa 200 200 km')
    const backHeaders = Array.from(container.querySelectorAll('.back-header')).map(
      (el) => el.textContent
    )
    expect(backHeaders.some((h) => h?.includes('Ottawa 200'))).toBe(true)
  })

  it('does not repeat the distance on the front when the name states it', () => {
    const { container } = renderNamed('Ottawa 200', 200)
    const distanceLine = container.querySelector('.distance-date')
    expect(distanceLine?.textContent).toBe('Fri, May 15, 2026')
  })

  it('still appends the distance when the name does not state it', () => {
    const { container } = renderNamed('Hard, Short and Long.', 1000)
    const backHeaders = Array.from(container.querySelectorAll('.back-header')).map(
      (el) => el.textContent
    )
    expect(backHeaders.some((h) => h?.includes('Hard, Short and Long. 1000 km'))).toBe(true)
    expect(container.querySelector('.distance-date')?.textContent).toContain('1000 km')
  })

  it('still appends the real distance when the name is only nominal', () => {
    const { container } = renderNamed('Ottawa 200', 203.4)
    const backHeaders = Array.from(container.querySelectorAll('.back-header')).map(
      (el) => el.textContent
    )
    expect(backHeaders.some((h) => h?.includes('Ottawa 200 203.4 km'))).toBe(true)
  })
})

describe('ControlCardsPrint — digital brevet card banner', () => {
  it('shows the banner with a QR when the rider has a cardUrl', () => {
    const { container } = renderWithRiders([
      {
        id: 'r1',
        firstName: 'Digi',
        lastName: 'Rider',
        cardUrl: 'https://example.com/card/tok-123',
      },
    ])

    const banner = container.querySelector('.digital-card-banner')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('Try out the')
    expect(banner?.textContent).toContain('digital brevet card')
    expect(banner?.querySelector('svg')).toBeTruthy()
  })

  it('omits the banner when the rider has no cardUrl', () => {
    const { container } = renderWithRiders([{ id: 'r1', firstName: 'Paper', lastName: 'Rider' }])

    expect(screen.queryByText(/digital brevet card/)).toBeNull()
    expect(container.querySelector('.digital-card-banner')).toBeNull()
  })

  it('omits the banner on blank cards', () => {
    const { container } = renderWithRiders([{ id: 'blank-1', firstName: '', lastName: '' }])

    expect(container.querySelector('.digital-card-banner')).toBeNull()
  })
})

import type { CardLeg } from '@/types/control-card'

const legA: CardLeg = {
  legRwgpsId: '101',
  legName: 'Leg 1: Gravenhurst',
  distanceKm: 205.3,
  rwgpsUrl: 'https://ridewithgps.com/routes/101',
  controls: [
    { id: 'a0', name: 'A Start', distance: 0 },
    { id: 'a1', name: 'A Finish', distance: 205.3 },
  ],
}

const legB: CardLeg = {
  legRwgpsId: '102',
  legName: 'Leg 2: Haliburton',
  distanceKm: 302.1,
  rwgpsUrl: 'https://ridewithgps.com/routes/102',
  controls: [{ id: 'b0', name: 'B Start', distance: 0, overallDistance: 205.3 }],
}

function renderWithLegs(riders: CardRider[], legs: CardLeg[]) {
  return render(
    <ControlCardsPrint
      event={baseEvent}
      organizer={baseOrganizer}
      controls={[]}
      riders={riders}
      legs={legs}
      totalAllowableTime={{ hours: 90, minutes: 0 }}
      formattedDate="Fri, May 15, 2026"
    />
  )
}

describe('ControlCardsPrint — collection legs', () => {
  const alice: CardRider = { id: 'r-alice', firstName: 'Alice', lastName: 'Adams' }
  const bob: CardRider = { id: 'r-bob', firstName: 'Bob', lastName: 'Brar' }

  it('expands rider-major: all of rider 1 legs before rider 2', () => {
    const { container } = renderWithLegs([alice, bob], [legA, legB])
    const verticalNames = Array.from(container.querySelectorAll('.rider-name-vertical')).map(
      (el) => el.textContent
    )
    expect(verticalNames).toEqual(['Adams, Alice', 'Adams, Alice', 'Brar, Bob', 'Brar, Bob'])
    const routeNames = Array.from(container.querySelectorAll('.route-name')).map(
      (el) => el.textContent
    )
    expect(routeNames).toEqual([
      'Leg 1: Gravenhurst',
      'Leg 2: Haliburton',
      'Leg 1: Gravenhurst',
      'Leg 2: Haliburton',
    ])
  })

  it('prints no open/close times on leg cards', () => {
    renderWithLegs([alice], [legA])
    expect(screen.queryByText(/Open:/)).toBeNull()
    expect(screen.queryByText(/Close:/)).toBeNull()
  })

  it('shows the leg distance on the front and a Route Map QR per leg card', () => {
    const { container } = renderWithLegs([alice], [legA, legB])
    expect(container.textContent).toContain('205.3 km')
    expect(container.textContent).toContain('302.1 km')
    // One Route Map QR per card (leg URL provides it even with no event rwgpsUrl).
    expect(screen.getAllByText('Route Map')).toHaveLength(2)
  })

  it('names the offending leg when a leg exceeds MAX_CARD_CONTROLS', () => {
    const bigLeg: CardLeg = {
      ...legA,
      controls: Array.from({ length: 25 }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        distance: i * 8,
      })),
    }
    renderWithLegs([alice], [bigLeg])
    expect(screen.getByText(/Leg 1: Gravenhurst lists 25 controls/)).toBeTruthy()
    // No card pages rendered.
    expect(document.querySelector('.card-page')).toBeNull()
  })

  it('prints the overall event distance on its own line under the route distance', () => {
    const { container } = renderWithLegs([alice], [legA, legB])

    const overall = screen.getByText('205.3 km overall')
    expect(overall).toBeTruthy()
    // Both lines live in the same control cell: the unlabeled route (per-leg)
    // distance first, the labeled overall distance below it.
    const cell = overall.closest('.control-info')
    expect(cell?.querySelector('.control-distance')?.textContent).toBe('0 km')
    // Leg 1 controls (no overallDistance) print only the route distance.
    const overallLines = Array.from(container.querySelectorAll('.control-distance-overall'))
    expect(overallLines).toHaveLength(1)
  })

  it('keeps the appended distance on leg cards, whose names carry no distance', () => {
    const { container } = renderWithLegs([alice], [legA])
    const backHeaders = Array.from(container.querySelectorAll('.back-header')).map(
      (el) => el.textContent
    )
    expect(backHeaders.some((h) => h?.includes('Leg 1: Gravenhurst 205.3 km'))).toBe(true)
  })

  it('still prints open/close times on single-route cards', () => {
    renderWithRiders([{ id: 'r1', firstName: 'Solo', lastName: 'Rider' }])
    expect(screen.getAllByText(/Open:/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Close:/).length).toBeGreaterThan(0)
  })
})
