import { describe, it, expect } from 'vitest'
import {
  levenshteinDistance,
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

  describe('sanitization (PostgREST injection guard)', () => {
    // The variants are interpolated into a PostgREST `or()` filter in
    // searchRiderCandidates; characters like `,` `(` `)` `:` `*` `%` `.` `\`
    // would break out of the `first_name.ilike.%...%` expression and inject
    // additional filter clauses targeting other columns.
    const dangerousChars = [',', '.', '%', '@', '(', ')', ':', '*', '\\']

    it('strips PostgREST operator characters from input', () => {
      const variants = getNameVariants('bob,email.like.%@target.com%')
      for (const variant of variants) {
        for (const ch of dangerousChars) {
          expect(variant).not.toContain(ch)
        }
      }
    })

    it('still resolves nicknames after stripping wrapping characters', () => {
      const variants = getNameVariants('(bob)')
      expect(variants).toContain('bob')
      expect(variants).toContain('robert')
    })

    it("preserves apostrophes (e.g., O'Brien)", () => {
      const variants = getNameVariants("O'Brien")
      expect(variants).toEqual(["o'brien"])
    })

    it('preserves hyphens (e.g., Jean-Pierre)', () => {
      const variants = getNameVariants('Jean-Pierre')
      expect(variants).toEqual(['jean-pierre'])
    })

    it('preserves spaces (e.g., Mary Jane)', () => {
      const variants = getNameVariants('Mary Jane')
      expect(variants).toEqual(['mary jane'])
    })

    it('preserves accented Unicode letters', () => {
      const variants = getNameVariants('François')
      expect(variants).toEqual(['françois'])
    })

    it('returns an empty array when input is only special characters', () => {
      expect(getNameVariants(',,,')).toEqual([])
      expect(getNameVariants('()*%')).toEqual([])
    })

    it('returns an empty array for whitespace-only input', () => {
      expect(getNameVariants('   ')).toEqual([])
    })
  })
})

describe('fuzzyNameScore', () => {
  it('returns 1.0 for exact matches', () => {
    expect(fuzzyNameScore('Tim', 'Smith', 'Tim', 'Smith')).toBe(1.0)
  })

  it("handles special characters (O'Callahan vs Ocallahan)", () => {
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

  it('handles Toby vs Tobias (nicknames)', () => {
    const score = fuzzyNameScore('Toby', 'Whitfield', 'Tobias', 'Whitfield')
    expect(score).toBe(1.0)
  })

  it('handles parenthetical nicknames - Xinhua (Luke) vs Luke', () => {
    const score = fuzzyNameScore('Luke', 'Luo', 'Xinhua (Luke)', 'Luo')
    expect(score).toBe(1.0)
  })

  it('handles parenthetical nicknames - Xinhua (Luke) vs Xinhua', () => {
    const score = fuzzyNameScore('Xinhua', 'Luo', 'Xinhua (Luke)', 'Luo')
    expect(score).toBe(1.0)
  })

  it('handles surname prefixes - de Vries vs Vries', () => {
    const score = fuzzyNameScore('Philip', 'Vries', 'Philip', 'de Vries')
    expect(score).toBe(1.0)
  })

  it('handles surname prefixes - van der Berg vs Berg', () => {
    const score = fuzzyNameScore('Jan', 'Berg', 'Jan', 'van der Berg')
    expect(score).toBe(1.0)
  })

  it('handles surname prefixes - deVries (no space) vs de Vries', () => {
    const score = fuzzyNameScore('Philip', 'deVries', 'Philip', 'de Vries')
    expect(score).toBe(1.0)
  })

  it('handles hyphenated first names - Jean-Pierre vs Jean', () => {
    const score = fuzzyNameScore('Jean', 'Malherbe', 'Jean-Pierre', 'Malherbe')
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

  it("finds Tim O'Callahan when searching Tim Ocallahan", () => {
    const matches = findFuzzyNameMatches(
      'Tim',
      'Ocallahan',
      candidates,
      (c) => c.first,
      (c) => c.last,
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
      (c) => c.first,
      (c) => c.last,
      { threshold: 0.9 }
    )

    // Only exact or near-exact matches should pass
    expect(matches.every((m) => m.score >= 0.9)).toBe(true)
  })

  it('respects maxResults', () => {
    const matches = findFuzzyNameMatches(
      'T',
      'S',
      candidates,
      (c) => c.first,
      (c) => c.last,
      { threshold: 0.1, maxResults: 2 }
    )

    expect(matches.length).toBeLessThanOrEqual(2)
  })
})
