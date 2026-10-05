import { describe, it, expect, vi, beforeEach } from 'vitest'

let rows: Record<string, unknown> = {}
const eqCalls: [string, string, unknown][] = []
vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          eqCalls.push([table, column, value])
          return builder
        },
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        // Awaiting the builder directly lists rows (the registrations lookup).
        then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
          resolve({ data: rows[table] ?? [], error: null }),
      }
      return builder
    },
  }),
}))
const mockLoadRouteMap = vi.fn()
vi.mock('@/lib/data/route-track', () => ({
  loadRouteMap: (id: string) => mockLoadRouteMap(id),
}))

import { getPermanentRouteTrack, getExistingPermanentRide } from '@/lib/actions/permanent-start'

const track = { points: [], totalKm: 20, isLoop: true }
const controls = [{ name: 'Cafe', km: 9.5, lat: 44.1, lng: -79.2 }]

beforeEach(() => {
  rows = {}
  eqCalls.length = 0
  mockLoadRouteMap.mockReset()
})

describe('getPermanentRouteTrack', () => {
  it('returns the track and controls for an active route with an RWGPS id', async () => {
    rows.routes = { id: 'r1', rwgps_id: '123' }
    mockLoadRouteMap.mockResolvedValue({ track, controls })
    expect(await getPermanentRouteTrack('r1')).toEqual({ available: true, track, controls })
    expect(mockLoadRouteMap).toHaveBeenCalledWith('123')
    expect(eqCalls).toContainEqual(['routes', 'is_active', true])
  })

  it('returns only the public fields of each control', async () => {
    rows.routes = { id: 'r1', rwgps_id: '123' }
    mockLoadRouteMap.mockResolvedValue({
      track,
      controls: [{ ...controls[0], notes: 'Ask for a stamp', distance: '9.5' }],
    })
    const result = await getPermanentRouteTrack('r1')
    expect(result.available && result.controls).toEqual(controls)
  })

  it('is unavailable for an unknown or inactive route', async () => {
    expect(await getPermanentRouteTrack('nope')).toEqual({ available: false })
    expect(mockLoadRouteMap).not.toHaveBeenCalled()
  })

  it('is unavailable for a collection route (no RWGPS route id)', async () => {
    rows.routes = { id: 'r1', rwgps_id: null }
    expect(await getPermanentRouteTrack('r1')).toEqual({ available: false })
  })

  it('is unavailable when the track cannot be loaded', async () => {
    rows.routes = { id: 'r1', rwgps_id: '123' }
    mockLoadRouteMap.mockResolvedValue(null)
    expect(await getPermanentRouteTrack('r1')).toEqual({ available: false })
  })
})

describe('getExistingPermanentRide', () => {
  const ride = {
    id: 'e1',
    start_time: '08:00:00',
    start_location: 'Tim Hortons',
    start_offset_km: 42.3,
    direction: 'reversed',
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
  }

  it('looks the ride up by its unique key and returns its start', async () => {
    rows.routes = { slug: 'lake-loop', chapter_id: 'c1' }
    rows.events = ride
    rows.registrations = [{ status: 'registered' }]
    expect(await getExistingPermanentRide('r1', '2027-05-01', 'reversed')).toEqual({
      startTime: '08:00',
      startLocation: 'Tim Hortons',
      startOffsetKm: 42.3,
    })
    expect(eqCalls).toContainEqual(['events', 'slug', 'permanent-lake-loop-2027-05-01-reverse'])
    expect(eqCalls).toContainEqual(['events', 'chapter_id', 'c1'])
    expect(eqCalls).toContainEqual(['events', 'event_date', '2027-05-01'])
  })

  it('returns null for a ride nobody is on, so the form does not lock onto it', async () => {
    rows.routes = { slug: 'lake-loop', chapter_id: 'c1' }
    rows.events = ride
    rows.registrations = [{ status: 'cancelled' }]
    expect(await getExistingPermanentRide('r1', '2027-05-01', 'reversed')).toBeNull()
    rows.registrations = []
    expect(await getExistingPermanentRide('r1', '2027-05-01', 'reversed')).toBeNull()
  })

  it('returns null when no ride exists', async () => {
    rows.routes = { slug: 'lake-loop', chapter_id: 'c1' }
    expect(await getExistingPermanentRide('r1', '2027-05-01', 'as_posted')).toBeNull()
  })

  it('returns null for a malformed date without querying', async () => {
    expect(await getExistingPermanentRide('r1', "2027-05-01'; --", 'as_posted')).toBeNull()
    expect(eqCalls).toHaveLength(0)
  })
})
