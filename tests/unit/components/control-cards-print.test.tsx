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
