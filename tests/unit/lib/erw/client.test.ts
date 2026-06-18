import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ErwEventData } from '@/lib/erw/client'

vi.mock('@/lib/errors', () => ({ logError: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helper: mock a token response followed by an API response
function mockTokenThenResponse(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({
      access_token: 'test-jwt',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  })
  mockFetch.mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({})),
  })
}

// Shared test event data — ERW payloads should format name as `${name} ${distance}`
const testEvent: ErwEventData = {
  name: 'Test Brevet',
  description: 'A nice 200km brevet',
  distanceKm: 200,
  eventDate: '2026-06-15',
  startTime: '07:30',
  slug: 'huron-200',
  rwgpsId: '12345',
}

describe('ERW API Client', () => {
  beforeEach(async () => {
    vi.stubEnv('EPIC_RIDE_WEATHER_CLIENT_ID', 'test-client-id')
    vi.stubEnv('EPIC_RIDE_WEATHER_SECRET', 'test-secret')
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://randonneursontario.ca')
    mockFetch.mockReset()
    // Reset token cache and zero out publish delays for tests
    const { _resetTokenCache, PUBLISH_RETRY_DELAYS } = await import('@/lib/erw/client')
    _resetTokenCache()
    PUBLISH_RETRY_DELAYS.length = 0
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // -------------------------------------------------------------------------
  // Authentication
  // -------------------------------------------------------------------------
  describe('authentication', () => {
    it('exchanges credentials for a token on first API call', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent(testEvent)

      // First call should be the token request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://events.epicrideweather.com/api/public/v1/auth/token',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: 'grant_type=client_credentials&client_id=test-client-id&client_secret=test-secret',
        })
      )
    })

    it('reuses cached token for subsequent calls', async () => {
      // First call: token + create
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent(testEvent)

      // Second call: should reuse token, so only 1 fetch for the API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-2', canonicalUrl: 'https://erw.com/e/erw-2' }),
      })

      await createErwEvent(testEvent)

      // Total: 1 token + 1 create + 1 create = 3 fetches (NOT 2 tokens + 2 creates = 4)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  // -------------------------------------------------------------------------
  // createErwEvent
  // -------------------------------------------------------------------------
  describe('createErwEvent', () => {
    it('creates event with correct payload', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      const result = await createErwEvent(testEvent)

      expect(result).toEqual({
        success: true,
        data: {
          erwEventId: 'erw-1',
          canonicalUrl: 'https://erw.com/e/erw-1',
        },
      })

      // Verify the POST payload
      const createCall = mockFetch.mock.calls[1]
      expect(createCall[0]).toBe('https://events.epicrideweather.com/api/public/v1/events')
      const body = JSON.parse(createCall[1].body)
      expect(body).toEqual({
        name: 'Test Brevet 200',
        description: 'A nice 200km brevet',
        distance: 200,
        units: 'intl',
        date: '2026-06-15',
        published: false,
        tags: ['brevet'],
        url: 'https://register.randonneursontario.ca/register/huron-200',
        registrationUrl: 'https://register.randonneursontario.ca/register/huron-200',
        routes: [
          {
            name: 'Test Brevet 200',
            sourceRouteUrl: 'https://ridewithgps.com/routes/12345',
            startDate: '2026-06-15T07:30:00',
            averageSpeed: 5.56,
          },
        ],
      })
    })

    it('initial POST uses published:false (route import is async); publish runs separately', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent(testEvent)

      const body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(body.published).toBe(false)
    })

    it('includes sourceRouteUrl route when rwgpsId is present', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent({ ...testEvent, rwgpsId: '99999' })

      const body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(body.routes).toEqual([
        {
          name: 'Test Brevet 200',
          sourceRouteUrl: 'https://ridewithgps.com/routes/99999',
          startDate: '2026-06-15T07:30:00',
          averageSpeed: 5.56,
        },
      ])
    })

    it('appends distance to event name in payload', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent({ ...testEvent, name: 'Kissing Bridge', distanceKm: 300 })

      const body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(body.name).toBe('Kissing Bridge 300')
    })

    it('omits route when rwgpsId absent and falls back description to name when empty', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const eventNoRoute: ErwEventData = {
        name: 'Simple Brevet',
        description: '',
        distanceKm: 100,
        eventDate: '2026-07-01',
      }

      const { createErwEvent } = await import('@/lib/erw/client')
      await createErwEvent(eventNoRoute)

      const body = JSON.parse(mockFetch.mock.calls[1][1].body)
      expect(body.routes).toBeUndefined()
      expect(body.description).toBe('A 100km ride hosted by Randonneurs Ontario') // fallback
    })

    it('retries on 5xx and succeeds', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // First attempt: 502
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: 'Bad Gateway' }),
      })
      // Retry (erwFetch retries internally): success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      const result = await createErwEvent(testEvent)

      expect(result.success).toBe(true)
      expect(result.data?.erwEventId).toBe('erw-1')
    })

    it('logs error to Sentry on non-transient failure (403)', async () => {
      mockTokenThenResponse({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      const { logError } = await import('@/lib/errors')

      const result = await createErwEvent(testEvent)

      expect(result.success).toBe(false)
      expect(result.error).toContain('403')
      expect(logError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: 'erw:createEvent' })
      )
    })

    it('handles network error with retry', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // First attempt: network error
      mockFetch.mockRejectedValueOnce(new Error('fetch failed'))
      // Retry: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-1', canonicalUrl: 'https://erw.com/e/erw-1' }),
      })

      const { createErwEvent } = await import('@/lib/erw/client')
      const result = await createErwEvent(testEvent)

      expect(result.success).toBe(true)
      expect(result.data?.erwEventId).toBe('erw-1')
    })
  })

  // -------------------------------------------------------------------------
  // updateErwEvent
  // -------------------------------------------------------------------------
  describe('updateErwEvent', () => {
    it('performs GET then PUT for optimistic locking', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // GET current event
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: '2026-06-01T10:00:00Z' }),
      })
      // PUT update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      const result = await updateErwEvent('erw-123', testEvent)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        erwEventId: 'erw-123',
        canonicalUrl: 'https://erw.com/e/erw-123',
      })

      // Verify GET was called first
      const getCall = mockFetch.mock.calls[1]
      expect(getCall[0]).toBe('https://events.epicrideweather.com/api/public/v1/events/erw-123')
      expect(getCall[1].method).toBe('GET')

      // Verify PUT includes the `updated` timestamp
      const putCall = mockFetch.mock.calls[2]
      expect(putCall[1].method).toBe('PUT')
      const putBody = JSON.parse(putCall[1].body)
      expect(putBody.updated).toBe('2026-06-01T10:00:00Z')
    })

    it('sends published:true and name-with-distance in PUT payload', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // GET current event — already has a route with a routeId, so updating it in
      // place needs no re-import and the PUT can stay published.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          updated: '2026-06-01T10:00:00Z',
          published: true,
          routes: [{ routeId: 'rt-abc', sourceRouteUrl: 'https://ridewithgps.com/routes/12345' }],
        }),
      })
      // PUT update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      await updateErwEvent('erw-123', { ...testEvent, name: 'Gentle Start', distanceKm: 200 })

      const putBody = JSON.parse(mockFetch.mock.calls[2][1].body)
      expect(putBody.published).toBe(true)
      expect(putBody.name).toBe('Gentle Start 200')
    })

    it('defers publishing when a route must be re-imported (no existing routeId to carry)', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // GET returns a published event that has NO route to carry a routeId from
      // (e.g. the RWGPS route was assigned after the ERW event was created, or a
      // prior import never completed). mergeRouteIds can't supply a routeId, so
      // ERW would re-import the sourceRouteUrl — an async import that has no path
      // yet, which fails validation on a published payload.
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'erw-123',
          updated: '2026-06-01T10:00:00.000Z',
          published: true,
          routes: [],
        }),
      })
      // PUT update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      const result = await updateErwEvent('erw-123', testEvent)

      expect(result.success).toBe(true)
      const putBody = JSON.parse(mockFetch.mock.calls[2][1].body)
      // The route carries a sourceRouteUrl but no routeId, so the PUT must defer
      // publishing to avoid the "Route must have a GPX file or path" 400.
      expect(putBody.routes[0].routeId).toBeUndefined()
      expect(putBody.routes[0].sourceRouteUrl).toBe('https://ridewithgps.com/routes/12345')
      expect(putBody.published).toBe(false)
    })

    it('re-publishes the deferred draft once the route import completes', async () => {
      const { updateErwEvent, PUBLISH_RETRY_DELAYS } = await import('@/lib/erw/client')
      // Give publishErwEvent a single (immediate) retry attempt.
      PUBLISH_RETRY_DELAYS.push(0)

      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-jwt', token_type: 'Bearer', expires_in: 3600 }),
      })
      // GET (update): published event with no route to carry a routeId from
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: '2026-06-01T10:00:00.000Z', published: true, routes: [] }),
      })
      // PUT (deferred draft) succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })
      // publishErwEvent GET: import finished, route now has a routeId + path
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          updated: '2026-06-01T10:01:00.000Z',
          published: false,
          routes: [{ routeId: 'rt-new', path: 'encoded-path' }],
        }),
      })
      // publishErwEvent PUT: published:true succeeds now the route has a path
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })

      const result = await updateErwEvent('erw-123', testEvent)

      expect(result.success).toBe(true)
      // Draft PUT first...
      expect(JSON.parse(mockFetch.mock.calls[2][1].body).published).toBe(false)
      // ...then a follow-up publish PUT flips it back to published.
      const publishPut = mockFetch.mock.calls[4]
      expect(publishPut[1].method).toBe('PUT')
      expect(JSON.parse(publishPut[1].body).published).toBe(true)
    })

    it('carries the existing routeId into the PUT payload to update the route in place', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // GET returns an existing event with a route that has a routeId (imported from RWGPS)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'erw-123',
          updated: '2026-06-01T10:00:00.123Z',
          published: true,
          routes: [
            {
              routeId: 'rt-abc',
              name: 'Test Brevet 200',
              sourceRouteUrl: 'https://ridewithgps.com/routes/12345',
              startDate: '2026-06-15T07:30:00',
              averageSpeed: 5.56,
            },
          ],
        }),
      })
      // PUT update
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      await updateErwEvent('erw-123', testEvent)

      const putBody = JSON.parse(mockFetch.mock.calls[2][1].body)
      // Route must carry over the existing routeId so ERW updates it in place,
      // rather than deleting + re-creating (which fails validation on published events).
      expect(putBody.routes).toHaveLength(1)
      expect(putBody.routes[0].routeId).toBe('rt-abc')
    })

    it('does not duplicate the distance when event name already ends with it', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // GET
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: '2026-06-01T10:00:00.123Z', published: true }),
      })
      // PUT
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      // DB names carry " {distance}" after the bulk-rename script, so the builder
      // must not re-append it and produce "Gentle Start 200 200".
      await updateErwEvent('erw-123', {
        ...testEvent,
        name: 'Gentle Start 200',
        distanceKm: 200,
      })

      const putBody = JSON.parse(mockFetch.mock.calls[2][1].body)
      expect(putBody.name).toBe('Gentle Start 200')
      expect(putBody.routes[0].name).toBe('Gentle Start 200')
    })

    it('retries on 409 conflict with fresh GET', async () => {
      // Token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'test-jwt',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // Initial GET
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: '2026-06-01T10:00:00.000Z' }),
      })
      // PUT returns 409 conflict
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Conflict' }),
      })
      // Fresh GET after conflict
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ updated: '2026-06-01T10:05:00.000Z' }),
      })
      // Retry PUT succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'erw-123', canonicalUrl: 'https://erw.com/e/erw-123' }),
      })

      const { updateErwEvent } = await import('@/lib/erw/client')
      const result = await updateErwEvent('erw-123', testEvent)

      expect(result.success).toBe(true)
      expect(result.data).toEqual({
        erwEventId: 'erw-123',
        canonicalUrl: 'https://erw.com/e/erw-123',
      })

      // Verify the retry PUT used the fresh timestamp
      const retryPutCall = mockFetch.mock.calls[4]
      const retryBody = JSON.parse(retryPutCall[1].body)
      expect(retryBody.updated).toBe('2026-06-01T10:05:00.000Z')
    })
  })

  // -------------------------------------------------------------------------
  // deleteErwEvent
  // -------------------------------------------------------------------------
  describe('deleteErwEvent', () => {
    it('deletes successfully', async () => {
      mockTokenThenResponse({
        ok: true,
        status: 204,
        json: async () => undefined,
      })

      const { deleteErwEvent } = await import('@/lib/erw/client')
      const result = await deleteErwEvent('erw-456')

      expect(result.success).toBe(true)

      const deleteCall = mockFetch.mock.calls[1]
      expect(deleteCall[0]).toBe('https://events.epicrideweather.com/api/public/v1/events/erw-456')
      expect(deleteCall[1].method).toBe('DELETE')
    })

    it('treats 404 as success (already deleted)', async () => {
      mockTokenThenResponse({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found' }),
      })

      const { deleteErwEvent } = await import('@/lib/erw/client')
      const result = await deleteErwEvent('erw-gone')

      expect(result.success).toBe(true)
    })
  })
})
