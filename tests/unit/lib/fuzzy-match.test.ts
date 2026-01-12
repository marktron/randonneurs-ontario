import { describe, it, expect } from 'vitest'
import {
  levenshteinDistance,
  similarityScore,
  fuzzyNameScore,
  findFuzzyNameMatches,
  getNameVariants,
} from '@/lib/utils/fuzzy-match'

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0)
  })

  it('handles case insensitivity', () => {
    expect(levenshteinDistance('Hello', 'hello')).toBe(0)
  })

  it('returns correct distance for simple edits', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1) // substitution
    expect(levenshteinDistance('cat', 'cart')).toBe(1) // insertion
    expect(levenshteinDistance('cart', 'cat')).toBe(1) // deletion
  })
})

describe('getNameVariants', () => {
  it('returns the name itself for unknown names', () => {
    const variants = getNameVariants('Xyz')
    expect(variants).toContain('xyz')
    expect(variants.length).toBe(1)
  })

  it('returns nicknames for canonical names', () => {
    const variants = getNameVariants('Robert')
    expect(variants).toContain('robert')
    expect(variants).toContain('bob')
    expect(variants).toContain('rob')
  })

  it('returns canonical and other nicknames for a nickname', () => {
    const variants = getNameVariants('Bob')
    expect(variants).toContain('bob')
    expect(variants).toContain('robert')
    expect(variants).toContain('rob')
    expect(variants).toContain('robbie')
  })

  it('handles Tim/Timothy', () => {
    const variants = getNameVariants('Tim')
    expect(variants).toContain('tim')
    expect(variants).toContain('timothy')
    expect(variants).toContain('timmy')
  })
})

describe('fuzzyNameScore', () => {
  it('returns 1.0 for exact matches', () => {
    expect(fuzzyNameScore('Tim', 'Smith', 'Tim', 'Smith')).toBe(1.0)
  })

  it('handles special characters (O\'Callahan vs Ocallahan)', () => {
    const score = fuzzyNameScore('Tim', 'Ocallahan', 'Tim', "O'Callahan")
    expect(score).toBe(1.0)
  })

  it('handles hyphens in names', () => {
    const score = fuzzyNameScore('Mary', 'JaneWatson', 'Mary', 'Jane-Watson')
    expect(score).toBe(1.0)
  })

  it('handles swapped names', () => {
    const score = fuzzyNameScore('Smith', 'John', 'John', 'Smith')
    expect(score).toBeGreaterThan(0.9)
  })

  it('returns lower score for different names', () => {
    const score = fuzzyNameScore('John', 'Smith', 'Jane', 'Doe')
    expect(score).toBeLessThan(0.5)
  })

  it('handles Bob vs Robert (nicknames)', () => {
    const score = fuzzyNameScore('Bob', 'Smith', 'Robert', 'Smith')
    expect(score).toBe(1.0)
  })

  it('handles Dave vs David (nicknames)', () => {
    const score = fuzzyNameScore('Dave', 'Jones', 'David', 'Jones')
    expect(score).toBe(1.0)
  })

  it('handles Tim vs Timothy (nicknames)', () => {
    const score = fuzzyNameScore('Tim', 'Wilson', 'Timothy', 'Wilson')
    expect(score).toBe(1.0)
  })

  it('handles Mike vs Michael (nicknames)', () => {
    const score = fuzzyNameScore('Mike', 'Brown', 'Michael', 'Brown')
    expect(score).toBe(1.0)
  })
})

describe('findFuzzyNameMatches', () => {
  const candidates = [
    { id: '1', first: 'Tim', last: "O'Callahan" },
    { id: '2', first: 'Timothy', last: 'Smith' },
    { id: '3', first: 'Tom', last: 'Jones' },
    { id: '4', first: 'Jane', last: 'Doe' },
  ]

  it('finds Tim O\'Callahan when searching Tim Ocallahan', () => {
    const matches = findFuzzyNameMatches(
      'Tim',
      'Ocallahan',
      candidates,
      c => c.first,
      c => c.last,
      { threshold: 0.4 }
    )

    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].item.id).toBe('1')
    expect(matches[0].score).toBe(1.0)
  })

  it('respects threshold', () => {
    const matches = findFuzzyNameMatches(
      'Tim',
      'Smith',
      candidates,
      c => c.first,
      c => c.last,
      { threshold: 0.9 }
    )

    // Only exact or near-exact matches should pass
    expect(matches.every(m => m.score >= 0.9)).toBe(true)
  })

  it('respects maxResults', () => {
    const matches = findFuzzyNameMatches(
      'T',
      'S',
      candidates,
      c => c.first,
      c => c.last,
      { threshold: 0.1, maxResults: 2 }
    )

    expect(matches.length).toBeLessThanOrEqual(2)
  })
})
