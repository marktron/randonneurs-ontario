import { describe, it, expect } from 'vitest'
import {
  matchEvents,
  matchRiders,
  getUnmatchedDbResults,
} from '../../../scripts/lib/validation/matcher'
import type {
  ParsedEvent,
  DbEvent,
  ParsedRiderResult,
  DbResult,
} from '../../../scripts/lib/validation/types'

describe('matcher', () => {
  describe('matchEvents', () => {
    it('matches events by exact date and distance', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-04-15', name: 'Spring 200', distance: 200, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '1', date: '2024-04-15', name: 'Spring 200', distance: 200, results: [] },
      ]

      const matches = matchEvents(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbEvent).toBeDefined()
      expect(matches[0].dbEvent?.id).toBe('1')
      expect(matches[0].confidence).toBe(1)
    })

    it('matches events with similar names', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-04-15', name: 'Spring Brevet 200', distance: 200, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '1', date: '2024-04-15', name: 'Spring 200', distance: 200, results: [] },
      ]

      const matches = matchEvents(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbEvent).toBeDefined()
      expect(matches[0].confidence).toBeGreaterThanOrEqual(0.6)
    })

    it('does not match events with different dates', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-04-15', name: 'Spring 200', distance: 200, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '1', date: '2024-04-16', name: 'Spring 200', distance: 200, results: [] },
      ]

      const matches = matchEvents(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbEvent).toBeNull()
    })

    it('does not match events with very different distances', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-04-15', name: 'Spring 200', distance: 200, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '1', date: '2024-04-15', name: 'Spring 300', distance: 300, results: [] },
      ]

      const matches = matchEvents(htmlEvents, dbEvents)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbEvent).toBeNull()
    })

    it('handles multiple events and prevents duplicate matching', () => {
      const htmlEvents: ParsedEvent[] = [
        { date: '2024-04-15', name: 'Spring 200', distance: 200, riders: [] },
        { date: '2024-04-15', name: 'Spring 300', distance: 300, riders: [] },
      ]
      const dbEvents: DbEvent[] = [
        { id: '1', date: '2024-04-15', name: 'Spring 200', distance: 200, results: [] },
        { id: '2', date: '2024-04-15', name: 'Spring 300', distance: 300, results: [] },
      ]

      const matches = matchEvents(htmlEvents, dbEvents)

      expect(matches).toHaveLength(2)
      expect(matches[0].dbEvent?.id).toBe('1')
      expect(matches[1].dbEvent?.id).toBe('2')
    })
  })

  describe('matchRiders', () => {
    it('matches riders with exact names', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
        {
          riderId: '1',
          riderFirstName: 'John',
          riderLastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]

      const matches = matchRiders(htmlRiders, dbResults)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbResult).toBeDefined()
      expect(matches[0].confidence).toBe(1)
    })

    it('matches riders with nickname variations', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'Bob Smith',
          firstName: 'Bob',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
        {
          riderId: '1',
          riderFirstName: 'Robert',
          riderLastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]

      const matches = matchRiders(htmlRiders, dbResults)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbResult).toBeDefined()
      expect(matches[0].confidence).toBe(1) // Nicknames are treated as exact matches
    })

    it('matches riders with minor typos', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smth',
          firstName: 'John',
          lastName: 'Smth',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
        {
          riderId: '1',
          riderFirstName: 'John',
          riderLastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]

      const matches = matchRiders(htmlRiders, dbResults)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbResult).toBeDefined()
      expect(matches[0].confidence).toBeGreaterThan(0.85)
    })

    it('does not match riders with very different names', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
        {
          riderId: '1',
          riderFirstName: 'Jane',
          riderLastName: 'Doe',
          time: '10:30',
          status: 'finished',
        },
      ]

      const matches = matchRiders(htmlRiders, dbResults)

      expect(matches).toHaveLength(1)
      expect(matches[0].dbResult).toBeNull()
    })

    it('handles multiple riders and prevents duplicate matching', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
        { name: 'Jane Doe', firstName: 'Jane', lastName: 'Doe', time: '11:00', status: 'finished' },
      ]
      const dbResults: DbResult[] = [
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
      ]

      const matches = matchRiders(htmlRiders, dbResults)

      expect(matches).toHaveLength(2)
      expect(matches[0].dbResult?.riderId).toBe('1')
      expect(matches[1].dbResult?.riderId).toBe('2')
    })
  })

  describe('getUnmatchedDbResults', () => {
    it('returns results not matched to any HTML rider', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
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
      ]

      const riderMatches = matchRiders(htmlRiders, dbResults)
      const unmatched = getUnmatchedDbResults(riderMatches, dbResults)

      expect(unmatched).toHaveLength(1)
      expect(unmatched[0].riderId).toBe('2')
    })

    it('returns empty array when all results are matched', () => {
      const htmlRiders: ParsedRiderResult[] = [
        {
          name: 'John Smith',
          firstName: 'John',
          lastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]
      const dbResults: DbResult[] = [
        {
          riderId: '1',
          riderFirstName: 'John',
          riderLastName: 'Smith',
          time: '10:30',
          status: 'finished',
        },
      ]

      const riderMatches = matchRiders(htmlRiders, dbResults)
      const unmatched = getUnmatchedDbResults(riderMatches, dbResults)

      expect(unmatched).toHaveLength(0)
    })
  })
})
