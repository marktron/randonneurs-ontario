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
