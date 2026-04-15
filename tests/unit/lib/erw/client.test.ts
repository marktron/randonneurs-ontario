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

// Shared test event data
const testEvent: ErwEventData = {
  name: 'Test Brevet 200',
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
    // Reset token cache to prevent test interdependence
    const { _resetTokenCache } = await import('@/lib/erw/client')
    _resetTokenCache()
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
          body: JSON.stringify({
            grant_type: 'client_credentials',
            client_id: 'test-client-id',
            client_secret: 'test-secret',
          }),
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
        published: true,
        tags: ['brevet'],
        url: 'https://randonneursontario.ca/register/huron-200',
        registrationUrl: 'https://randonneursontario.ca/register/huron-200',
        routes: [
          {
            name: 'Test Brevet 200',
            sourceRouteUrl: 'https://ridewithgps.com/routes/12345',
            startDate: '2026-06-15T07:30:00',
          },
        ],
      })
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
        },
      ])
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
        json: async () => ({ updated: '2026-06-01T10:00:00Z' }),
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
        json: async () => ({ updated: '2026-06-01T10:05:00Z' }),
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
      expect(retryBody.updated).toBe('2026-06-01T10:05:00Z')
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
