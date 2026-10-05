import { describe, it, expect } from 'vitest'
import {
  describeRideStartForAdmin,
  permanentEventSlug,
  toHHMM,
  formatClock,
  permanentStartMismatch,
  formatPermanentStartLocation,
} from '@/lib/permanent-start'

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

describe('permanentEventSlug', () => {
  it('matches the existing slug scheme', () => {
    expect(permanentEventSlug('lake-loop', '2027-05-01', 'as_posted')).toBe(
      'permanent-lake-loop-2027-05-01'
    )
    expect(permanentEventSlug('lake-loop', '2027-05-01', 'reversed')).toBe(
      'permanent-lake-loop-2027-05-01-reverse'
    )
  })
})

describe('formatClock', () => {
  it('formats HH:MM or HH:MM:SS as a 12-hour time', () => {
    expect(formatClock('06:30')).toBe('6:30 AM')
    expect(formatClock('00:05:00')).toBe('12:05 AM')
    expect(formatClock('12:00')).toBe('12:00 PM')
    expect(formatClock('23:45')).toBe('11:45 PM')
  })
})

describe('toHHMM', () => {
  it('cuts database TIME values to HH:MM', () => {
    expect(toHHMM('08:00:00')).toBe('08:00')
    expect(toHHMM('08:00')).toBe('08:00')
    expect(toHHMM(null)).toBeNull()
  })
})

describe('permanentStartMismatch', () => {
  const existing = {
    start_time: '08:00:00',
    start_location: 'Tim Hortons, Uxbridge',
    start_offset_km: 42.3,
    direction: 'as_posted',
  }

  it('accepts the same start after a database round trip', () => {
    expect(permanentStartMismatch(existing, { startTime: '08:00', offsetKm: 42.3 })).toBeNull()
    expect(
      permanentStartMismatch(existing, { startTime: '08:00', offsetKm: 42.30000001 })
    ).toBeNull()
  })

  it('rejects a different time, naming the existing start', () => {
    expect(permanentStartMismatch(existing, { startTime: '09:00', offsetKm: 42.3 })).toBe(
      'A ride on this route is already registered for this date, starting at 8:00 AM from Tim Hortons, Uxbridge (42.3 km into the posted route). Join it with the same start, or choose another date.'
    )
  })

  it('rejects a different offset and a missing offset', () => {
    expect(permanentStartMismatch(existing, { startTime: '08:00', offsetKm: 50 })).not.toBeNull()
    expect(permanentStartMismatch(existing, { startTime: '08:00', offsetKm: null })).not.toBeNull()
  })

  it('lets a rider with no alternate start join a legacy ride', () => {
    const legacy = { ...existing, start_location: 'My driveway', start_offset_km: null }
    expect(permanentStartMismatch(legacy, { startTime: '08:00', offsetKm: null })).toBeNull()
  })

  it('describes a posted-start ride when rejecting an alternate start', () => {
    const posted = { ...existing, start_location: null, start_offset_km: null }
    expect(permanentStartMismatch(posted, { startTime: '08:00', offsetKm: 12 })).toBe(
      'A ride on this route is already registered for this date, starting at 8:00 AM from the posted start. Join it with the same start, or choose another date.'
    )
  })
})

describe('formatPermanentStartLocation', () => {
  it('formats the email start line for each case', () => {
    expect(
      formatPermanentStartLocation({
        start_location: null,
        start_offset_km: null,
        direction: 'as_posted',
      })
    ).toBe('Start control per route')
    expect(
      formatPermanentStartLocation({
        start_location: null,
        start_offset_km: null,
        direction: 'reversed',
      })
    ).toBe('Route finish (riding the route reversed)')
    expect(
      formatPermanentStartLocation({
        start_location: 'Tim Hortons, Uxbridge',
        start_offset_km: 42.3,
        direction: 'as_posted',
      })
    ).toBe('Tim Hortons, Uxbridge (42.3 km into the posted route)')
    expect(
      formatPermanentStartLocation({
        start_location: 'Tim Hortons, Uxbridge',
        start_offset_km: 42,
        direction: 'reversed',
      })
    ).toBe('Tim Hortons, Uxbridge (42.0 km into the posted route), riding the route reversed')
    expect(
      formatPermanentStartLocation({
        start_location: 'My driveway',
        start_offset_km: null,
        direction: 'as_posted',
      })
    ).toBe('My driveway')
  })
})
