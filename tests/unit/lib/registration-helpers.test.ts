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
  // The digital brevet card is deployed but not yet ready for riders, so the
  // confirmation-email link is temporarily suppressed for every event type.
  // When the feature is re-enabled these assertions flip: card-eligible event
  // types should return the /card/<token> URL again.
  it('returns undefined for card-eligible event types while the email link is hidden', () => {
    expect(buildConfirmationEmailCardUrl('brevet', 'token-123')).toBeUndefined()
    expect(buildConfirmationEmailCardUrl('populaire', 'token-123')).toBeUndefined()
    expect(buildConfirmationEmailCardUrl('permanent', 'token-123')).toBeUndefined()
  })

  it('returns undefined for ineligible event types', () => {
    expect(buildConfirmationEmailCardUrl('fleche', 'token-123')).toBeUndefined()
    expect(buildConfirmationEmailCardUrl(null, 'token-123')).toBeUndefined()
  })
})
