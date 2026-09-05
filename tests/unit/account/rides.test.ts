import { describe, it, expect } from 'vitest'
import { splitRides, type AccountRideRow } from '@/lib/account/rides'

// Non-nullable so `{ ...baseEvents, ... }` overrides keep every field required;
// spreading the nullable `row().events` accessor instead would widen the
// result to optional fields and fail strict typecheck.
const baseEvents: NonNullable<AccountRideRow['events']> = {
  slug: 'toronto-200',
  name: 'Toronto 200',
  event_date: '2026-09-20',
  status: 'scheduled',
  distance_km: 200,
  chapters: { name: 'Toronto' },
}

function row(overrides: Partial<AccountRideRow> = {}): AccountRideRow {
  return {
    id: 'reg-1',
    management_token: 'tok-1',
    status: 'registered',
    events: baseEvents,
    result_status: null,
    ...overrides,
  }
}

describe('splitRides', () => {
  const today = '2026-09-10'

  it('puts future scheduled registrations in upcoming, sorted ascending', () => {
    const { upcoming, past } = splitRides(
      [
        row({ id: 'b', events: { ...baseEvents, event_date: '2026-10-01' } }),
        row({ id: 'a', events: { ...baseEvents, event_date: '2026-09-15' } }),
      ],
      today
    )
    expect(upcoming.map((r) => r.registrationId)).toEqual(['a', 'b'])
    expect(past).toEqual([])
  })

  it('treats today as upcoming', () => {
    const { upcoming } = splitRides([row({ events: { ...baseEvents, event_date: today } })], today)
    expect(upcoming).toHaveLength(1)
  })

  it('puts past dates and completed/submitted events in past, newest first', () => {
    const { upcoming, past } = splitRides(
      [
        row({
          id: 'old',
          events: { ...baseEvents, event_date: '2026-06-01', status: 'completed' },
        }),
        row({
          id: 'newer',
          events: { ...baseEvents, event_date: '2026-08-01', status: 'submitted' },
        }),
      ],
      today
    )
    expect(upcoming).toEqual([])
    expect(past.map((r) => r.registrationId)).toEqual(['newer', 'old'])
  })

  it('drops cancelled registrations from upcoming but keeps them in past', () => {
    const { upcoming, past } = splitRides(
      [
        row({ id: 'c1', status: 'cancelled' }),
        row({
          id: 'c2',
          status: 'cancelled',
          events: { ...baseEvents, event_date: '2026-01-01' },
        }),
      ],
      today
    )
    expect(upcoming).toEqual([])
    expect(past.map((r) => r.registrationId)).toEqual(['c2'])
  })

  it('maps the flat shape and carries the result status', () => {
    const { upcoming } = splitRides([row({ result_status: 'finished' })], today)
    expect(upcoming[0]).toEqual({
      registrationId: 'reg-1',
      managementToken: 'tok-1',
      registrationStatus: 'registered',
      eventSlug: 'toronto-200',
      eventName: 'Toronto 200',
      eventDate: '2026-09-20',
      eventStatus: 'scheduled',
      distanceKm: 200,
      chapterName: 'Toronto',
      resultStatus: 'finished',
    })
  })

  it('skips rows whose event is missing', () => {
    expect(splitRides([row({ events: null })], today)).toEqual({ upcoming: [], past: [] })
  })
})
