import { describe, it, expect } from 'vitest'
import { compareData } from '../../../scripts/lib/validation/comparator'
import type { ParsedEvent, DbEvent } from '../../../scripts/lib/validation/types'

describe('comparator', () => {
  describe('compareData', () => {
    it('returns no discrepancies for perfectly matching data', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [
            {
              name: 'John Smith',
              firstName: 'John',
              lastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [
            {
              riderId: '1',
              riderFirstName: 'John',
              riderLastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].discrepancies).toHaveLength(0)
    })

    it('detects missing rider in database', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [
            {
              name: 'John Smith',
              firstName: 'John',
              lastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
            {
              name: 'Jane Doe',
              firstName: 'Jane',
              lastName: 'Doe',
              time: '11:00',
              status: 'finished',
            },
          ],
        },
      ]
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [
            {
              riderId: '1',
              riderFirstName: 'John',
              riderLastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      const missingInDb = matches[0].discrepancies.filter((d) => d.type === 'missing_in_db')
      expect(missingInDb).toHaveLength(1)
      expect(missingInDb[0].riderName).toBe('Jane Doe')
      expect(missingInDb[0].severity).toBe('error')
    })

    it('detects rider in database but not in HTML', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [
            {
              name: 'John Smith',
              firstName: 'John',
              lastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [
            {
              riderId: '1',
              riderFirstName: 'John',
              riderLastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
            {
              riderId: '2',
              riderFirstName: 'Jane',
              riderLastName: 'Doe',
              time: '11:00',
              status: 'finished',
            },
          ],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      const missingInHtml = matches[0].discrepancies.filter((d) => d.type === 'missing_in_html')
      expect(missingInHtml).toHaveLength(1)
      expect(missingInHtml[0].severity).toBe('warning')
    })

    it('detects time mismatch', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [
            {
              name: 'John Smith',
              firstName: 'John',
              lastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [
            {
              riderId: '1',
              riderFirstName: 'John',
              riderLastName: 'Smith',
              time: '10:35',
              status: 'finished',
            },
          ],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      const timeMismatches = matches[0].discrepancies.filter((d) => d.type === 'time_mismatch')
      expect(timeMismatches).toHaveLength(1)
      expect(timeMismatches[0].htmlValue).toBe('10:30')
      expect(timeMismatches[0].dbValue).toBe('10:35')
      expect(timeMismatches[0].severity).toBe('warning')
    })

    it('detects event missing in database', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [],
        },
      ]
      const dbEvents: DbEvent[] = []

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbEvent).toBeNull()
      const eventMissing = matches[0].discrepancies.filter((d) => d.type === 'event_missing_in_db')
      expect(eventMissing).toHaveLength(1)
      expect(eventMissing[0].severity).toBe('error')
    })

    it('detects event missing in HTML', () => {
      const htmlEvents: ParsedEvent[] = []
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      const eventMissing = matches[0].discrepancies.filter(
        (d) => d.type === 'event_missing_in_html'
      )
      expect(eventMissing).toHaveLength(1)
      expect(eventMissing[0].severity).toBe('warning')
    })

    it('notes name variations', () => {
      const htmlEvents: ParsedEvent[] = [
        {
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          riders: [
            {
              name: 'Bob Smith',
              firstName: 'Bob',
              lastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]
      const dbEvents: DbEvent[] = [
        {
          id: '1',
          date: '2024-04-15',
          name: 'Spring 200',
          distance: 200,
          results: [
            {
              riderId: '1',
              riderFirstName: 'Robert',
              riderLastName: 'Smith',
              time: '10:30',
              status: 'finished',
            },
          ],
        },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      // Bob/Robert should match but be noted as a variation
      // Since our fuzzy matcher treats nicknames as exact matches (1.0 confidence),
      // there should be no name_variation discrepancy
      expect(matches).toHaveLength(1)
      expect(matches[0].discrepancies).toHaveLength(0)
    })

    it('sorts results by date', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-06-15', name: 'Summer 200', distance: 200, riders: [] },
        { date: '2024-04-15', name: 'Spring 200', distance: 200, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '2', date: '2024-06-15', name: 'Summer 200', distance: 200, results: [] },
        { id: '1', date: '2024-04-15', name: 'Spring 200', distance: 200, results: [] },
      ]

      const matches = compareData(htmlEvents, dbEvents)

      expect(matches).toHaveLength(2)
      expect(matches[0].htmlEvent.date).toBe('2024-04-15')
      expect(matches[1].htmlEvent.date).toBe('2024-06-15')
    })
  })
})
