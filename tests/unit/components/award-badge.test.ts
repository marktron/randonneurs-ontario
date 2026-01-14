import { describe, it, expect } from 'vitest'

/**
 * Tests for the award badge component utilities.
 *
 * These tests verify:
 * 1. Color class mapping works correctly for known awards
 * 2. Default color is applied for unknown awards
 * 3. Award descriptions are resolved correctly
 */

// Extracted from components/award-badge.tsx for testing
const colorClassesMap = {
  'Completed Devil Week': 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200',
  'First Brevet': 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200',
  'Super Randonneur': 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200',
  'Ontario Rover': 'bg-lime-200 dark:bg-lime-800 text-lime-800 dark:text-lime-200',
  'Ontario Explorer': 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200',
  'O-5000': 'bg-cyan-200 dark:bg-cyan-800 text-cyan-800 dark:text-cyan-200',
  'O-12': 'bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200',
  'Paris-Brest-Paris': 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200',
  'Granite Anvil': 'bg-fuchsia-200 dark:bg-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-200',
  'Course Record': 'bg-linear-to-tr from-amber-600 to-yellow-500 text-white dark:text-amber-950',
  default: 'bg-zinc-300 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200',
} as const

const defaultDescriptions: Record<string, string> = {
  'Completed Devil Week': "Rode a 200, 300, 400, and 600km brevet during the club's Devil Week.",
  'First Brevet': 'Rode their first brevet with Randonneurs Ontario.',
  'Super Randonneur': 'Completed a 200, 300, 400, and 600 km brevet in the same season.',
  'Ontario Rover': 'Accumulate 1200 km of Permanents with at least two being 300 km or more.',
  'Ontario Explorer': 'Completed at least one brevet in every chapter during a calendar year.',
  'O-5000': 'Completed at least 5000 km of sanctioned events in a calendar year.',
  'O-12': 'Completed a club-sanctioned 200+ km event for 12 consecutive months.',
  'Paris-Brest-Paris': 'Completed Paris-Brest-Paris',
  'Course Record': 'Fastest recorded time for this route',
  'Granite Anvil': 'Completed the Granite Anvil 1200km brevet',
}

interface Award {
  title: string
  description?: string | null
}

function getColorClasses(title: string): string {
  return colorClassesMap[title as keyof typeof colorClassesMap] || colorClassesMap.default
}

function getDescription(award: Award): string {
  return award.description || defaultDescriptions[award.title] || ''
}

/**
 * Aggregate awards from results into counts by title
 * (Extracted from components/award-badge.tsx for testing)
 */
function aggregateAwards(
  awards: Award[]
): Array<{ title: string; description: string | null; count: number }> {
  const countMap = new Map<string, { count: number; description: string | null }>()

  for (const award of awards) {
    const existing = countMap.get(award.title)
    if (existing) {
      existing.count++
    } else {
      countMap.set(award.title, {
        count: 1,
        description: award.description ?? null,
      })
    }
  }

  return Array.from(countMap.entries())
    .map(([title, { count, description }]) => ({
      title,
      description,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}

describe('Award Badge', () => {
  describe('getColorClasses', () => {
    it('returns correct color classes for known awards', () => {
      expect(getColorClasses('Super Randonneur')).toBe(
        'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
      )
      expect(getColorClasses('First Brevet')).toBe(
        'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200'
      )
      expect(getColorClasses('Course Record')).toBe(
        'bg-linear-to-tr from-amber-600 to-yellow-500 text-white dark:text-amber-950'
      )
    })

    it('returns default color classes for unknown awards', () => {
      expect(getColorClasses('Unknown Award')).toBe(colorClassesMap.default)
      expect(getColorClasses('')).toBe(colorClassesMap.default)
    })

    it('handles all defined award types', () => {
      const knownAwards = [
        'Completed Devil Week',
        'First Brevet',
        'Super Randonneur',
        'Ontario Rover',
        'Ontario Explorer',
        'O-5000',
        'O-12',
        'Paris-Brest-Paris',
        'Granite Anvil',
        'Course Record',
      ]

      for (const award of knownAwards) {
        const classes = getColorClasses(award)
        expect(classes).not.toBe(colorClassesMap.default)
        expect(classes).toBeTruthy()
      }
    })
  })

  describe('getDescription', () => {
    it('returns provided description when available', () => {
      const award = {
        title: 'Super Randonneur',
        description: 'Custom description for this achievement',
      }
      expect(getDescription(award)).toBe('Custom description for this achievement')
    })

    it('returns default description when no custom description', () => {
      const award = { title: 'Super Randonneur', description: null }
      expect(getDescription(award)).toBe(
        'Completed a 200, 300, 400, and 600 km brevet in the same season.'
      )
    })

    it('returns empty string for unknown award with no description', () => {
      const award = { title: 'Unknown Award', description: null }
      expect(getDescription(award)).toBe('')
    })

    it('prefers explicit description over default', () => {
      const award = {
        title: 'First Brevet',
        description: 'First brevet with Toronto chapter',
      }
      expect(getDescription(award)).toBe('First brevet with Toronto chapter')
    })

    it('handles all default descriptions', () => {
      const awards = Object.keys(defaultDescriptions)

      for (const title of awards) {
        const description = getDescription({ title, description: null })
        expect(description).toBe(defaultDescriptions[title])
        expect(description).toBeTruthy()
      }
    })
  })

  describe('aggregateAwards', () => {
    it('returns empty array for no awards', () => {
      const result = aggregateAwards([])
      expect(result).toEqual([])
    })

    it('counts single award correctly', () => {
      const awards = [{ title: 'Super Randonneur', description: null }]
      const result = aggregateAwards(awards)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        title: 'Super Randonneur',
        description: null,
        count: 1,
      })
    })

    it('aggregates multiple same awards', () => {
      const awards = [
        { title: 'Super Randonneur', description: null },
        { title: 'Super Randonneur', description: null },
        { title: 'Super Randonneur', description: null },
      ]
      const result = aggregateAwards(awards)

      expect(result).toHaveLength(1)
      expect(result[0].count).toBe(3)
    })

    it('aggregates different awards separately', () => {
      const awards = [
        { title: 'Super Randonneur', description: null },
        { title: 'First Brevet', description: null },
        { title: 'Super Randonneur', description: null },
      ]
      const result = aggregateAwards(awards)

      expect(result).toHaveLength(2)
      expect(result.find((a) => a.title === 'Super Randonneur')?.count).toBe(2)
      expect(result.find((a) => a.title === 'First Brevet')?.count).toBe(1)
    })

    it('sorts by count descending, then alphabetically', () => {
      const awards = [
        { title: 'Zebra Award', description: null },
        { title: 'Alpha Award', description: null },
        { title: 'Alpha Award', description: null },
        { title: 'Beta Award', description: null },
      ]
      const result = aggregateAwards(awards)

      expect(result[0].title).toBe('Alpha Award')
      expect(result[0].count).toBe(2)
      expect(result[1].title).toBe('Beta Award')
      expect(result[2].title).toBe('Zebra Award')
    })

    it('preserves description from first occurrence', () => {
      const awards = [
        { title: 'Course Record', description: 'Record on Route A' },
        { title: 'Course Record', description: 'Record on Route B' },
      ]
      const result = aggregateAwards(awards)

      expect(result[0].description).toBe('Record on Route A')
      expect(result[0].count).toBe(2)
    })
  })
})
