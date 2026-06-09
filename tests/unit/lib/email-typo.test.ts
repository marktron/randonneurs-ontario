import { describe, it, expect } from 'vitest'
import { suggestEmailCorrection } from '@/lib/utils/email-typo'

describe('suggestEmailCorrection', () => {
  it('corrects a known typo domain', () => {
    expect(suggestEmailCorrection('haemdoc2@gmail.co')).toBe('haemdoc2@gmail.com')
    expect(suggestEmailCorrection('rider@gmial.com')).toBe('rider@gmail.com')
    expect(suggestEmailCorrection('rider@gmail.con')).toBe('rider@gmail.com')
    expect(suggestEmailCorrection('rider@hotmial.com')).toBe('rider@hotmail.com')
    expect(suggestEmailCorrection('rider@yahooo.com')).toBe('rider@yahoo.com')
  })

  it('returns null for valid domains', () => {
    expect(suggestEmailCorrection('rider@gmail.com')).toBeNull()
    expect(suggestEmailCorrection('vp-simcoe@randonneursontario.ca')).toBeNull()
    expect(suggestEmailCorrection('first.last@domain.co.uk')).toBeNull()
  })

  it('is case-insensitive and normalizes the suggestion', () => {
    expect(suggestEmailCorrection('Foo@GMAIL.CO')).toBe('foo@gmail.com')
  })

  it('preserves the local-part exactly (lowercased), including dots and plus tags', () => {
    expect(suggestEmailCorrection('first.last+rando@gmail.co')).toBe('first.last+rando@gmail.com')
  })

  it('returns null for malformed or empty input without throwing', () => {
    expect(suggestEmailCorrection('')).toBeNull()
    expect(suggestEmailCorrection('   ')).toBeNull()
    expect(suggestEmailCorrection('no-at-sign')).toBeNull()
    expect(suggestEmailCorrection('trailing@')).toBeNull()
    expect(suggestEmailCorrection('@leading.com')).toBeNull()
    // split on the LAST '@' → local-part 'a@b', domain 'gmail.co'
    expect(suggestEmailCorrection('a@b@gmail.co')).toBe('a@b@gmail.com')
  })
})

describe('suggestEmailCorrection — edit-distance engine', () => {
  it('suggests on clear distance-1 typos (extra/dropped/wrong/transposed char)', () => {
    expect(suggestEmailCorrection('colin@yahoo.comc')).toBe('colin@yahoo.com') // extra char
    expect(suggestEmailCorrection('r@gmail.con')).toBe('r@gmail.com') // wrong char
    expect(suggestEmailCorrection('r@gmail.cm')).toBe('r@gmail.com') // dropped char
    expect(suggestEmailCorrection('r@gmaill.com')).toBe('r@gmail.com') // extra char
    expect(suggestEmailCorrection('r@gamil.com')).toBe('r@gmail.com') // transposition
    expect(suggestEmailCorrection('r@rogers.con')).toBe('r@rogers.com')
    expect(suggestEmailCorrection('r@outlok.com')).toBe('r@outlook.com')
  })

  it('suggests gmail.com for gmail.co (unambiguous — no gmail.ca anchor)', () => {
    expect(suggestEmailCorrection('r@gmail.co')).toBe('r@gmail.com')
  })

  it('stays silent on .com/.ca ties (ambiguous → null)', () => {
    expect(suggestEmailCorrection('r@yahoo.co')).toBeNull() // yahoo.com vs yahoo.ca
    expect(suggestEmailCorrection('r@yahoo.cm')).toBeNull()
    expect(suggestEmailCorrection('r@hotmail.co')).toBeNull()
    expect(suggestEmailCorrection('r@live.cm')).toBeNull()
  })

  it('returns null when the domain already equals a known anchor', () => {
    expect(suggestEmailCorrection('r@gmail.com')).toBeNull()
    expect(suggestEmailCorrection('r@yahoo.ca')).toBeNull()
    expect(suggestEmailCorrection('r@bell.net')).toBeNull()
  })

  it('returns null for unrelated valid domains and distance-≥2 noise', () => {
    expect(suggestEmailCorrection('vp@randonneursontario.ca')).toBeNull()
    expect(suggestEmailCorrection('first.last@domain.co.uk')).toBeNull()
    expect(suggestEmailCorrection('r@example.org')).toBeNull()
    expect(suggestEmailCorrection('r@gmial.con')).toBeNull() // 2 edits from gmail.com
  })

  it('documents the accepted short-anchor nudge', () => {
    expect(suggestEmailCorrection('r@we.com')).toBe('r@me.com')
  })
})
