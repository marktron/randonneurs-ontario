/**
 * Epic Ride Weather (ERW) API Client
 *
 * Creates, updates, and deletes weather events on Epic Ride Weather
 * so riders can see forecasts for upcoming brevets.
 *
 * @see https://events.epicrideweather.com/api/public/v1
 */

import { logError } from '@/lib/errors'

const ERW_BASE_URL = 'https://events.epicrideweather.com/api/public/v1'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErwEventData {
  name: string
  description: string
  distanceKm: number
  eventDate: string // YYYY-MM-DD
  startTime?: string | null
  slug?: string
  rwgpsId?: string | null
}

export interface ErwResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

export interface ErwCreateResult {
  erwEventId: string
  canonicalUrl: string
}

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

interface TokenCache {
  token: string
  expiresAt: number // epoch ms
}

let cachedToken: TokenCache | null = null

/** Reset the token cache — exported for tests only. */
export function _resetTokenCache(): void {
  cachedToken = null
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

async function getAccessToken(): Promise<string> {
  // Reuse cached token if it has > 5 min remaining
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token
  }

  const clientId = process.env.EPIC_RIDE_WEATHER_CLIENT_ID
  const secret = process.env.EPIC_RIDE_WEATHER_SECRET
  if (!clientId || !secret) {
    throw new Error(
      'ERW credentials not configured: EPIC_RIDE_WEATHER_CLIENT_ID and EPIC_RIDE_WEATHER_SECRET required'
    )
  }

  const response = await fetch(`${ERW_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
    }),
  })

  if (!response.ok) {
    throw new Error(`ERW auth failed: ${response.status}`)
  }

  const data = await response.json()
  const expiresIn = (data.expires_in as number) || 3600

  cachedToken = {
    token: data.access_token as string,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return cachedToken.token
}

// ---------------------------------------------------------------------------
// Fetch wrapper with auth + retry
// ---------------------------------------------------------------------------

function isTransientError(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

interface ErwFetchOptions {
  method: string
  path: string
  body?: unknown
  /** Whether this is already a retry (prevents infinite loops) */
  isRetry?: boolean
}

async function erwFetch<T>(
  options: ErwFetchOptions
): Promise<{ ok: boolean; status: number; data?: T }> {
  const { method, path, body, isRetry } = options

  let token: string
  try {
    token = await getAccessToken()
  } catch (error) {
    throw error
  }

  const url = `${ERW_BASE_URL}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  } catch (error) {
    // Network error — retry once
    if (!isRetry) {
      return erwFetch({ ...options, isRetry: true })
    }
    throw error
  }

  // On 401 clear cached token and retry with fresh token
  if (response.status === 401 && !isRetry) {
    cachedToken = null
    return erwFetch({ ...options, isRetry: true })
  }

  // Retry on transient (5xx) errors
  if (isTransientError(response.status) && !isRetry) {
    return erwFetch({ ...options, isRetry: true })
  }

  const responseData =
    response.status !== 204
      ? ((await response.json().catch(() => undefined)) as T | undefined)
      : undefined

  return { ok: response.ok, status: response.status, data: responseData }
}

// ---------------------------------------------------------------------------
// Payload building
// ---------------------------------------------------------------------------

function buildErwPayload(event: ErwEventData): Record<string, unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://randonneursontario.ca'

  const payload: Record<string, unknown> = {
    name: event.name,
    description: event.description || event.name,
    distance: event.distanceKm,
    units: 'intl',
    date: event.eventDate,
    published: true,
    tags: ['brevet'],
  }

  if (event.slug) {
    payload.url = `${baseUrl}/register/${event.slug}`
    payload.registrationUrl = `${baseUrl}/register/${event.slug}`
  }

  if (event.rwgpsId) {
    const startTime = event.startTime || '08:00'
    payload.routes = [
      {
        name: event.name,
        sourceRouteUrl: `https://ridewithgps.com/routes/${event.rwgpsId}`,
        startDate: `${event.eventDate}T${startTime}:00`,
      },
    ]
  }

  return payload
}

// ---------------------------------------------------------------------------
// CRUD functions
// ---------------------------------------------------------------------------

export async function createErwEvent(event: ErwEventData): Promise<ErwResult<ErwCreateResult>> {
  try {
    const payload = buildErwPayload(event)
    const result = await erwFetch<{ id: string; canonicalUrl: string }>({
      method: 'POST',
      path: '/events',
      body: payload,
    })

    if (!result.ok) {
      const message = `ERW create event failed: ${result.status}`
      logError(new Error(message), {
        operation: 'erw:createEvent',
        context: { status: result.status, eventName: event.name },
      })
      return { success: false, error: message }
    }

    const data = result.data
    if (!data?.id || !data?.canonicalUrl) {
      return { success: false, error: 'ERW returned incomplete data' }
    }

    return {
      success: true,
      data: {
        erwEventId: data.id,
        canonicalUrl: data.canonicalUrl,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(error, {
      operation: 'erw:createEvent',
      context: { eventName: event.name },
    })
    return { success: false, error: message }
  }
}

export async function updateErwEvent(
  erwEventId: string,
  event: ErwEventData
): Promise<ErwResult<ErwCreateResult>> {
  try {
    // GET current event to obtain the `updated` timestamp for optimistic locking
    const getResult = await erwFetch<{ updated: string }>({
      method: 'GET',
      path: `/events/${erwEventId}`,
    })

    if (!getResult.ok) {
      const message = `ERW get event failed: ${getResult.status}`
      logError(new Error(message), {
        operation: 'erw:updateEvent',
        context: { erwEventId, status: getResult.status },
      })
      return { success: false, error: message }
    }

    const getResultData = getResult.data
    if (!getResultData?.updated) {
      return { success: false, error: 'ERW returned incomplete data' }
    }

    const payload = {
      ...buildErwPayload(event),
      updated: getResultData.updated,
    }

    const putResult = await erwFetch<{ id: string; canonicalUrl: string }>({
      method: 'PUT',
      path: `/events/${erwEventId}`,
      body: payload,
    })

    // On 409 conflict, retry once with a fresh GET
    if (putResult.status === 409) {
      const freshGet = await erwFetch<{ updated: string }>({
        method: 'GET',
        path: `/events/${erwEventId}`,
      })
      if (!freshGet.ok) {
        const message = `ERW get event failed on conflict retry: ${freshGet.status}`
        logError(new Error(message), {
          operation: 'erw:updateEvent',
          context: { erwEventId, status: freshGet.status },
        })
        return { success: false, error: message }
      }

      const freshGetData = freshGet.data
      if (!freshGetData?.updated) {
        return { success: false, error: 'ERW returned incomplete data' }
      }

      const retryPayload = {
        ...buildErwPayload(event),
        updated: freshGetData.updated,
      }

      const retryPut = await erwFetch<{ id: string; canonicalUrl: string }>({
        method: 'PUT',
        path: `/events/${erwEventId}`,
        body: retryPayload,
      })

      if (!retryPut.ok) {
        const message = `ERW update event failed after conflict retry: ${retryPut.status}`
        logError(new Error(message), {
          operation: 'erw:updateEvent',
          context: { erwEventId, status: retryPut.status },
        })
        return { success: false, error: message }
      }

      const retryPutData = retryPut.data
      if (!retryPutData?.id || !retryPutData?.canonicalUrl) {
        return { success: false, error: 'ERW returned incomplete data' }
      }

      return {
        success: true,
        data: {
          erwEventId: retryPutData.id,
          canonicalUrl: retryPutData.canonicalUrl,
        },
      }
    }

    if (!putResult.ok) {
      const message = `ERW update event failed: ${putResult.status}`
      logError(new Error(message), {
        operation: 'erw:updateEvent',
        context: { erwEventId, status: putResult.status },
      })
      return { success: false, error: message }
    }

    const putResultData = putResult.data
    if (!putResultData?.id || !putResultData?.canonicalUrl) {
      return { success: false, error: 'ERW returned incomplete data' }
    }

    return {
      success: true,
      data: {
        erwEventId: putResultData.id,
        canonicalUrl: putResultData.canonicalUrl,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(error, {
      operation: 'erw:updateEvent',
      context: { erwEventId },
    })
    return { success: false, error: message }
  }
}

export async function deleteErwEvent(erwEventId: string): Promise<ErwResult> {
  try {
    const result = await erwFetch({
      method: 'DELETE',
      path: `/events/${erwEventId}`,
    })

    // Treat 404 as success — event is already gone
    if (result.status === 404) {
      return { success: true }
    }

    if (!result.ok) {
      const message = `ERW delete event failed: ${result.status}`
      logError(new Error(message), {
        operation: 'erw:deleteEvent',
        context: { erwEventId, status: result.status },
      })
      return { success: false, error: message }
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(error, {
      operation: 'erw:deleteEvent',
      context: { erwEventId },
    })
    return { success: false, error: message }
  }
}
