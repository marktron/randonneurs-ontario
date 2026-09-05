import { describe, it, expect } from 'vitest'
import { getSafeAccountRedirect } from '@/lib/account/redirect'

describe('getSafeAccountRedirect', () => {
  it('defaults to /account', () => {
    expect(getSafeAccountRedirect(null)).toBe('/account')
    expect(getSafeAccountRedirect(undefined)).toBe('/account')
    expect(getSafeAccountRedirect('')).toBe('/account')
  })
  it('allows /account and /register paths', () => {
    expect(getSafeAccountRedirect('/account/settings')).toBe('/account/settings')
    expect(getSafeAccountRedirect('/register/toronto-200')).toBe('/register/toronto-200')
  })
  it('rejects everything else, including protocol-relative and admin paths', () => {
    expect(getSafeAccountRedirect('//evil.example')).toBe('/account')
    expect(getSafeAccountRedirect('https://evil.example/account')).toBe('/account')
    expect(getSafeAccountRedirect('/admin')).toBe('/account')
    expect(getSafeAccountRedirect('/accounts-payable')).toBe('/account')
  })
  it('rejects path traversal', () => {
    expect(getSafeAccountRedirect('/account/../admin')).toBe('/account')
  })
})
