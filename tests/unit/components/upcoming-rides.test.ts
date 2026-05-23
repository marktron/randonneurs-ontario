import { describe, it, expect } from 'vitest'
import { eventsForFirstNDates } from '@/components/upcoming-rides'
import type { Event } from '@/components/event-card'

function makeEvent(date: string, name: string): Event {
  return {
    slug: name.toLowerCase().replace(/\s/g, '-'),
    date,
    name,
    type: 'Brevet',
    distance: '200',
    startLocation: '',
    startTime: '08:00',
    status: 'scheduled',
  }
}

describe('eventsForFirstNDates', () => {
  it('returns events from the first N unique dates', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-14', 'Ride B'),
      makeEvent('2026-03-28', 'Ride C'),
      makeEvent('2026-04-04', 'Ride D'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(3)
    expect(result.map((e) => e.name)).toEqual(['Ride A', 'Ride B', 'Ride C'])
  })

  it('includes multiple events on the same date', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-07', 'Ride B'),
      makeEvent('2026-03-14', 'Ride C'),
      makeEvent('2026-03-28', 'Ride D'),
      makeEvent('2026-04-04', 'Ride E'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(4)
    expect(result.map((e) => e.name)).toEqual(['Ride A', 'Ride B', 'Ride C', 'Ride D'])
  })

  it('returns all events when fewer unique dates than N', () => {
    const events = [makeEvent('2026-03-07', 'Ride A'), makeEvent('2026-03-14', 'Ride B')]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(eventsForFirstNDates([], 3)).toEqual([])
  })

  it('handles all events on the same date', () => {
    const events = [
      makeEvent('2026-03-07', 'Ride A'),
      makeEvent('2026-03-07', 'Ride B'),
      makeEvent('2026-03-07', 'Ride C'),
    ]
    const result = eventsForFirstNDates(events, 3)
    expect(result).toHaveLength(3)
  })
})
