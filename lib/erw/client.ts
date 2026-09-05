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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: secret,
    }).toString(),
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

function routeStartDate(event: ErwEventData): string {
  // startTime is HH:MM — append :00 for seconds only if needed
  const startTime = event.startTime || '08:00'
  const timeWithSeconds = startTime.split(':').length === 2 ? `${startTime}:00` : startTime
  return `${event.eventDate}T${timeWithSeconds}`
}

function buildErwPayload(event: ErwEventData): Record<string, unknown> {
  // Always use production URL — ERW events should link to the live site, not localhost
  const baseUrl = 'https://www.randonneursontario.ca'

  // Ensure the name ends with the distance (e.g. "Gentle Start 200") without
  // duplicating it. The Apr-2026 bulk-rename script already appended distance
  // to DB names for every synced event, so naive concatenation produces
  // "Gentle Start 200 200" and can push the route name past its 50-char cap.
  const trimmedName = event.name.trim()
  const distanceSuffix = ` ${event.distanceKm}`
  const erwName = trimmedName.endsWith(distanceSuffix)
    ? trimmedName
    : `${trimmedName}${distanceSuffix}`

  const payload: Record<string, unknown> = {
    name: erwName,
    description: (
      event.description || `A ${event.distanceKm}km ride hosted by Randonneurs Ontario`
    ).slice(0, 2000),
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
    payload.routes = [
      {
        name: erwName,
        sourceRouteUrl: `https://ridewithgps.com/routes/${event.rwgpsId}`,
        startDate: routeStartDate(event),
        averageSpeed: 5.56, // 20 km/h in m/s
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
    // Initial POST is published:false — RWGPS route import is async on ERW's side,
    // so publishErwEvent below retries with delays until the import completes.
    const payload: Record<string, unknown> = { ...buildErwPayload(event), published: false }
    const result = await erwFetch<{ id: string; canonicalUrl: string }>({
      method: 'POST',
      path: '/events',
      body: payload,
    })

    if (!result.ok) {
      const erwError = result.data as { message?: string } | undefined
      const detail = erwError?.message || `HTTP ${result.status}`
      logError(new Error(`ERW create event failed: ${detail}`), {
        operation: 'erw:createEvent',
        context: { status: result.status, eventName: event.name, response: result.data },
      })
      return { success: false, error: `Epic Ride Weather: ${detail}` }
    }

    const data = result.data
    if (!data?.id || !data?.canonicalUrl) {
      return { success: false, error: 'ERW returned incomplete data' }
    }

    // Attempt to publish after route import completes. A routeless event can
    // never satisfy ERW's publish validation, so don't burn the retry loop on it.
    if (payload.routes !== undefined) {
      await publishErwEvent(data.id)
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

type ErwExistingEvent = {
  updated?: string
  routes?: Array<Record<string, unknown>>
}

type ErwErrorBody = {
  message?: string
  errors?: Record<string, unknown>
}

function formatErwError(status: number, data: unknown): string {
  const body = data as ErwErrorBody | undefined
  if (body?.errors && Object.keys(body.errors).length > 0) {
    return `${body.message || 'Validation failed'}: ${JSON.stringify(body.errors)}`
  }
  return body?.message || `HTTP ${status}`
}

// Carry the existing routeId onto each incoming route so ERW updates routes in
// place. Sending a route without a routeId tells ERW to delete the existing
// route and re-create it — which triggers a sourceRouteUrl re-import and fails
// validation on published events whose old routes already have path data.
function mergeRouteIds(
  incoming: unknown,
  existing: Array<Record<string, unknown>> | undefined
): unknown {
  if (!Array.isArray(incoming)) return incoming
  return incoming.map((route, i) => {
    const existingRouteId = existing?.[i]?.routeId
    return existingRouteId && typeof route === 'object' && route !== null
      ? { ...route, routeId: existingRouteId }
      : route
  })
}

// A PUT replaces the event's whole routes collection, so omitting `routes`
// clears them on ERW — and a published event with no routes is rejected with
// "Published events must have at least one route." buildErwPayload only emits a
// route when the event has an RWGPS id, so an event whose route link was
// cleared (or whose route has no rwgps_id) must carry ERW's existing routes
// forward, with the start date refreshed to the event's current date/time.
function carryExistingRoutes(
  event: ErwEventData,
  existing: Array<Record<string, unknown>> | undefined
): Array<Record<string, unknown>> | undefined {
  if (!existing?.length) return undefined
  return existing.map((route) => ({ ...route, startDate: routeStartDate(event) }))
}

function buildUpdatePayload(
  event: ErwEventData,
  existing: ErwExistingEvent
): Record<string, unknown> {
  const base = buildErwPayload(event)
  const merged: Record<string, unknown> = {
    ...base,
    updated: existing.updated,
  }
  if (base.routes !== undefined) {
    merged.routes = mergeRouteIds(base.routes, existing.routes)
  } else {
    const carried = carryExistingRoutes(event, existing.routes)
    if (carried) {
      merged.routes = carried
    } else {
      // Nothing to publish with — update as a draft instead of sending a
      // payload ERW can only reject.
      merged.published = false
    }
  }
  return merged
}

// A route that carries a sourceRouteUrl but no routeId tells ERW to import a
// fresh route from RWGPS. That import is async, so a `published: true` payload
// fails validation ("Route must have a GPX file or path for published events.")
// until it completes. When this is the case the caller must PUT as a draft and
// publish afterwards — mirroring createErwEvent's published:false-then-publish.
function routesNeedImport(routes: unknown): boolean {
  if (!Array.isArray(routes)) return false
  return routes.some((route) => {
    if (typeof route !== 'object' || route === null) return false
    const r = route as { sourceRouteUrl?: unknown; routeId?: unknown }
    return Boolean(r.sourceRouteUrl) && !r.routeId
  })
}

export async function updateErwEvent(
  erwEventId: string,
  event: ErwEventData
): Promise<ErwResult<ErwCreateResult>> {
  try {
    // GET current event — we need `updated` for optimistic locking and existing
    // routeIds so we can update routes in place instead of delete+create.
    const getResult = await erwFetch<ErwExistingEvent>({
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

    const payload = buildUpdatePayload(event, getResultData)
    // If a route will be re-imported, ERW can't publish it until the async
    // import finishes — PUT as a draft, then publish once it settles.
    const deferPublish = routesNeedImport(payload.routes)
    const putResult = await erwFetch<{ id: string; canonicalUrl: string }>({
      method: 'PUT',
      path: `/events/${erwEventId}`,
      body: deferPublish ? { ...payload, published: false } : payload,
    })

    // On 409 conflict, retry once with a fresh GET
    if (putResult.status === 409) {
      const freshGet = await erwFetch<ErwExistingEvent>({
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

      const retryPayload = buildUpdatePayload(event, freshGetData)
      const deferRetryPublish = routesNeedImport(retryPayload.routes)
      const retryPut = await erwFetch<{ id: string; canonicalUrl: string }>({
        method: 'PUT',
        path: `/events/${erwEventId}`,
        body: deferRetryPublish ? { ...retryPayload, published: false } : retryPayload,
      })

      if (!retryPut.ok) {
        const detail = formatErwError(retryPut.status, retryPut.data)
        logError(new Error(`ERW update event failed after conflict retry: ${detail}`), {
          operation: 'erw:updateEvent',
          context: { erwEventId, status: retryPut.status, response: retryPut.data },
        })
        return { success: false, error: `Epic Ride Weather: ${detail}` }
      }

      const retryPutData = retryPut.data
      if (!retryPutData?.id || !retryPutData?.canonicalUrl) {
        return { success: false, error: 'ERW returned incomplete data' }
      }

      if (deferRetryPublish) await publishErwEvent(erwEventId)

      return {
        success: true,
        data: {
          erwEventId: retryPutData.id,
          canonicalUrl: retryPutData.canonicalUrl,
        },
      }
    }

    if (!putResult.ok) {
      const detail = formatErwError(putResult.status, putResult.data)
      logError(new Error(`ERW update event failed: ${detail}`), {
        operation: 'erw:updateEvent',
        context: { erwEventId, status: putResult.status, response: putResult.data },
      })
      return { success: false, error: `Epic Ride Weather: ${detail}` }
    }

    const putResultData = putResult.data
    if (!putResultData?.id || !putResultData?.canonicalUrl) {
      return { success: false, error: 'ERW returned incomplete data' }
    }

    if (deferPublish) await publishErwEvent(erwEventId)

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

// Delay between publish attempts (overridable for tests)
export const PUBLISH_RETRY_DELAYS = [3000, 5000, 10000] // 3s, 5s, 10s

/**
 * Publish an ERW event, retrying while the RWGPS route import is in progress.
 * Best-effort — logs a warning if publishing fails but doesn't block the caller.
 */
async function publishErwEvent(erwEventId: string): Promise<void> {
  const delays = PUBLISH_RETRY_DELAYS
  let lastResponse: unknown = null

  for (const delay of delays) {
    await new Promise((r) => setTimeout(r, delay))

    // GET full event — PUT requires all required fields, not just published
    const getResult = await erwFetch<Record<string, unknown>>({
      method: 'GET',
      path: `/events/${erwEventId}`,
    })

    if (!getResult.ok || !getResult.data?.updated) continue

    const putResult = await erwFetch({
      method: 'PUT',
      path: `/events/${erwEventId}`,
      body: { ...getResult.data, published: true },
    })

    if (putResult.ok) return

    lastResponse = putResult.data

    // If it's not a validation error (route still importing), stop retrying
    if (putResult.status !== 400) {
      logError(new Error(`ERW publish failed: ${putResult.status}`), {
        operation: 'erw:publishEvent',
        context: { erwEventId, status: putResult.status, response: lastResponse },
      })
      return
    }
  }

  logError(new Error('ERW publish timed out — event remains as draft'), {
    operation: 'erw:publishEvent',
    context: { erwEventId, lastResponse },
  })
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
