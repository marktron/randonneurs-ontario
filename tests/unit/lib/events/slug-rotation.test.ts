import { describe, it, expect } from 'vitest'
import { buildEventSlug, planSlugRotation } from '@/lib/events/slug-rotation'

describe('buildEventSlug', () => {
  it('matches the createEvent formula', () => {
    expect(buildEventSlug('Wizard of Oz', 200, '2026-03-28')).toBe('wizard-of-oz-200km-2026-03-28')
  })
})

describe('planSlugRotation', () => {
  const stored = {
    slug: 'wizard-of-oz-200km-2026-03-28',
    name: 'Wizard of Oz',
    distance_km: 200,
    event_date: '2026-03-28',
    event_type: 'brevet',
  }

  it('returns the new slug when the date changes', () => {
    expect(planSlugRotation(stored, { eventDate: '2026-04-04' })).toBe(
      'wizard-of-oz-200km-2026-04-04'
    )
  })

  it('returns null when eventDate is absent', () => {
    expect(planSlugRotation(stored, { name: 'Oz', distanceKm: 300 })).toBeNull()
  })

  it('returns null when the date is unchanged even if the name changed', () => {
    expect(
      planSlugRotation(stored, { name: 'Wizard of Oz Classic', eventDate: '2026-03-28' })
    ).toBeNull()
  })

  it('returns null for permanents', () => {
    expect(
      planSlugRotation({ ...stored, event_type: 'permanent' }, { eventDate: '2026-04-04' })
    ).toBeNull()
  })

  it('uses incoming name and distance when provided with the new date', () => {
    expect(planSlugRotation(stored, { name: 'Oz', distanceKm: 300, eventDate: '2026-04-04' })).toBe(
      'oz-300km-2026-04-04'
    )
  })

  it('rebuilds a dateless legacy slug on the formula', () => {
    expect(
      planSlugRotation({ ...stored, slug: 'alexandria-300' }, { eventDate: '2026-04-04' })
    ).toBe('wizard-of-oz-200km-2026-04-04')
  })

  it('returns null when the computed slug already equals the stored slug', () => {
    const alreadyRotated = { ...stored, slug: 'wizard-of-oz-200km-2026-04-04' }
    expect(planSlugRotation(alreadyRotated, { eventDate: '2026-04-04' })).toBeNull()
  })
})
