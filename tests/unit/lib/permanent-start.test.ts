import { describe, it, expect } from 'vitest'
import { describeRideStartForAdmin } from '@/lib/permanent-start'

describe('describeRideStartForAdmin', () => {
  it('is null for an as-posted ride from the posted start', () => {
    expect(
      describeRideStartForAdmin({
        direction: 'as_posted',
        startLocation: null,
        startOffsetKm: null,
      })
    ).toBeNull()
  })
  it('describes a reversed ride', () => {
    expect(
      describeRideStartForAdmin({ direction: 'reversed', startLocation: null, startOffsetKm: null })
    ).toBe('Reversed.')
  })
  it('describes an alternate start', () => {
    expect(
      describeRideStartForAdmin({
        direction: 'as_posted',
        startLocation: 'Tim Hortons, Uxbridge',
        startOffsetKm: 42.3,
      })
    ).toBe('Starts at Tim Hortons, Uxbridge, 42.3 km into the posted route.')
  })
  it('describes both', () => {
    expect(
      describeRideStartForAdmin({
        direction: 'reversed',
        startLocation: 'Tim Hortons, Uxbridge',
        startOffsetKm: 42,
      })
    ).toBe('Reversed. Starts at Tim Hortons, Uxbridge, 42.0 km into the posted route.')
  })
  it('mentions a legacy free-text start that has no offset', () => {
    expect(
      describeRideStartForAdmin({
        direction: 'as_posted',
        startLocation: 'My driveway',
        startOffsetKm: null,
      })
    ).toBe('Rider noted a start at My driveway (no position on the route, controls not adjusted).')
  })
})
