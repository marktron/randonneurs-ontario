import { describe, it, expect } from 'vitest'
import {
  roundKm,
  buildRouteTrack,
  pointAtKm,
  canonicalStart,
  snapToTrack,
  checkStoredStart,
  type TrackPoint,
} from '@/lib/routeTrack'

// 0.001 degrees of latitude is about 111.2 m.
const STEP_KM = 0.1112
/** Straight north for `n` steps: point-to-point. */
function line(n: number): TrackPoint[] {
  return Array.from({ length: n + 1 }, (_, i) => ({
    lat: 44 + i * 0.001,
    lng: -79,
    km: i * STEP_KM,
  }))
}
/** North for `n` steps then straight back: a loop that overlaps itself. */
function outAndBack(n: number): TrackPoint[] {
  const out = line(n)
  const back = Array.from({ length: n }, (_, k) => {
    const j = n + 1 + k
    return { lat: 44 + (2 * n - j) * 0.001, lng: -79, km: j * STEP_KM }
  })
  return [...out, ...back]
}

describe('roundKm', () => {
  it('rounds to one decimal', () => {
    expect(roundKm(204.54)).toBe(204.5)
    expect(roundKm(204.56)).toBe(204.6)
  })
})

describe('buildRouteTrack', () => {
  it('flags an out-and-back as a loop and rounds the length', () => {
    const track = buildRouteTrack(outAndBack(90), 20.016)!
    expect(track.isLoop).toBe(true)
    expect(track.totalKm).toBe(20)
    expect(track.points[0].km).toBe(0)
    expect(track.points.at(-1)!.km).toBeCloseTo(20.016, 3)
  })

  it('flags a point-to-point route as not a loop', () => {
    expect(buildRouteTrack(line(90), 10.008)!.isLoop).toBe(false)
  })

  it('falls back to the last point when the distance is missing', () => {
    expect(buildRouteTrack(line(90), 0)!.totalKm).toBe(10)
  })

  it('thins dense tracks to about 100 m spacing and keeps both ends', () => {
    const dense: TrackPoint[] = Array.from({ length: 1001 }, (_, i) => ({
      lat: 44 + i * 0.0001,
      lng: -79,
      km: i * 0.01112,
    }))
    const track = buildRouteTrack(dense, 11.12)!
    expect(track.points.length).toBeLessThan(120)
    expect(track.points[0]).toEqual(dense[0])
    expect(track.points.at(-1)).toEqual(dense.at(-1))
  })

  it('caps very long routes at about 3000 points', () => {
    const long: TrackPoint[] = Array.from({ length: 12001 }, (_, i) => ({
      lat: 44 + i * 0.001,
      lng: -79,
      km: i * 0.1,
    }))
    expect(buildRouteTrack(long, 1200)!.points.length).toBeLessThanOrEqual(3002)
  })

  it('returns null without at least two usable points', () => {
    expect(buildRouteTrack([], 200)).toBeNull()
    expect(buildRouteTrack([{ lat: 44, lng: -79, km: 0 }], 200)).toBeNull()
    expect(
      buildRouteTrack(
        [
          { lat: NaN, lng: -79, km: 0 },
          { lat: 44, lng: -79, km: 1 },
        ],
        1
      )
    ).toBeNull()
  })
})

describe('canonicalStart', () => {
  const track = buildRouteTrack(outAndBack(90), 20.016)!

  it('rounds the offset and takes coordinates from the track', () => {
    const start = canonicalStart(track, 5.04)!
    expect(start.offsetKm).toBe(5)
    expect(start).toMatchObject((({ lat, lng }) => ({ lat, lng }))(pointAtKm(track, 5)))
  })

  it('treats a start within 0.1 km of either end as no alternate start', () => {
    expect(canonicalStart(track, 0)).toBeNull()
    expect(canonicalStart(track, 0.04)).toBeNull()
    expect(canonicalStart(track, 20)).toBeNull()
    expect(canonicalStart(track, 19.96)).toBeNull()
    expect(canonicalStart(track, 0.1)).not.toBeNull()
    expect(canonicalStart(track, 19.9)).not.toBeNull()
  })

  it('rejects offsets outside the route and non-numbers', () => {
    expect(canonicalStart(track, -3)).toBeNull()
    expect(canonicalStart(track, 25)).toBeNull()
    expect(canonicalStart(track, NaN)).toBeNull()
  })
})

describe('snapToTrack', () => {
  it('returns one candidate on a section the route passes once', () => {
    const track = buildRouteTrack(line(90), 10.008)!
    const result = snapToTrack(track, 44.045, -79)
    expect(result).toHaveLength(1)
    expect(result[0].offsetKm).toBe(5)
  })

  it('returns both passes on an out-and-back, ordered by distance', () => {
    const track = buildRouteTrack(outAndBack(90), 20.016)!
    const result = snapToTrack(track, 44.045, -79)
    expect(result.map((c) => c.offsetKm)).toEqual([5, 15])
  })

  it('snaps a tap far from the route to the nearest point', () => {
    const track = buildRouteTrack(line(90), 10.008)!
    // About 4 km east of the line at lat 44.045.
    const result = snapToTrack(track, 44.045, -78.95)
    expect(result).toHaveLength(1)
    expect(result[0].offsetKm).toBe(5)
  })

  it("returns nothing for a tap on a loop's posted start", () => {
    const track = buildRouteTrack(outAndBack(90), 20.016)!
    expect(snapToTrack(track, 44, -79)).toEqual([])
  })
})

describe('checkStoredStart', () => {
  const track = buildRouteTrack(outAndBack(90), 20.016)!

  it('accepts a start produced by canonicalStart', () => {
    expect(checkStoredStart(track, canonicalStart(track, 5)!)).toBe('ok')
  })

  it('flags coordinates that are no longer on the track at that offset', () => {
    expect(checkStoredStart(track, { offsetKm: 5, lat: 44.2, lng: -79 })).toBe('off_track')
  })

  it('flags an offset at or beyond the end of a shortened route', () => {
    const p = pointAtKm(track, 5)
    expect(checkStoredStart(track, { offsetKm: 20, lat: p.lat, lng: p.lng })).toBe('beyond_route')
    expect(checkStoredStart(track, { offsetKm: 31.5, lat: p.lat, lng: p.lng })).toBe('beyond_route')
  })
})
