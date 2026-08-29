import { describe, it, expect } from 'vitest'

import { buildConfirmationEmailCardUrl, buildRouteUrl } from '@/lib/actions/registration/helpers'

describe('buildRouteUrl', () => {
  it('builds the route URL from a route id', () => {
    expect(buildRouteUrl('12345678')).toBe('https://ridewithgps.com/routes/12345678')
  })

  it('falls back to the collection URL when only a collection id is given', () => {
    expect(buildRouteUrl(null, '8387874')).toBe('https://ridewithgps.com/collections/8387874')
  })

  it('prefers the route URL when both ids are given', () => {
    expect(buildRouteUrl('12345678', '8387874')).toBe('https://ridewithgps.com/routes/12345678')
  })

  it('returns undefined when neither id is given', () => {
    expect(buildRouteUrl(null, null)).toBeUndefined()
    expect(buildRouteUrl(undefined)).toBeUndefined()
  })
})

describe('buildConfirmationEmailCardUrl', () => {
  // Every rider on a card-eligible event gets the link, whatever brevet card
  // they asked for at registration — the card page explains itself if the
  // organizer hasn't set up controls yet.
  it('returns the /card/<token> URL for card-eligible event types', () => {
    expect(buildConfirmationEmailCardUrl('brevet', 'token-123')).toMatch(/\/card\/token-123$/)
    expect(buildConfirmationEmailCardUrl('populaire', 'token-123')).toMatch(/\/card\/token-123$/)
    expect(buildConfirmationEmailCardUrl('permanent', 'token-123')).toMatch(/\/card\/token-123$/)
  })

  it('accepts the display-cased event type the email payload actually carries', () => {
    // register.ts builds emailBase.eventType with formatEventType(), which
    // yields 'Brevet' / 'Populaire' / 'Permanent' — not the raw DB value.
    expect(buildConfirmationEmailCardUrl('Brevet', 'token-123')).toMatch(/\/card\/token-123$/)
    expect(buildConfirmationEmailCardUrl('Populaire', 'token-123')).toMatch(/\/card\/token-123$/)
    expect(buildConfirmationEmailCardUrl('Permanent', 'token-123')).toMatch(/\/card\/token-123$/)
    expect(buildConfirmationEmailCardUrl('Fleche', 'token-123')).toBeUndefined()
  })

  it('returns undefined for ineligible event types', () => {
    expect(buildConfirmationEmailCardUrl('fleche', 'token-123')).toBeUndefined()
    expect(buildConfirmationEmailCardUrl(null, 'token-123')).toBeUndefined()
  })
})
