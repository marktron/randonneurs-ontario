import { describe, it, expect } from 'vitest'

import { buildConfirmationEmailCardUrl } from '@/lib/actions/registration/helpers'

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
