import { describe, it, expect } from 'vitest'
import { buildRiderDescription } from '@/app/riders/[slug]/page'
import type { RiderYearResults, RiderEventResult } from '@/lib/data/results'

function makeResult(overrides: Partial<RiderEventResult> = {}): RiderEventResult {
  return {
    date: '2024-06-01',
    eventName: 'Test Brevet',
    distanceKm: 200,
    time: '10:00',
    status: 'finished',
    note: null,
    chapterSlug: 'toronto',
    eventType: 'brevet',
    teamName: null,
    awards: [],
    ...overrides,
  }
}

describe('buildRiderDescription', () => {
  const rider = { firstName: 'Jane', lastName: 'Doe' }

  it('falls back to a generic sentence when there are no results at all', () => {
    expect(buildRiderDescription(rider, [])).toBe('View randonneuring results for Jane Doe.')
  })

  it('falls back to a generic sentence when no results are finished', () => {
    const yearResults: RiderYearResults[] = [
      {
        year: 2024,
        completedCount: 0,
        totalDistanceKm: 0,
        results: [makeResult({ status: 'dnf' })],
        seasonAwards: [],
      },
    ]
    expect(buildRiderDescription(rider, yearResults)).toBe(
      'View randonneuring results for Jane Doe.'
    )
  })

  it('summarizes count, distance range, and a single season', () => {
    const yearResults: RiderYearResults[] = [
      {
        year: 2024,
        completedCount: 2,
        totalDistanceKm: 400,
        results: [
          makeResult({ distanceKm: 200 }),
          makeResult({ distanceKm: 200, date: '2024-07-01' }),
        ],
        seasonAwards: [],
      },
    ]
    expect(buildRiderDescription(rider, yearResults)).toBe(
      'Jane Doe has completed 2 randonneuring rides (200 km) with Randonneurs Ontario in 2024.'
    )
  })

  it('summarizes count, distance range, and a season span across multiple years', () => {
    const yearResults: RiderYearResults[] = [
      {
        year: 2024,
        completedCount: 1,
        totalDistanceKm: 600,
        results: [makeResult({ distanceKm: 600, date: '2024-08-01' })],
        seasonAwards: [],
      },
      {
        year: 2015,
        completedCount: 1,
        totalDistanceKm: 200,
        results: [makeResult({ distanceKm: 200, date: '2015-05-01' })],
        seasonAwards: [],
      },
    ]
    expect(buildRiderDescription(rider, yearResults)).toBe(
      'Jane Doe has completed 2 randonneuring rides (200–600 km) with Randonneurs Ontario from 2015 to 2024.'
    )
  })

  it('uses singular "ride" for exactly one completed result', () => {
    const yearResults: RiderYearResults[] = [
      {
        year: 2024,
        completedCount: 1,
        totalDistanceKm: 300,
        results: [makeResult({ distanceKm: 300 })],
        seasonAwards: [],
      },
    ]
    expect(buildRiderDescription(rider, yearResults)).toBe(
      'Jane Doe has completed 1 randonneuring ride (300 km) with Randonneurs Ontario in 2024.'
    )
  })
})
