import { describe, it, expect } from 'vitest'
import {
  getEventSpanDays,
  getEventLimitMinutes,
  getEventLimitLabel,
  getEventDayKeys,
  getEventMonthKeys,
  buildWeekLanes,
} from '@/lib/calendar/event-spans'
import type { Event } from '@/components/event-card'

function makeEvent(overrides: Partial<Event> & { date: string; distance: string }): Event {
  return {
    slug: `${overrides.name ?? 'event'}-${overrides.date}`,
    name: 'Test Ride',
    type: 'Brevet',
    startLocation: 'Start',
    startTime: '06:00',
    status: 'scheduled',
    ...overrides,
  }
}

/** Seven consecutive local dates beginning at `mondayYmd`. */
function weekFrom(mondayYmd: string): (Date | null)[] {
  const start = new Date(mondayYmd + 'T00:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })
}

describe('getEventSpanDays', () => {
  it('keeps a 200 km brevet at a morning start on a single day', () => {
    // 13h30m limit from 07:00 finishes at 20:30 the same day.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '200', startTime: '07:00' }))
    ).toBe(1)
  })

  it('spans two days for a 600 starting Saturday at 06:00', () => {
    // 40h limit from 06:00 Sat finishes 22:00 Sun.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: '06:00' }))
    ).toBe(2)
  })

  it('spans two days for a 400 starting at 06:00', () => {
    // 27h limit from 06:00 finishes 09:00 the next day.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '400', startTime: '06:00' }))
    ).toBe(2)
  })

  it('spans four days for a 1200 starting Thursday at 04:00', () => {
    // 90h limit from 04:00 Thu finishes 22:00 Sun.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-14', distance: '1200', startTime: '04:00' }))
    ).toBe(4)
  })

  it('spans four days for a 1000 starting at 04:00', () => {
    // 75h limit from 04:00 finishes 07:00 on day four.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-14', distance: '1000', startTime: '04:00' }))
    ).toBe(4)
  })

  it('treats a populaire under 200 km as a single day', () => {
    // getNominalDistance() rounds 100 up to 200; populaires have no ACP limit.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '100', startTime: '20:00' }))
    ).toBe(1)
  })

  it('treats a missing start time as a single day', () => {
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: '' }))
    ).toBe(1)
  })

  it('treats an unparseable start time as a single day', () => {
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: 'noon' }))
    ).toBe(1)
  })

  it('pushes a late 200 km start onto a second day', () => {
    // 13h30m from 18:00 finishes 07:30 the next morning.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '200', startTime: '18:00' }))
    ).toBe(2)
  })

  it('uses the strict limit, without the extra grace day the finish-day picker adds', () => {
    // 40h from 06:00 lands at 22:00 on day two — not day three.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: '06:00' }))
    ).toBe(2)
  })

  it('keeps a ride whose cutoff is exactly midnight on its start day', () => {
    // 13h30m from 10:30 is 24:00 — the end of the start day, not the next day.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '200', startTime: '10:30' }))
    ).toBe(1)
    // One minute later and it is genuinely into the next day.
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '200', startTime: '10:31' }))
    ).toBe(2)
  })

  it('gives a Flèche its 24h team limit rather than the distance band', () => {
    // 360 km would band to 400 km (27h); from 22:00 that would be three days.
    const fleche = makeEvent({
      date: '2026-05-16',
      distance: '360',
      type: 'Fleche',
      startTime: '22:00',
    })
    expect(getEventLimitMinutes(fleche)).toBe(24 * 60)
    expect(getEventSpanDays(fleche)).toBe(2)
  })

  it('accepts the HH:MM:SS form Postgres time columns arrive in', () => {
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: '06:00:00' }))
    ).toBe(2)
  })

  it('rejects a start time with a missing minutes field', () => {
    expect(
      getEventSpanDays(makeEvent({ date: '2026-05-16', distance: '600', startTime: '06:' }))
    ).toBe(1)
  })
})

describe('getEventLimitMinutes / getEventLimitLabel', () => {
  it('returns the ACP limit for a brevet distance', () => {
    expect(getEventLimitMinutes(makeEvent({ date: '2026-05-16', distance: '600' }))).toBe(40 * 60)
    expect(getEventLimitLabel(makeEvent({ date: '2026-05-16', distance: '600' }))).toBe('40h')
  })

  it('returns null for a populaire', () => {
    expect(getEventLimitMinutes(makeEvent({ date: '2026-05-16', distance: '100' }))).toBeNull()
    expect(getEventLimitLabel(makeEvent({ date: '2026-05-16', distance: '100' }))).toBeNull()
  })

  it('includes minutes when the limit is not a whole number of hours', () => {
    expect(getEventLimitLabel(makeEvent({ date: '2026-05-16', distance: '200' }))).toBe('13h30m')
  })
})

describe('getEventDayKeys', () => {
  it('lists every local calendar day the ride covers', () => {
    const event = makeEvent({ date: '2026-05-31', distance: '600', startTime: '06:00' })
    expect(getEventDayKeys(event)).toEqual(['2026-05-31', '2026-06-01'])
  })

  it('lists a single day for a same-day ride', () => {
    const event = makeEvent({ date: '2026-05-16', distance: '200', startTime: '07:00' })
    expect(getEventDayKeys(event)).toEqual(['2026-05-16'])
  })
})

describe('getEventMonthKeys', () => {
  it('includes the month a ride continues into', () => {
    const event = makeEvent({ date: '2026-05-31', distance: '600', startTime: '06:00' })
    expect(getEventMonthKeys(event)).toEqual([
      { year: 2026, month: 4 },
      { year: 2026, month: 5 },
    ])
  })

  it('lists only the start month for a same-day ride', () => {
    const event = makeEvent({ date: '2026-05-16', distance: '200', startTime: '07:00' })
    expect(getEventMonthKeys(event)).toEqual([{ year: 2026, month: 4 }])
  })
})

describe('buildWeekLanes', () => {
  it('places a same-day ride as a span-1 segment', () => {
    const event = makeEvent({ date: '2026-05-27', distance: '200', startTime: '07:00' })
    const lanes = buildWeekLanes(weekFrom('2026-05-25'), [event])

    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toHaveLength(1)
    expect(lanes[0][0]).toMatchObject({
      colStart: 2,
      colSpan: 1,
      continuesBefore: false,
      continuesAfter: false,
      spanDays: 1,
    })
  })

  it('places a 600 as a two-column bar', () => {
    const event = makeEvent({ date: '2026-05-30', distance: '600', startTime: '06:00' })
    const lanes = buildWeekLanes(weekFrom('2026-05-25'), [event])

    expect(lanes[0][0]).toMatchObject({
      colStart: 5,
      colSpan: 2,
      continuesBefore: false,
      continuesAfter: false,
      spanDays: 2,
    })
  })

  it('omits events that do not touch the week', () => {
    const event = makeEvent({ date: '2026-06-10', distance: '200', startTime: '07:00' })
    expect(buildWeekLanes(weekFrom('2026-05-25'), [event])).toEqual([])
  })

  it('wraps a 600 starting Sunday into the following week', () => {
    // May 31 2026 is a Sunday; the ride finishes Monday June 1.
    const event = makeEvent({ date: '2026-05-31', distance: '600', startTime: '06:00' })

    const thisWeek = buildWeekLanes(weekFrom('2026-05-25'), [event])
    expect(thisWeek[0][0]).toMatchObject({
      colStart: 6,
      colSpan: 1,
      continuesBefore: false,
      continuesAfter: true,
    })

    const nextWeek = buildWeekLanes(weekFrom('2026-06-01'), [event])
    expect(nextWeek[0][0]).toMatchObject({
      colStart: 0,
      colSpan: 1,
      continuesBefore: true,
      continuesAfter: false,
    })
  })

  it('clips a bar at a month edge, marking the clipped side as continuing', () => {
    // May 2026 starts on a Friday, so its first grid week is
    // [null, null, null, null, May 1, May 2, May 3].
    const week: (Date | null)[] = [
      null,
      null,
      null,
      null,
      new Date('2026-05-01T00:00:00'),
      new Date('2026-05-02T00:00:00'),
      new Date('2026-05-03T00:00:00'),
    ]
    // A 1200 starting Wed Apr 29 at 04:00 runs Apr 29 – May 2.
    const event = makeEvent({ date: '2026-04-29', distance: '1200', startTime: '04:00' })
    const lanes = buildWeekLanes(week, [event])

    expect(lanes[0][0]).toMatchObject({
      colStart: 4,
      colSpan: 2,
      continuesBefore: true,
      continuesAfter: false,
    })
  })

  it('puts overlapping bars in separate lanes and packs a later ride back into lane 0', () => {
    const six = makeEvent({
      date: '2026-05-25',
      distance: '600',
      startTime: '06:00',
      name: 'Six Hundred',
      slug: 'six',
    })
    const four = makeEvent({
      date: '2026-05-25',
      distance: '400',
      startTime: '06:00',
      name: 'Four Hundred',
      slug: 'four',
    })
    const two = makeEvent({
      date: '2026-05-27',
      distance: '200',
      startTime: '07:00',
      name: 'Two Hundred',
      slug: 'two',
    })

    const lanes = buildWeekLanes(weekFrom('2026-05-25'), [six, four, two])

    expect(lanes).toHaveLength(2)
    expect(lanes[0].map((s) => s.event.slug)).toEqual(['six', 'two'])
    expect(lanes[1].map((s) => s.event.slug)).toEqual(['four'])
    expect(lanes[0][1]).toMatchObject({ colStart: 2, colSpan: 1 })
  })

  it('orders earlier starts first, then longer spans', () => {
    const monday200 = makeEvent({
      date: '2026-05-25',
      distance: '200',
      startTime: '07:00',
      slug: 'mon-200',
    })
    const tuesday600 = makeEvent({
      date: '2026-05-26',
      distance: '600',
      startTime: '06:00',
      slug: 'tue-600',
    })
    const tuesday200 = makeEvent({
      date: '2026-05-26',
      distance: '200',
      startTime: '07:00',
      slug: 'tue-200',
    })

    // Source order deliberately scrambled.
    const lanes = buildWeekLanes(weekFrom('2026-05-25'), [tuesday200, tuesday600, monday200])

    expect(lanes[0].map((s) => s.event.slug)).toEqual(['mon-200', 'tue-600'])
    expect(lanes[1].map((s) => s.event.slug)).toEqual(['tue-200'])
  })

  it('returns no lanes for a week made entirely of padding cells', () => {
    const event = makeEvent({ date: '2026-05-27', distance: '200', startTime: '07:00' })
    expect(buildWeekLanes([null, null, null, null, null, null, null], [event])).toEqual([])
  })
})
