import { describe, it, expect } from 'vitest'

/**
 * Tests for the rider directory search and grouping functionality.
 *
 * These tests verify:
 * 1. Riders are correctly grouped by last name initial
 * 2. Search filtering works correctly
 * 3. Edge cases are handled (empty names, special characters)
 */

interface RiderListItem {
  slug: string
  firstName: string
  lastName: string
}

/**
 * Group riders by the first letter of their last name
 * (Extracted from rider-directory.tsx for testing)
 */
function groupRidersByLastName(riders: RiderListItem[]): Map<string, RiderListItem[]> {
  const groups = new Map<string, RiderListItem[]>()

  for (const rider of riders) {
    const firstLetter = (rider.lastName[0] || '#').toUpperCase()
    const existing = groups.get(firstLetter) || []
    existing.push(rider)
    groups.set(firstLetter, existing)
  }

  return groups
}

/**
 * Filter riders by search query
 * (Extracted from rider-directory.tsx for testing)
 */
function filterRiders(riders: RiderListItem[], search: string): RiderListItem[] {
  if (!search.trim()) return riders

  const query = search.toLowerCase()
  return riders.filter((rider) => {
    const fullName = `${rider.firstName} ${rider.lastName}`.toLowerCase()
    return fullName.includes(query)
  })
}

describe('Rider Directory', () => {
  const mockRiders: RiderListItem[] = [
    { slug: 'john-smith', firstName: 'John', lastName: 'Smith' },
    { slug: 'jane-smith', firstName: 'Jane', lastName: 'Smith' },
    { slug: 'bob-anderson', firstName: 'Bob', lastName: 'Anderson' },
    { slug: 'alice-brown', firstName: 'Alice', lastName: 'Brown' },
    { slug: 'charlie-adams', firstName: 'Charlie', lastName: 'Adams' },
  ]

  describe('groupRidersByLastName', () => {
    it('groups riders by first letter of last name', () => {
      const groups = groupRidersByLastName(mockRiders)

      expect(groups.get('A')).toHaveLength(2) // Anderson, Adams
      expect(groups.get('B')).toHaveLength(1) // Brown
      expect(groups.get('S')).toHaveLength(2) // Smith, Smith
    })

    it('handles empty rider list', () => {
      const groups = groupRidersByLastName([])
      expect(groups.size).toBe(0)
    })

    it('handles rider with empty last name', () => {
      const ridersWithEmptyName: RiderListItem[] = [
        { slug: 'unknown', firstName: 'Unknown', lastName: '' },
      ]
      const groups = groupRidersByLastName(ridersWithEmptyName)

      // Empty last name should be grouped under '#'
      expect(groups.get('#')).toHaveLength(1)
    })

    it('uppercases the group key', () => {
      const ridersLowercase: RiderListItem[] = [
        { slug: 'test', firstName: 'Test', lastName: 'lowercase' },
      ]
      const groups = groupRidersByLastName(ridersLowercase)

      expect(groups.has('L')).toBe(true)
      expect(groups.has('l')).toBe(false)
    })
  })

  describe('filterRiders', () => {
    it('returns all riders when search is empty', () => {
      const filtered = filterRiders(mockRiders, '')
      expect(filtered).toHaveLength(5)
    })

    it('returns all riders when search is only whitespace', () => {
      const filtered = filterRiders(mockRiders, '   ')
      expect(filtered).toHaveLength(5)
    })

    it('filters by first name', () => {
      const filtered = filterRiders(mockRiders, 'john')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].firstName).toBe('John')
    })

    it('filters by last name', () => {
      const filtered = filterRiders(mockRiders, 'smith')
      expect(filtered).toHaveLength(2)
    })

    it('filters by full name', () => {
      const filtered = filterRiders(mockRiders, 'jane smith')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].slug).toBe('jane-smith')
    })

    it('is case insensitive', () => {
      const filtered = filterRiders(mockRiders, 'JOHN')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].firstName).toBe('John')
    })

    it('filters by partial match', () => {
      const filtered = filterRiders(mockRiders, 'ada')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].lastName).toBe('Adams')
    })

    it('returns empty array when no matches', () => {
      const filtered = filterRiders(mockRiders, 'xyz')
      expect(filtered).toHaveLength(0)
    })
  })

  describe('combined filtering and grouping', () => {
    it('correctly groups filtered results', () => {
      const filtered = filterRiders(mockRiders, 'smith')
      const groups = groupRidersByLastName(filtered)

      expect(groups.size).toBe(1)
      expect(groups.get('S')).toHaveLength(2)
    })

    it('handles empty filtered results', () => {
      const filtered = filterRiders(mockRiders, 'xyz')
      const groups = groupRidersByLastName(filtered)

      expect(groups.size).toBe(0)
    })
  })
})
