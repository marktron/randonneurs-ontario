import { describe, it, expect } from 'vitest'
import { extractSchedId, LEGACY_EVENT_MAP } from '@/lib/legacy-redirects'

describe('extractSchedId', () => {
  it('extracts numeric ID from end of slug', () => {
    expect(extractSchedId('wizard-of-oz-1256')).toBe('1256')
  })

  it('extracts ID from simple slug', () => {
    expect(extractSchedId('new-years-1351')).toBe('1351')
  })

  it('extracts only the trailing number, not mid-slug numbers', () => {
    expect(extractSchedId('spring-200-1290')).toBe('1290')
  })

  it('returns null for slug without trailing number after hyphen', () => {
    expect(extractSchedId('some-route-name')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractSchedId('')).toBeNull()
  })

  it('returns null for slug ending with non-numeric characters', () => {
    expect(extractSchedId('test-route-abc')).toBeNull()
  })
})

describe('LEGACY_EVENT_MAP', () => {
  it('contains all 2026 season events', () => {
    expect(Object.keys(LEGACY_EVENT_MAP).length).toBe(148)
  })

  it('maps Wizard of Oz 200km brevet correctly', () => {
    expect(LEGACY_EVENT_MAP['1256']).toBe('wizard-of-oz-200km-2026-03-28')
  })

  it('maps Wizard of Oz 100km populaire correctly', () => {
    expect(LEGACY_EVENT_MAP['1400']).toBe('wizard-of-oz-100km-2026-03-28')
  })

  it('maps event with apostrophe in name', () => {
    expect(LEGACY_EVENT_MAP['1292']).toBe('queen-s-bush-200km-2026-07-29')
  })

  it('maps event with special characters', () => {
    expect(LEGACY_EVENT_MAP['1268']).toBe('tour-d-essex-100km-2026-05-30')
  })

  it('all values are non-empty strings', () => {
    for (const slug of Object.values(LEGACY_EVENT_MAP)) {
      expect(slug).toBeTruthy()
      expect(typeof slug).toBe('string')
    }
  })
})
