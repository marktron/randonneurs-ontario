import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  buildRwgpsCollectionUrl,
  cleanControlName,
  extractControls,
  extractControlsWithCoords,
  extractRwgpsRefs,
  fetchRwgpsCollection,
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

  it('extracts controls from points_of_interest using the POI `distances` array', () => {
    const result = extractControls({
      points_of_interest: [
        {
          name: "CTL Tim Horton's, Ilderton",
          lat: 43.05,
          lng: -81.0,
          type: 'control',
          distances: [5000],
        },
        { name: 'Foodland', lat: 43.1, lng: -81.0, type: 'food', distances: [10_000] },
        { name: 'CTL Finish', lat: 43.2, lng: -81.0, type: 'control', distances: [20_000] },
      ],
    })
    expect(result).toEqual([
      { name: "Tim Horton's, Ilderton", distance: '5.0' },
      { name: 'Finish', distance: '20.0' },
    ])
  })

  it('merges course_points and points_of_interest when they do not overlap', () => {
    const result = extractControls({
      course_points: [{ n: 'CTL Start', d: 0, t: 'Control' }],
      points_of_interest: [
        { name: 'CTL Middle', lat: 43.1, lng: -81.0, type: 'control', distances: [10_000] },
      ],
    })
    expect(result).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Middle', distance: '10.0' },
    ])
  })

  it('dedupes overlapping controls and prefers the POI entry over the course-point', () => {
    const result = extractControls({
      course_points: [{ n: 'Coursename Halfway', d: 10_050, t: 'Control' }],
      points_of_interest: [
        // 50 m away along the route from the course point.
        { name: 'CTL POI Halfway', lat: 43.1, lng: -81.0, type: 'control', distances: [10_000] },
      ],
    })
    expect(result).toEqual([{ name: 'POI Halfway', distance: '10.0' }])
  })

  it('keeps both when the same source has controls > 100 m apart', () => {
    const result = extractControls({
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
      points_of_interest: [
        { name: 'Rest stop', lat: 43.05, lng: -81.0, type: 'food', distances: [5000] },
        { name: 'Parking', lat: 43.1, lng: -81.0, type: 'parking', distances: [10_000] },
        { name: 'Nice view', lat: 43.15, lng: -81.0, type: 'viewpoint', distances: [15_000] },
      ],
    })
    expect(result).toEqual([])
  })

  it('imports start and finish POI types as controls', () => {
    const result = extractControls({
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.0, lng: -81.0, type: 'start', distances: [0] },
        { name: 'CONTROL - Middle', lat: 43.1, lng: -81.0, type: 'control', distances: [10_000] },
        { name: 'CONTROL Finish A&W', lat: 43.2, lng: -81.0, type: 'finish', distances: [20_000] },
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
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.0, lng: -81.0, type: 'start', distances: [0] },
        {
          name: 'CONTROL Start A&W, Waterloo',
          lat: 43.0,
          lng: -81.0,
          type: 'start',
          distances: [0],
        },
        {
          name: 'CONTROL Finish A&W, Waterloo',
          lat: 43.2,
          lng: -81.0,
          type: 'finish',
          distances: [20_000],
        },
        // A control-type POI at the very start should outrank the start-type POI
        {
          name: 'CONTROL Start (explicit)',
          lat: 43.0,
          lng: -81.0,
          type: 'control',
          distances: [0],
        },
      ],
    })
    expect(result).toEqual([
      { name: 'Start (explicit)', distance: '0.0' },
      { name: 'Finish A&W, Waterloo', distance: '20.0' },
    ])
  })

  it('collapses same-type POIs that are physically co-located, preferring the CONTROL-prefixed name', () => {
    // Two `start` POIs representing the same parking lot but ~70 m apart in
    // raw lat/lng, with slightly different distances along the route. They
    // are collapsed by physical distance, so only the CONTROL-prefixed one
    // (and its own distance) survives.
    const result = extractControls({
      points_of_interest: [
        { name: 'Start: Waterloo', lat: 43.5, lng: -80.55, type: 'start', distances: [0] },
        {
          name: 'CONTROL Start A&W, Waterloo',
          lat: 43.5006,
          lng: -80.5505,
          type: 'start',
          distances: [200],
        },
        { name: 'CONTROL End', lat: 43.6, lng: -80.55, type: 'control', distances: [10_000] },
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
      points_of_interest: [
        { name: 'CTL First Stop', lat: 43.5, lng: -80.55, type: 'control', distances: [0] },
        // ~444 m north, and 450 m further along the route.
        { name: 'CTL Second Stop', lat: 43.504, lng: -80.55, type: 'control', distances: [450] },
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
      points_of_interest: [
        { name: 'Start A&W', lat: 43.5, lng: -80.55, type: 'start', distances: [0, 200_000] },
        { name: 'Finish A&W', lat: 43.5, lng: -80.55, type: 'finish', distances: [0, 200_000] },
      ],
    })
    expect(result).toEqual([
      { name: 'Start A&W', distance: '0.0' },
      { name: 'Finish A&W', distance: '200.0' },
    ])
  })

  it('keeps start/finish POIs when no course-point or control POI collides', () => {
    const result = extractControls({
      course_points: [{ n: 'CTL Middle', d: 10_000, t: 'Control' }],
      points_of_interest: [
        { name: 'Start', lat: 43.0, lng: -81.0, type: 'start', distances: [0] },
        { name: 'Finish', lat: 43.2, lng: -81.0, type: 'finish', distances: [20_000] },
      ],
    })
    expect(result).toEqual([
      { name: 'Start', distance: '0.0' },
      { name: 'Middle', distance: '10.0' },
      { name: 'Finish', distance: '20.0' },
    ])
  })

  it('drops POIs whose distances array is empty (off-route or unplaceable)', () => {
    const result = extractControls({
      points_of_interest: [
        { name: 'CTL Stray', lat: 44.05, lng: -81.0, type: 'control', distances: [] },
      ],
    })
    expect(result).toEqual([])
  })

  it('drops POIs with no distances field at all', () => {
    const result = extractControls({
      points_of_interest: [{ name: 'CTL Something', lat: 43.05, lng: -81.0, type: 'control' }],
    })
    expect(result).toEqual([])
  })

  it('returns empty array when there are no controls in either source', () => {
    const result = extractControls({
      course_points: [{ n: 'Turn', d: 5000, t: 'Left' }],
      points_of_interest: [
        { name: 'Food', lat: 43.05, lng: -81.0, type: 'food', distances: [5000] },
      ],
    })
    expect(result).toEqual([])
  })

  it('emits one control per distance when a control POI is passed twice (out-and-back)', () => {
    const result = extractControls({
      points_of_interest: [
        {
          name: 'CTL Midpoint',
          lat: 43.05,
          lng: -81.0,
          type: 'control',
          distances: [5000, 15_000],
        },
      ],
    })
    expect(result).toEqual([
      { name: 'Midpoint', distance: '5.0' },
      { name: 'Midpoint', distance: '15.0' },
    ])
  })

  it('emits every pass of a hub control (RWGPS route 53737237, Waffle 1200)', () => {
    // The Waffle 1200 is a four-petal cloverleaf from Chatham; RWGPS reports
    // all five visits in the POI's `distances` array.
    const result = extractControls({
      points_of_interest: [
        {
          name: 'Chatham',
          lat: 42.37963,
          lng: -82.21737,
          type: 'control',
          distances: [0, 355_812.8, 714_587.1, 1_009_806.9, 1_214_016.7],
        },
        { name: 'CTL Sarnia', lat: 42.97, lng: -82.4, type: 'control', distances: [460_406.4] },
      ],
    })
    expect(result).toEqual([
      { name: 'Chatham', distance: '0.0' },
      { name: 'Chatham', distance: '355.8' },
      { name: 'Sarnia', distance: '460.4' },
      { name: 'Chatham', distance: '714.6' },
      { name: 'Chatham', distance: '1009.8' },
      { name: 'Chatham', distance: '1214.0' },
    ])
  })

  it('keeps a start POI only at its first distance and a finish POI only at its last', () => {
    // Hub route whose POIs are typed start/finish: a start label at a
    // location revisited mid-ride must not spawn mid-ride controls.
    const hubDistances = [0, 20_000, 40_000]
    const result = extractControls({
      points_of_interest: [
        { name: 'Start: Hub', lat: 43.0, lng: -81.0, type: 'start', distances: hubDistances },
        { name: 'Finish: Hub', lat: 43.0, lng: -81.0, type: 'finish', distances: hubDistances },
      ],
    })
    expect(result).toEqual([
      { name: 'Start: Hub', distance: '0.0' },
      { name: 'Finish: Hub', distance: '40.0' },
    ])
  })

  it('sorts distances before emitting controls', () => {
    const result = extractControls({
      points_of_interest: [
        {
          name: 'CTL Unsorted',
          lat: 43.05,
          lng: -81.0,
          type: 'control',
          distances: [15_000, 5000],
        },
        { name: 'Finish: Hub', lat: 43.0, lng: -81.0, type: 'finish', distances: [40_000, 0] },
      ],
    })
    expect(result).toEqual([
      { name: 'Unsorted', distance: '5.0' },
      { name: 'Unsorted', distance: '15.0' },
      { name: 'Finish: Hub', distance: '40.0' },
    ])
  })

  it('handles POIs missing lat or lng gracefully', () => {
    const result = extractControls({
      points_of_interest: [
        { name: 'CTL Missing', type: 'control', distances: [5000] },
        { name: 'CTL Good', lat: 43.1, lng: -81.0, type: 'control', distances: [10_000] },
      ],
    })
    expect(result).toEqual([{ name: 'Good', distance: '10.0' }])
  })

  it('interpolates course-point coordinates from track_points when x/y are absent', () => {
    const result = extractControlsWithCoords({
      track_points: trackPoints,
      course_points: [{ n: 'CTL Halfway', d: 10_000, t: 'Control' }],
    })
    expect(result).toEqual([
      { name: 'Halfway', distance: '10.0', lat: 43.1, lng: -81.0, notes: null },
    ])
  })
})

describe('extractControlsWithCoords notes', () => {
  it("carries a control POI's description into notes", () => {
    const result = extractControlsWithCoords({
      points_of_interest: [
        {
          name: 'CTL Tim Hortons',
          lat: 43.05,
          lng: -81.0,
          type: 'control',
          distances: [5000],
          description: 'Get your card signed at the counter.',
        },
      ],
    })
    expect(result).toEqual([
      {
        name: 'Tim Hortons',
        distance: '5.0',
        lat: 43.05,
        lng: -81.0,
        notes: 'Get your card signed at the counter.',
      },
    ])
  })

  it('trims description whitespace and treats an empty description as null notes', () => {
    const result = extractControlsWithCoords({
      points_of_interest: [
        {
          name: 'CTL Trimmed',
          lat: 43.05,
          lng: -81.0,
          type: 'control',
          distances: [5000],
          description: '  spaced out  ',
        },
        {
          name: 'CTL Blank',
          lat: 43.1,
          lng: -81.0,
          type: 'control',
          distances: [10_000],
          description: '   ',
        },
      ],
    })
    expect(result).toEqual([
      { name: 'Trimmed', distance: '5.0', lat: 43.05, lng: -81.0, notes: 'spaced out' },
      { name: 'Blank', distance: '10.0', lat: 43.1, lng: -81.0, notes: null },
    ])
  })

  it('sets notes to null for course-point controls (no description field)', () => {
    const result = extractControlsWithCoords({
      course_points: [{ n: 'CTL Start', d: 0, t: 'Control' }],
    })
    expect(result).toEqual([{ name: 'Start', distance: '0.0', lat: null, lng: null, notes: null }])
  })
})

describe('fetchRwgpsControls', () => {
  beforeEach(() => {
    vi.stubEnv('RWGPS_API_KEY', 'test-key')
    vi.stubEnv('RWGPS_AUTH_TOKEN', 'test-token')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('fetches from the authenticated v1 API and returns parsed controls', async () => {
    const fetchMock = vi.mocked(global.fetch)
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        course_points: [{ n: 'CTL Start', d: 0, t: 'Control' }],
      }),
    } as Response)

    const controls = await fetchRwgpsControls('47170397')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ridewithgps.com/api/v1/routes/47170397.json',
      expect.objectContaining({
        headers: { 'x-rwgps-api-key': 'test-key', 'x-rwgps-auth-token': 'test-token' },
      })
    )
    expect(controls).toEqual([{ name: 'Start', distance: '0.0' }])
  })

  it('throws a user-facing error when the API credentials are missing', async () => {
    vi.stubEnv('RWGPS_API_KEY', '')
    const fetchMock = vi.mocked(global.fetch)

    await expect(fetchRwgpsControls('1')).rejects.toThrow(/RideWithGPS API .*not configured/i)
    expect(fetchMock).not.toHaveBeenCalled()
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
    vi.stubEnv('RWGPS_API_KEY', 'test-key')
    vi.stubEnv('RWGPS_AUTH_TOKEN', 'test-token')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
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
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ridewithgps.com/api/v1/routes/47170397.json',
      expect.objectContaining({
        headers: { 'x-rwgps-api-key': 'test-key', 'x-rwgps-auth-token': 'test-token' },
      })
    )
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
      'https://ridewithgps.com/api/v1/routes/1.json?privacy_code=ABC123',
      expect.objectContaining({
        headers: { 'x-rwgps-api-key': 'test-key', 'x-rwgps-auth-token': 'test-token' },
      })
    )
  })

  it('throws a user-facing error when the API credentials are missing', async () => {
    vi.stubEnv('RWGPS_AUTH_TOKEN', '')
    const fetchMock = vi.mocked(global.fetch)

    await expect(fetchRwgpsRoute('1')).rejects.toThrow(/RideWithGPS API .*not configured/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('extractRwgpsRefs', () => {
  it('extracts a route id from a route URL', () => {
    expect(extractRwgpsRefs('https://ridewithgps.com/routes/12345678')).toEqual({
      rwgpsId: '12345678',
      rwgpsCollectionId: null,
    })
  })

  it('extracts a collection id from a collection URL', () => {
    expect(extractRwgpsRefs('https://ridewithgps.com/collections/8387874')).toEqual({
      rwgpsId: null,
      rwgpsCollectionId: '8387874',
    })
  })

  it('handles collection URLs with query strings and trailing paths', () => {
    expect(extractRwgpsRefs('https://ridewithgps.com/collections/8387874?lang=en')).toEqual({
      rwgpsId: null,
      rwgpsCollectionId: '8387874',
    })
    expect(extractRwgpsRefs('https://ridewithgps.com/collections/8387874/some-slug')).toEqual({
      rwgpsId: null,
      rwgpsCollectionId: '8387874',
    })
  })

  it('treats a bare numeric id as a route id', () => {
    expect(extractRwgpsRefs('12345678')).toEqual({
      rwgpsId: '12345678',
      rwgpsCollectionId: null,
    })
  })

  it('extracts route ids from ambassador_routes and trips URLs', () => {
    expect(extractRwgpsRefs('https://ridewithgps.com/ambassador_routes/111')).toEqual({
      rwgpsId: '111',
      rwgpsCollectionId: null,
    })
    expect(extractRwgpsRefs('https://ridewithgps.com/trips/222')).toEqual({
      rwgpsId: '222',
      rwgpsCollectionId: null,
    })
  })

  it('handles route URLs with privacy codes', () => {
    expect(extractRwgpsRefs('https://ridewithgps.com/routes/12345678?privacy_code=abc')).toEqual({
      rwgpsId: '12345678',
      rwgpsCollectionId: null,
    })
  })

  it('returns both null for empty/blank input', () => {
    expect(extractRwgpsRefs(null)).toEqual({ rwgpsId: null, rwgpsCollectionId: null })
    expect(extractRwgpsRefs(undefined)).toEqual({ rwgpsId: null, rwgpsCollectionId: null })
    expect(extractRwgpsRefs('   ')).toEqual({ rwgpsId: null, rwgpsCollectionId: null })
  })

  it('falls back to the trimmed input as a route id for unrecognized non-empty input', () => {
    // Preserves the legacy lenient behavior of the admin form field.
    expect(extractRwgpsRefs(' some-weird-value ')).toEqual({
      rwgpsId: 'some-weird-value',
      rwgpsCollectionId: null,
    })
  })
})

describe('fetchRwgpsCollection', () => {
  const collectionBody = {
    collection: {
      id: 8387874,
      name: 'Cottage Country Explorer 2000',
      html_url: 'https://ridewithgps.com/collections/8387874',
      routes: [
        {
          id: 53678831,
          name: 'Leg 3: CCE 200 - Gravenhurst',
          distance: 199528,
          elevation_gain: 1964,
          html_url: 'https://ridewithgps.com/routes/53678831',
        },
        {
          id: 56239318,
          name: 'Leg 1: CCE 300 - Port Loring',
          distance: 314000,
          elevation_gain: 3000,
          html_url: 'https://ridewithgps.com/routes/56239318',
        },
        {
          id: 56271316,
          name: 'CCE 2000',
          distance: 2019000,
          elevation_gain: 20000,
          html_url: 'https://ridewithgps.com/routes/56271316',
        },
        {
          id: 56239304,
          name: 'Leg 2: CCE 500 - Lake Simcoe',
          distance: 496000,
          elevation_gain: 5000,
          html_url: 'https://ridewithgps.com/routes/56239304',
        },
      ],
    },
  }

  beforeEach(() => {
    vi.stubEnv('RWGPS_API_KEY', 'test-key')
    vi.stubEnv('RWGPS_AUTH_TOKEN', 'test-token')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('fetches, maps, and natural-sorts member routes by name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => collectionBody,
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRwgpsCollection('8387874')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://ridewithgps.com/api/v1/collections/8387874.json',
      expect.objectContaining({
        headers: { 'x-rwgps-api-key': 'test-key', 'x-rwgps-auth-token': 'test-token' },
        next: { revalidate: 3600 },
      })
    )
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Cottage Country Explorer 2000')
    expect(result!.htmlUrl).toBe('https://ridewithgps.com/collections/8387874')
    expect(result!.routes.map((r) => r.name)).toEqual([
      'CCE 2000',
      'Leg 1: CCE 300 - Port Loring',
      'Leg 2: CCE 500 - Lake Simcoe',
      'Leg 3: CCE 200 - Gravenhurst',
    ])
    expect(result!.routes[3]).toEqual({
      id: 53678831,
      name: 'Leg 3: CCE 200 - Gravenhurst',
      distanceKm: 199.528,
      elevationGain: 1964,
      htmlUrl: 'https://ridewithgps.com/routes/53678831',
    })
  })

  it('returns null when credentials are missing', async () => {
    vi.stubEnv('RWGPS_API_KEY', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchRwgpsCollection('8387874')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when the auth token is missing but the key is present', async () => {
    vi.stubEnv('RWGPS_AUTH_TOKEN', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchRwgpsCollection('8387874')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null on a non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' })
    )
    expect(await fetchRwgpsCollection('8387874')).toBeNull()
  })

  it('returns null when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await fetchRwgpsCollection('8387874')).toBeNull()
  })

  it('returns null on malformed body or zero member routes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    expect(await fetchRwgpsCollection('8387874')).toBeNull()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ collection: { name: 'Empty', routes: [] } }),
      })
    )
    expect(await fetchRwgpsCollection('8387874')).toBeNull()
  })
})

describe('buildRwgpsCollectionUrl', () => {
  it('builds the collection page URL', () => {
    expect(buildRwgpsCollectionUrl('8387874')).toBe('https://ridewithgps.com/collections/8387874')
  })
})
