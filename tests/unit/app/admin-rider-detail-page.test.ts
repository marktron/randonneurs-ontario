import { describe, it, expect } from 'vitest'
import { filterRegistrationsWithoutResults } from '@/app/admin/riders/[id]/page'
import type { RegistrationWithEvent, ResultWithEventForRider } from '@/types/queries'

function makeRegistration(overrides: Partial<RegistrationWithEvent> = {}): RegistrationWithEvent {
  return {
    id: 'reg-1',
    registered_at: '2026-07-31T12:00:00Z',
    status: 'registered',
    events: {
      id: 'event-1',
      name: 'Six Nations 200',
      event_date: '2026-08-08',
      distance_km: 200,
    },
    ...overrides,
  }
}

function makeResult(overrides: Partial<ResultWithEventForRider> = {}): ResultWithEventForRider {
  return {
    id: 'result-1',
    finish_time: '11:13',
    status: 'finished',
    team_name: null,
    season: 2026,
    distance_km: 200,
    events: {
      id: 'event-1',
      name: 'Six Nations 200',
      event_date: '2026-08-08',
    },
    ...overrides,
  }
}

describe('filterRegistrationsWithoutResults', () => {
  it('removes registrations for events that already have a result', () => {
    const registrations = [
      makeRegistration({
        id: 'reg-1',
        events: { id: 'e1', name: 'A', event_date: '2026-08-08', distance_km: 200 },
      }),
      makeRegistration({
        id: 'reg-2',
        events: { id: 'e2', name: 'B', event_date: '2026-08-15', distance_km: 200 },
      }),
    ]
    const results = [makeResult({ events: { id: 'e1', name: 'A', event_date: '2026-08-08' } })]

    const filtered = filterRegistrationsWithoutResults(registrations, results)

    expect(filtered.map((r) => r.id)).toEqual(['reg-2'])
  })

  it('removes registrations even when the result is a DNS/DNF, not just finished', () => {
    const registrations = [makeRegistration()]
    const results = [makeResult({ status: 'dns', finish_time: null })]

    expect(filterRegistrationsWithoutResults(registrations, results)).toEqual([])
  })

  it('keeps all registrations when the rider has no results', () => {
    const registrations = [makeRegistration({ id: 'reg-1' }), makeRegistration({ id: 'reg-2' })]

    expect(filterRegistrationsWithoutResults(registrations, [])).toHaveLength(2)
  })

  it('keeps registrations whose event has no matching result', () => {
    const registrations = [
      makeRegistration({
        events: {
          id: 'future',
          name: 'Aldershot-Erie',
          event_date: '2026-08-15',
          distance_km: 200,
        },
      }),
    ]
    const results = [
      makeResult({ events: { id: 'past', name: 'Hills of Hockley', event_date: '2026-05-02' } }),
    ]

    expect(filterRegistrationsWithoutResults(registrations, results)).toHaveLength(1)
  })

  it('ignores results with a null event join', () => {
    const registrations = [makeRegistration()]
    const results = [makeResult({ events: null })]

    expect(filterRegistrationsWithoutResults(registrations, results)).toHaveLength(1)
  })

  it('keeps registrations with a null event join', () => {
    const registrations = [makeRegistration({ events: null })]
    const results = [makeResult()]

    expect(filterRegistrationsWithoutResults(registrations, results)).toHaveLength(1)
  })
})
