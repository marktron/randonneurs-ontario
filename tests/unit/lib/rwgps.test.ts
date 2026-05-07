import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  cleanControlName,
  extractControls,
  fetchRwgpsControls,
  fetchRwgpsRoute,
  parseRwgpsRouteRef,
} from '@/lib/rwgps'

// Fixture track points: 5 points spaced at lat 43.00, 43.05, 43.10, 43.15, 43.20
// at lng -81.00, with cumulative distances 0, 5000, 10000, 15000, 20000 meters.
// That lets POI lookups at those latitudes resolve to known distances.
const trackPoints = [
  { x: -81.0, y: 43.0, d: 0 },
  { x: -81.0, y: 43.05, d: 5000 },
  { x: -81.0, y: 43.1, d: 10_000 },
  { x: -81.0, y: 43.15, d: 15_000 },
  { x: -81.0, y: 43.2, d: 20_000 },
]

describe('cleanControlName', () => {
  it('strips "CTL - " prefix', () => {
    expect(cleanControlName('CTL - Tim Horton’s')).toBe('Tim Horton’s')
  })

  it('strips "CTL " prefix (no dash)', () => {
    expect(cleanControlName("CTL Tim Horton's, Ilderton")).toBe("Tim Horton's, Ilderton")
  })

  it('strips "CTRL-" and "CONTROL " prefixes (case-insensitive)', () => {
    expect(cleanControlName('ctrl-Foo')).toBe('Foo')
    expect(cleanControlName('Control Bar')).toBe('Bar')
  })

  it('strips a single leading dash on a non-prefixed name', () => {
    expect(cleanControlName('- Stand-alone')).toBe('Stand-alone')
    expect(cleanControlName('-Tight Dash')).toBe('Tight Dash')
  })

  it('returns "Control" when name is missing', () => {
    expect(cleanControlName(undefined)).toBe('Control')
  })

  it('leaves non-prefixed names untouched', () => {
    expect(cleanControlName('Little Lake')).toBe('Little Lake')
  })
})

describe('extractControls', () => {
  it('extracts controls from course_points only', () => {
    const result = extractControls({
      course_points: [
        { n: 'CTL - Start', d: 0, t: 'Control' },
        { n: 'Turn left', d: 1500, t: 'Left' },
        { n: 'CTL Halfway', d: 10_000, t: 'Control' },
        { n: 'CTL Finish', d: 20_000, t: 'Control' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Halfway', distance: '10.0' },
      { name: 'Finish', distance: '20.0' },
    ])
  })

  it('extracts controls from points_of_interest using track_points to interpolate distance', () => {
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        { name: "CTL Tim Horton's, Ilderton", lat: 43.05, lng: -81.0, poi_type_name: 'control' },
        { name: 'Foodland', lat: 43.1, lng: -81.0, poi_type_name: 'food' },
        { name: 'CTL Finish', lat: 43.2, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([
      { name: "Tim Horton's, Ilderton", distance: '5.0' },
      { name: 'Finish', distance: '20.0' },
    ])
  })

  it('merges course_points and points_of_interest when they do not overlap', () => {
    const result = extractControls({
      track_points: trackPoints,
      course_points: [{ n: 'CTL Start', d: 0, t: 'Control' }],
      points_of_interest: [{ name: 'CTL Middle', lat: 43.1, lng: -81.0, poi_type_name: 'control' }],
    })
    expect(result).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Middle', distance: '10.0' },
    ])
  })

  it('dedupes overlapping controls and prefers the POI entry over the course-point', () => {
    const result = extractControls({
      track_points: trackPoints,
      course_points: [{ n: 'Coursename Halfway', d: 10_050, t: 'Control' }],
      points_of_interest: [
        // Sits on the same track point, 50m away in cumulative distance from the course point.
        { name: 'CTL POI Halfway', lat: 43.1, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([{ name: 'POI Halfway', distance: '10.0' }])
  })

  it('keeps both when the same source has controls > 100 m apart', () => {
    const result = extractControls({
      track_points: trackPoints,
      course_points: [
        { n: 'CTL A', d: 10_000, t: 'Control' },
        { n: 'CTL B', d: 10_200, t: 'Control' }, // 200 m apart → kept
      ],
    })
    expect(result).toEqual([
      { name: 'A', distance: '10.0' },
      { name: 'B', distance: '10.2' },
    ])
  })

  it('ignores non-control POI types', () => {
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        { name: 'Rest stop', lat: 43.05, lng: -81.0, poi_type_name: 'food' },
        { name: 'Parking', lat: 43.1, lng: -81.0, poi_type_name: 'parking' },
        { name: 'Nice view', lat: 43.15, lng: -81.0, poi_type_name: 'viewpoint' },
      ],
    })
    expect(result).toEqual([])
  })

  it('imports start and finish POI types as controls', () => {
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.0, lng: -81.0, poi_type_name: 'start' },
        { name: 'CONTROL - Middle', lat: 43.1, lng: -81.0, poi_type_name: 'control' },
        { name: 'CONTROL Finish A&W', lat: 43.2, lng: -81.0, poi_type_name: 'finish' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start: Waterloo', distance: '0.0' },
      { name: 'Middle', distance: '10.0' },
      { name: 'Finish A&W', distance: '20.0' },
    ])
  })

  it('prefers control-type POI over start/finish-type POI at overlapping locations', () => {
    // Matches RWGPS route 48210770 where a bare "Start: ..." POI and an
    // explicit "CONTROL Start A&W" POI both sit at the start line.
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.0, lng: -81.0, poi_type_name: 'start' },
        { name: 'CONTROL Start A&W, Waterloo', lat: 43.0, lng: -81.0, poi_type_name: 'start' },
        {
          name: 'CONTROL Finish A&W, Waterloo',
          lat: 43.2,
          lng: -81.0,
          poi_type_name: 'finish',
        },
        // A control-type POI at the very start should outrank the start-type POI
        { name: 'CONTROL Start (explicit)', lat: 43.0, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start (explicit)', distance: '0.0' },
      { name: 'Finish A&W, Waterloo', distance: '20.0' },
    ])
  })

  it('collapses same-type POIs that are physically co-located, preferring the CONTROL-prefixed name', () => {
    // Two `start` POIs representing the same parking lot but ~70 m apart
    // in raw lat/lng. These can interpolate to different track points near
    // the loop boundary, so they have to be collapsed by physical distance
    // before interpolation, not just by route distance after.
    const result = extractControls({
      track_points: [
        { x: -80.55, y: 43.5, d: 0 },
        { x: -80.55, y: 43.501, d: 200 },
        { x: -80.55, y: 43.6, d: 10_000 },
      ],
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.5, lng: -80.55, poi_type_name: 'start' },
        {
          name: 'CONTROL Start A&W, Waterloo',
          lat: 43.5006,
          lng: -80.5505,
          poi_type_name: 'start',
        },
        { name: 'CONTROL End', lat: 43.6, lng: -80.55, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start A&W, Waterloo', distance: '0.2' },
      { name: 'End', distance: '10.0' },
    ])
  })

  it('does not collapse same-type POIs that are > 200 m apart physically', () => {
    // Two legitimately separate controls at two different establishments a
    // few blocks apart must stay distinct.
    const result = extractControls({
      track_points: [
        { x: -80.55, y: 43.5, d: 0 },
        { x: -80.55, y: 43.504, d: 450 }, // ~444 m north
        { x: -80.55, y: 43.6, d: 10_000 },
      ],
      points_of_interest: [
        { name: 'CTL First Stop', lat: 43.5, lng: -80.55, poi_type_name: 'control' },
        { name: 'CTL Second Stop', lat: 43.504, lng: -80.55, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([
      { name: 'First Stop', distance: '0.0' },
      { name: 'Second Stop', distance: '0.5' },
    ])
  })

  it('does not collapse POIs of different types even when physically co-located (loop start vs finish)', () => {
    // A loop route whose start and finish sit at exactly the same address.
    // `start` and `finish` types carry different semantics — both belong on
    // the card at their respective route distances (km 0 and km 200).
    const result = extractControls({
      track_points: [
        { x: -80.55, y: 43.5, d: 0 },
        { x: -80.55, y: 43.6, d: 100_000 },
        { x: -80.55, y: 43.5, d: 200_000 },
      ],
      points_of_interest: [
        { name: 'Start A&W', lat: 43.5, lng: -80.55, poi_type_name: 'start' },
        { name: 'Finish A&W', lat: 43.5, lng: -80.55, poi_type_name: 'finish' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start A&W', distance: '0.0' },
      { name: 'Finish A&W', distance: '200.0' },
    ])
  })

  it('keeps start/finish POIs when no course-point or control POI collides', () => {
    const result = extractControls({
      track_points: trackPoints,
      course_points: [{ n: 'CTL Middle', d: 10_000, t: 'Control' }],
      points_of_interest: [
        { name: 'Start', lat: 43.0, lng: -81.0, poi_type_name: 'start' },
        { name: 'Finish', lat: 43.2, lng: -81.0, poi_type_name: 'finish' },
      ],
    })
    expect(result).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Middle', distance: '10.0' },
      { name: 'Finish', distance: '20.0' },
    ])
  })

  it('drops POIs whose nearest track point is farther than 500 m', () => {
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        // About 111 km north of the nearest track point — definitely off-route.
        { name: 'CTL Stray', lat: 44.05, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([])
  })

  it('drops POIs when track_points is missing', () => {
    const result = extractControls({
      points_of_interest: [
        { name: 'CTL Something', lat: 43.05, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([])
  })

  it('returns empty array when there are no controls in either source', () => {
    const result = extractControls({
      track_points: trackPoints,
      course_points: [{ n: 'Turn', d: 5000, t: 'Left' }],
      points_of_interest: [{ name: 'Food', lat: 43.05, lng: -81.0, poi_type_name: 'food' }],
    })
    expect(result).toEqual([])
  })

  it('handles POIs missing lat or lng gracefully', () => {
    const result = extractControls({
      track_points: trackPoints,
      points_of_interest: [
        { name: 'CTL Missing', poi_type_name: 'control' },
        { name: 'CTL Good', lat: 43.1, lng: -81.0, poi_type_name: 'control' },
      ],
    })
    expect(result).toEqual([{ name: 'Good', distance: '10.0' }])
  })
})

describe('fetchRwgpsControls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from the RWGPS JSON endpoint and returns parsed controls', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        course_points: [{ n: 'CTL Start', d: 0, t: 'Control' }],
      }),
    } as Response)

    const controls = await fetchRwgpsControls('47170397')
    expect(fetchMock).toHaveBeenCalledWith('https://ridewithgps.com/routes/47170397.json')
    expect(controls).toEqual([{ name: 'Start', distance: '0.0' }])
  })

  it('unwraps the nested `route` key when present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        route: {
          course_points: [{ n: 'CTL Finish', d: 10_000, t: 'Control' }],
        },
      }),
    } as Response)

    const controls = await fetchRwgpsControls('1')
    expect(controls).toEqual([{ name: 'Finish', distance: '10.0' }])
  })

  it('throws a user-facing error when the fetch fails', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchRwgpsControls('nope')).rejects.toThrow(/Failed to fetch route: 404 Not Found/)
  })

  it('throws when no controls are found in either source', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        course_points: [{ n: 'Turn', d: 1000, t: 'Left' }],
      }),
    } as Response)

    await expect(fetchRwgpsControls('1')).rejects.toThrow(
      /No control points found.+course points.+waypoints/
    )
  })
})

describe('parseRwgpsRouteRef', () => {
  it('extracts the ID from a full RWGPS URL', () => {
    expect(parseRwgpsRouteRef('https://ridewithgps.com/routes/47170397')).toEqual({
      id: '47170397',
      privacyCode: null,
    })
  })

  it('extracts the ID from a slugged URL', () => {
    expect(parseRwgpsRouteRef('https://ridewithgps.com/routes/47170397-toronto-loop')).toEqual({
      id: '47170397',
      privacyCode: null,
    })
  })

  it('extracts the ID from a host-less URL', () => {
    expect(parseRwgpsRouteRef('ridewithgps.com/routes/47170397')).toEqual({
      id: '47170397',
      privacyCode: null,
    })
  })

  it('accepts a bare numeric ID', () => {
    expect(parseRwgpsRouteRef('47170397')).toEqual({ id: '47170397', privacyCode: null })
  })

  it('trims surrounding whitespace', () => {
    expect(parseRwgpsRouteRef('  47170397  ')).toEqual({ id: '47170397', privacyCode: null })
    expect(parseRwgpsRouteRef('\nhttps://ridewithgps.com/routes/47170397\n')).toEqual({
      id: '47170397',
      privacyCode: null,
    })
  })

  it('returns null for unrecognized input', () => {
    expect(parseRwgpsRouteRef('https://example.com/foo/123')).toBeNull()
    expect(parseRwgpsRouteRef('not a url')).toBeNull()
    expect(parseRwgpsRouteRef('')).toBeNull()
  })

  it('extracts the ID from an http URL', () => {
    expect(parseRwgpsRouteRef('http://ridewithgps.com/routes/123')).toEqual({
      id: '123',
      privacyCode: null,
    })
  })

  it('extracts privacy_code from a share-link URL', () => {
    expect(
      parseRwgpsRouteRef(
        'https://ridewithgps.com/routes/52452431?privacy_code=9BcqBTzVxzW0Z2W02VuSiHv6gii4pBtL'
      )
    ).toEqual({
      id: '52452431',
      privacyCode: '9BcqBTzVxzW0Z2W02VuSiHv6gii4pBtL',
    })
  })

  it('extracts privacy_code when it is not the first query parameter', () => {
    expect(
      parseRwgpsRouteRef('https://ridewithgps.com/routes/52452431?foo=bar&privacy_code=ABC123')
    ).toEqual({
      id: '52452431',
      privacyCode: 'ABC123',
    })
  })

  it('returns privacyCode: null when other query params are present but no privacy_code', () => {
    expect(parseRwgpsRouteRef('https://ridewithgps.com/routes/52452431?utm_source=email')).toEqual({
      id: '52452431',
      privacyCode: null,
    })
  })
})

describe('fetchRwgpsRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns name, distanceKm, and controls from the RWGPS JSON', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Toronto Loop 200',
        distance: 203_500,
        course_points: [
          { n: 'CTL Start', d: 0, t: 'Control' },
          { n: 'CTL Finish', d: 200_000, t: 'Control' },
        ],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('47170397')
    expect(fetchMock).toHaveBeenCalledWith('https://ridewithgps.com/routes/47170397.json')
    expect(result.name).toBe('Toronto Loop 200')
    expect(result.distanceKm).toBeCloseTo(203.5, 1)
    expect(result.controls).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Finish', distance: '200.0' },
    ])
  })

  it('unwraps the nested `route` key when present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        route: {
          name: 'Brevet Draft',
          distance: 100_000,
          course_points: [{ n: 'CTL Finish', d: 100_000, t: 'Control' }],
        },
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.name).toBe('Brevet Draft')
    expect(result.distanceKm).toBeCloseTo(100, 1)
    expect(result.controls).toEqual([{ name: 'Finish', distance: '100.0' }])
  })

  it('throws a user-facing error on non-OK response', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    } as Response)

    await expect(fetchRwgpsRoute('nope')).rejects.toThrow(/Failed to fetch route: 404 Not Found/)
  })

  it('throws when no controls are present', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Empty Route',
        distance: 50_000,
        course_points: [{ n: 'Turn', d: 1000, t: 'Left' }],
      }),
    } as Response)

    await expect(fetchRwgpsRoute('1')).rejects.toThrow(/No control points found/)
  })

  it('falls back to "Untitled Route" when name is missing', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        distance: 50_000,
        course_points: [{ n: 'CTL Finish', d: 50_000, t: 'Control' }],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.name).toBe('Untitled Route')
  })

  it('returns 0 distanceKm when distance is missing', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'No Distance',
        course_points: [{ n: 'CTL Finish', d: 50_000, t: 'Control' }],
      }),
    } as Response)

    const result = await fetchRwgpsRoute('1')
    expect(result.distanceKm).toBe(0)
  })

  it('appends privacy_code query param when provided', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: 'Private Draft',
        distance: 50_000,
        course_points: [{ n: 'CTL Finish', d: 50_000, t: 'Control' }],
      }),
    } as Response)

    await fetchRwgpsRoute('1', 'ABC123')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ridewithgps.com/routes/1.json?privacy_code=ABC123'
    )
  })
})
