import { describe, it, expect } from 'vitest'
import { getSafeRedirect } from '@/lib/safe-redirect'

describe('getSafeRedirect', () => {
  it('falls back when there is nothing to redirect to', () => {
    expect(getSafeRedirect(null, ['/account'], '/account')).toBe('/account')
    expect(getSafeRedirect(undefined, ['/account'], '/account')).toBe('/account')
    expect(getSafeRedirect('', ['/account'], '/account')).toBe('/account')
  })

  it('allows a path that is exactly a prefix, or sits under it', () => {
    expect(getSafeRedirect('/account', ['/account'], '/account')).toBe('/account')
    expect(getSafeRedirect('/account/settings', ['/account'], '/account')).toBe('/account/settings')
  })

  it('honours every prefix in the list', () => {
    const allowed = ['/account', '/register']
    expect(getSafeRedirect('/register/toronto-200', allowed, '/account')).toBe(
      '/register/toronto-200'
    )
    expect(getSafeRedirect('/admin', allowed, '/account')).toBe('/account')
  })

  it('does not treat a prefix as a bare string prefix', () => {
    // '/accounts-payable' starts with '/account' but is a different route.
    expect(getSafeRedirect('/accounts-payable', ['/account'], '/account')).toBe('/account')
    expect(getSafeRedirect('/adminland', ['/admin'], '/admin')).toBe('/admin')
  })

  it('rejects protocol-relative and absolute URLs', () => {
    expect(getSafeRedirect('//evil.example', ['/account'], '/account')).toBe('/account')
    expect(getSafeRedirect('https://evil.example/account', ['/account'], '/account')).toBe(
      '/account'
    )
  })

  it('rejects path traversal', () => {
    expect(getSafeRedirect('/account/../admin', ['/account'], '/account')).toBe('/account')
    // The admin allow-list used to miss this one entirely.
    expect(getSafeRedirect('/admin/../account', ['/admin'], '/admin')).toBe('/admin')
    expect(getSafeRedirect('//evil.example', ['/admin'], '/admin')).toBe('/admin')
  })
})
