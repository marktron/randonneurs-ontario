# Epic Ride Weather Events Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync brevet events to Epic Ride Weather Events so riders get route-aware weather forecasts, and link to ERW pages from the registration page.

**Architecture:** Inline sync in server actions — ERW API calls happen after local DB operations succeed. New `lib/erw/client.ts` module handles auth, CRUD, retries. Two new columns on `events` table store ERW state. Registration page conditionally renders a weather link.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), Epic Ride Weather REST API (OAuth 2.0 client credentials), Vitest

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/YYYYMMDDHHMMSS_add_erw_columns.sql`

- [ ] **Step 1: Create the migration file**

Use the Supabase CLI to generate a timestamped migration:

```bash
npx supabase migration new add_erw_columns
```

Then write the migration content:

```sql
-- Add Epic Ride Weather event tracking columns
ALTER TABLE events ADD COLUMN erw_event_id TEXT;
ALTER TABLE events ADD COLUMN erw_canonical_url TEXT;
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db reset
```

⚠️ This resets the local database — ask the user before running.

Expected: Migration applies cleanly, seed data loads.

- [ ] **Step 3: Regenerate Supabase types**

```bash
npx supabase gen types typescript --local > types/supabase.ts
```

Expected: `types/supabase.ts` now includes `erw_event_id` and `erw_canonical_url` on the events table type.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (no type errors from the new columns — they're nullable and unused so far).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/*_add_erw_columns.sql types/supabase.ts
git commit -m "Add erw_event_id and erw_canonical_url columns to events table"
```

---

### Task 2: ERW API Client

**Files:**

- Create: `lib/erw/client.ts`

**Docs to check:**

- Design spec: `docs/superpowers/specs/2026-04-15-epic-ride-weather-integration-design.md`
- Existing API pattern: `lib/email/ses.ts` (retry logic)
- Error handling: `lib/errors.ts` (`logError` function)

- [ ] **Step 1: Write the failing test for token exchange**

Create `tests/unit/lib/erw/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock logError before importing client
vi.mock('@/lib/errors', () => ({
  logError: vi.fn(),
}))

// We'll use vi.stubGlobal to mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Set env vars
beforeEach(() => {
  vi.stubEnv('EPIC_RIDE_WEATHER_CLIENT_ID', 'test-client-id')
  vi.stubEnv('EPIC_RIDE_WEATHER_SECRET', 'test-secret')
  mockFetch.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Import after mocks
import { createErwEvent, updateErwEvent, deleteErwEvent, _resetTokenCache } from '@/lib/erw/client'

describe('ERW API Client', () => {
  beforeEach(() => {
    _resetTokenCache()
  })

  describe('authentication', () => {
    it('exchanges credentials for access token on first API call', async () => {
      // Mock token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-jwt-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      })
      // Mock create event response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'erw-123',
          canonicalUrl: 'https://events.epicrideweather.com/events/erw-123-Test-Event',
          updated: '2026-04-15T12:00:00Z',
        }),
      })

      await createErwEvent({
        name: 'Test Event',
        description: '',
        distanceKm: 200,
        eventDate: '2026-06-15',
      })

      // First call should be token exchange
      expect(mockFetch).toHaveBeenCalledTimes(2)
      const tokenCall = mockFetch.mock.calls[0]
      expect(tokenCall[0]).toBe('https://events.epicrideweather.com/api/public/v1/auth/token')
      const tokenBody = JSON.parse(tokenCall[1].body)
      expect(tokenBody).toEqual({
        grant_type: 'client_credentials',
        client_id: 'test-client-id',
        client_secret: 'test-secret',
      })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/lib/erw/client.test.ts
```

Expected: FAIL — `lib/erw/client.ts` does not exist.

- [ ] **Step 3: Write the ERW client implementation**

Create `lib/erw/client.ts`:

```typescript
import { logError } from '@/lib/errors'

const ERW_BASE_URL = 'https://events.epicrideweather.com/api/public/v1'

interface ErwResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

interface ErwEventData {
  name: string
  description: string
  distanceKm: number
  eventDate: string // YYYY-MM-DD
  startTime?: string | null
  slug?: string
  rwgpsId?: string | null
}

interface ErwCreateResult {
  erwEventId: string
  canonicalUrl: string
}

// --- Token management ---

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  const now = Date.now()
  // Refresh if within 5 minutes of expiry
  if (cachedToken && tokenExpiresAt > now + 5 * 60 * 1000) {
    return cachedToken
  }

  const clientId = process.env.EPIC_RIDE_WEATHER_CLIENT_ID
  const clientSecret = process.env.EPIC_RIDE_WEATHER_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('ERW API credentials not configured')
  }

  const response = await fetch(`${ERW_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`ERW token exchange failed: ${response.status} ${text}`)
  }

  const data = await response.json()
  cachedToken = data.access_token
  tokenExpiresAt = now + data.expires_in * 1000

  return cachedToken!
}

// Clear cached token (used when we get a 401)
function clearToken(): void {
  cachedToken = null
  tokenExpiresAt = 0
}

// Exported for tests only
export function _resetTokenCache(): void {
  clearToken()
}

// --- Helpers ---

function isTransientError(status: number): boolean {
  return status >= 500 || status === 429
}

function buildSiteUrl(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://randonneursontario.ca'
  return `${baseUrl}/register/${slug}`
}

function buildErwPayload(event: ErwEventData) {
  const routes: Array<Record<string, unknown>> = []

  if (event.rwgpsId) {
    routes.push({
      name: event.name,
      sourceRouteUrl: `https://ridewithgps.com/routes/${event.rwgpsId}`,
      startDate: event.startTime
        ? `${event.eventDate}T${event.startTime}:00`
        : `${event.eventDate}T08:00:00`,
    })
  }

  const siteUrl = event.slug ? buildSiteUrl(event.slug) : undefined

  return {
    name: event.name,
    description: event.description || event.name,
    units: 'intl' as const,
    url: siteUrl,
    registrationUrl: siteUrl,
    published: true,
    tags: ['brevet' as const],
    routes,
  }
}

async function erwFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const response = await fetch(`${ERW_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  // If 401, clear token and retry once
  if (response.status === 401) {
    clearToken()
    const newToken = await getAccessToken()
    return fetch(`${ERW_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newToken}`,
        ...options.headers,
      },
    })
  }

  return response
}

// --- Public API ---

export async function createErwEvent(event: ErwEventData): Promise<ErwResult<ErwCreateResult>> {
  const payload = buildErwPayload(event)

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await erwFetch('/events', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        return {
          success: true,
          data: {
            erwEventId: data.id,
            canonicalUrl: data.canonicalUrl,
          },
        }
      }

      if (attempt === 0 && isTransientError(response.status)) {
        continue
      }

      const text = await response.text().catch(() => '')
      logError(new Error(`ERW create failed: ${response.status} ${text}`), {
        operation: 'erw:createEvent',
        context: { eventName: event.name, status: response.status },
      })
      return { success: false, error: `ERW API error: ${response.status}` }
    } catch (error) {
      if (attempt === 0) continue

      logError(error, {
        operation: 'erw:createEvent',
        context: { eventName: event.name },
      })
      return { success: false, error: 'ERW API network error' }
    }
  }

  return { success: false, error: 'ERW API error after retry' }
}

export async function updateErwEvent(
  erwEventId: string,
  event: ErwEventData
): Promise<ErwResult<ErwCreateResult>> {
  // GET current state for optimistic locking
  let currentUpdated: string
  try {
    const getResponse = await erwFetch(`/events/${erwEventId}`)
    if (!getResponse.ok) {
      const text = await getResponse.text().catch(() => '')
      logError(new Error(`ERW get failed: ${getResponse.status} ${text}`), {
        operation: 'erw:updateEvent',
        context: { erwEventId, status: getResponse.status },
      })
      return { success: false, error: `ERW API error: ${getResponse.status}` }
    }
    const currentEvent = await getResponse.json()
    currentUpdated = currentEvent.updated
  } catch (error) {
    logError(error, {
      operation: 'erw:updateEvent',
      context: { erwEventId },
    })
    return { success: false, error: 'ERW API network error' }
  }

  // PUT with updated timestamp
  const payload = {
    ...buildErwPayload(event),
    updated: currentUpdated,
  }

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await erwFetch(`/events/${erwEventId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        return {
          success: true,
          data: {
            erwEventId: data.id,
            canonicalUrl: data.canonicalUrl,
          },
        }
      }

      // On 409 conflict, re-fetch and retry once
      if (response.status === 409 && attempt === 0) {
        const refetch = await erwFetch(`/events/${erwEventId}`)
        if (refetch.ok) {
          const refreshed = await refetch.json()
          payload.updated = refreshed.updated
          continue
        }
      }

      if (attempt === 0 && isTransientError(response.status)) {
        continue
      }

      const text = await response.text().catch(() => '')
      logError(new Error(`ERW update failed: ${response.status} ${text}`), {
        operation: 'erw:updateEvent',
        context: { erwEventId, status: response.status },
      })
      return { success: false, error: `ERW API error: ${response.status}` }
    } catch (error) {
      if (attempt === 0) continue

      logError(error, {
        operation: 'erw:updateEvent',
        context: { erwEventId },
      })
      return { success: false, error: 'ERW API network error' }
    }
  }

  return { success: false, error: 'ERW API error after retry' }
}

export async function deleteErwEvent(erwEventId: string): Promise<ErwResult> {
  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await erwFetch(`/events/${erwEventId}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        return { success: true }
      }

      // 404 means already deleted — treat as success
      if (response.status === 404) {
        return { success: true }
      }

      if (attempt === 0 && isTransientError(response.status)) {
        continue
      }

      const text = await response.text().catch(() => '')
      logError(new Error(`ERW delete failed: ${response.status} ${text}`), {
        operation: 'erw:deleteEvent',
        context: { erwEventId, status: response.status },
      })
      return { success: false, error: `ERW API error: ${response.status}` }
    } catch (error) {
      if (attempt === 0) continue

      logError(error, {
        operation: 'erw:deleteEvent',
        context: { erwEventId },
      })
      return { success: false, error: 'ERW API network error' }
    }
  }

  return { success: false, error: 'ERW API error after retry' }
}
```

- [ ] **Step 4: Run the auth test to verify it passes**

```bash
npx vitest run tests/unit/lib/erw/client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/erw/client.ts tests/unit/lib/erw/client.test.ts
git commit -m "Add ERW API client with auth, create, update, delete"
```

---

### Task 3: ERW Client Tests

**Files:**

- Modify: `tests/unit/lib/erw/client.test.ts`

- [ ] **Step 1: Add comprehensive tests**

Expand the test file with tests for all client operations:

```typescript
// Add these test blocks after the existing auth test

describe('createErwEvent', () => {
  function mockTokenThenResponse(response: Partial<Response>) {
    // Token exchange
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // API response
    mockFetch.mockResolvedValueOnce(response)
  }

  it('creates event with correct payload', async () => {
    mockTokenThenResponse({
      ok: true,
      json: async () => ({
        id: 'erw-123',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-123-Test',
        updated: '2026-04-15T12:00:00Z',
      }),
    })

    const result = await createErwEvent({
      name: 'Spring 200',
      description: 'A lovely spring brevet',
      distanceKm: 200,
      eventDate: '2026-06-15',
      startTime: '07:00',
      slug: 'spring-200-200km-2026-06-15',
      rwgpsId: '12345678',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      erwEventId: 'erw-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-123-Test',
    })

    // Verify the event creation request
    const createCall = mockFetch.mock.calls[1]
    const body = JSON.parse(createCall[1].body)
    expect(body).toMatchObject({
      name: 'Spring 200',
      description: 'A lovely spring brevet',
      units: 'intl',
      published: true,
      tags: ['brevet'],
      url: 'https://randonneursontario.ca/register/spring-200-200km-2026-06-15',
      registrationUrl: 'https://randonneursontario.ca/register/spring-200-200km-2026-06-15',
    })
    expect(body.routes).toHaveLength(1)
    expect(body.routes[0].sourceRouteUrl).toBe('https://ridewithgps.com/routes/12345678')
  })

  it('creates event without route when rwgpsId is absent', async () => {
    mockTokenThenResponse({
      ok: true,
      json: async () => ({
        id: 'erw-456',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-456-Test',
        updated: '2026-04-15T12:00:00Z',
      }),
    })

    const result = await createErwEvent({
      name: 'Fall 300',
      description: '',
      distanceKm: 300,
      eventDate: '2026-09-20',
    })

    expect(result.success).toBe(true)
    const body = JSON.parse(mockFetch.mock.calls[1][1].body)
    expect(body.routes).toEqual([])
    // Description falls back to name when empty
    expect(body.description).toBe('Fall 300')
  })

  it('retries on 5xx and succeeds', async () => {
    // Token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // First attempt: 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    })
    // Retry: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-789',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-789',
        updated: '2026-04-15T12:00:00Z',
      }),
    })

    const result = await createErwEvent({
      name: 'Test',
      description: '',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    expect(result.success).toBe(true)
    // Token + first attempt + retry = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('logs error to Sentry on non-transient failure', async () => {
    mockTokenThenResponse({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: client not approved',
    })

    const result = await createErwEvent({
      name: 'Test',
      description: '',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('403')

    const { logError } = await import('@/lib/errors')
    expect(logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'erw:createEvent' })
    )
  })

  it('handles network error with retry', async () => {
    // Token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // Both attempts fail with network error
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))

    const result = await createErwEvent({
      name: 'Test',
      description: '',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    expect(result.success).toBe(false)
    expect(result.error).toBe('ERW API network error')
  })
})

describe('updateErwEvent', () => {
  function mockTokenAndGet() {
    // Token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // GET for optimistic lock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-123',
        updated: '2026-04-15T12:00:00Z',
        name: 'Old Name',
        routes: [],
      }),
    })
  }

  it('performs GET then PUT for optimistic locking', async () => {
    mockTokenAndGet()
    // PUT response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-123',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-123-New-Name',
        updated: '2026-04-15T13:00:00Z',
      }),
    })

    const result = await updateErwEvent('erw-123', {
      name: 'New Name',
      description: 'Updated desc',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    expect(result.success).toBe(true)
    expect(result.data?.canonicalUrl).toContain('New-Name')

    // Verify PUT includes updated timestamp
    const putCall = mockFetch.mock.calls[2]
    expect(putCall[0]).toContain('/events/erw-123')
    expect(putCall[1].method).toBe('PUT')
    const putBody = JSON.parse(putCall[1].body)
    expect(putBody.updated).toBe('2026-04-15T12:00:00Z')
  })

  it('retries on 409 conflict with fresh GET', async () => {
    mockTokenAndGet()
    // PUT: 409 conflict
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => 'Conflict',
    })
    // Re-GET for fresh timestamp
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-123',
        updated: '2026-04-15T12:30:00Z',
        routes: [],
      }),
    })
    // Retry PUT: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-123',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-123',
        updated: '2026-04-15T13:00:00Z',
      }),
    })

    const result = await updateErwEvent('erw-123', {
      name: 'Test',
      description: '',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    expect(result.success).toBe(true)
  })
})

describe('deleteErwEvent', () => {
  it('deletes successfully', async () => {
    // Token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // DELETE response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    const result = await deleteErwEvent('erw-123')
    expect(result.success).toBe(true)
  })

  it('treats 404 as success (already deleted)', async () => {
    // Token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    // DELETE: 404
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })

    const result = await deleteErwEvent('erw-123')
    expect(result.success).toBe(true)
  })
})

describe('token caching', () => {
  it('reuses cached token for subsequent calls', async () => {
    // First call: token + create
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'cached-jwt',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-1',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-1',
        updated: '2026-04-15T12:00:00Z',
      }),
    })

    await createErwEvent({
      name: 'First',
      description: '',
      distanceKm: 200,
      eventDate: '2026-06-15',
    })

    // Second call: should reuse token (only 1 fetch, not 2)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'erw-2',
        canonicalUrl: 'https://events.epicrideweather.com/events/erw-2',
        updated: '2026-04-15T12:00:00Z',
      }),
    })

    await createErwEvent({
      name: 'Second',
      description: '',
      distanceKm: 300,
      eventDate: '2026-07-20',
    })

    // Token fetch (1) + create (1) + create-with-cached-token (1) = 3
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run all ERW client tests**

```bash
npx vitest run tests/unit/lib/erw/client.test.ts
```

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/lib/erw/client.test.ts
git commit -m "Add comprehensive tests for ERW API client"
```

---

### Task 4: Server Action Integration — createEvent

**Files:**

- Modify: `lib/actions/events.ts:74-159` (createEvent function)

- [ ] **Step 1: Write the failing test**

Add to `tests/integration/actions/events.test.ts`. First add the ERW mock at the top with the other mocks:

```typescript
vi.mock('@/lib/erw/client', () => ({
  createErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
  updateErwEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      erwEventId: 'erw-test-123',
      canonicalUrl: 'https://events.epicrideweather.com/events/erw-test-123',
    },
  }),
  deleteErwEvent: vi.fn().mockResolvedValue({ success: true }),
}))
```

Then add a test in the `createEvent` describe block:

```typescript
it('calls ERW createErwEvent after successful creation for brevet events', async () => {
  mockModule.__mockInsertSuccess({ id: 'new-event-id' })
  // Mock the route lookup query
  mockModule.__mockEventFound({ rwgps_id: '12345678' })
  // Mock the ERW column update
  mockModule.__mockUpdateSuccess()
  // Mock chapter slug for revalidation
  mockModule.__mockEventFound({ slug: 'toronto' })

  const result = await createEvent({
    name: 'Test Brevet',
    chapterId: 'chapter-1',
    routeId: 'route-1',
    eventType: 'brevet',
    distanceKm: 200,
    eventDate: '2025-06-15',
    startTime: '08:00',
  })

  expect(result.success).toBe(true)

  const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
  expect(mockCreateErw).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Test Brevet',
      distanceKm: 200,
      eventDate: '2025-06-15',
      rwgpsId: '12345678',
    })
  )
})

it('skips ERW sync for permanent events', async () => {
  mockModule.__mockInsertSuccess({ id: 'new-permanent-id' })
  mockModule.__mockEventFound({ slug: 'toronto' })

  const result = await createEvent({
    name: 'Permanent Ride',
    chapterId: 'chapter-1',
    eventType: 'permanent',
    distanceKm: 200,
    eventDate: '2025-06-15',
  })

  expect(result.success).toBe(true)

  const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
  expect(mockCreateErw).not.toHaveBeenCalled()
})

it('still creates event locally when ERW fails', async () => {
  mockModule.__mockInsertSuccess({ id: 'new-event-id' })
  mockModule.__mockEventFound({ rwgps_id: null }) // Route without RWGPS
  mockModule.__mockEventFound({ slug: 'toronto' })

  // Override ERW mock to fail
  const { createErwEvent: mockCreateErw } = await import('@/lib/erw/client')
  vi.mocked(mockCreateErw).mockResolvedValueOnce({
    success: false,
    error: 'ERW API error: 500',
  })

  const result = await createEvent({
    name: 'Test Brevet',
    chapterId: 'chapter-1',
    routeId: 'route-1',
    eventType: 'brevet',
    distanceKm: 200,
    eventDate: '2025-06-15',
  })

  // Event should still be created successfully
  expect(result.success).toBe(true)
  if (result.success) {
    expect(result.data?.id).toBe('new-event-id')
  }
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/integration/actions/events.test.ts
```

Expected: FAIL — `createErwEvent` not called from `createEvent`.

- [ ] **Step 3: Implement ERW sync in createEvent**

Modify `lib/actions/events.ts`. Add import at top:

```typescript
import { createErwEvent, updateErwEvent, deleteErwEvent } from '@/lib/erw/client'
```

Then in `createEvent()`, after the successful insert and before cache revalidation (after `const typedNewEvent = newEvent as EventIdOnly` around line 138), add:

```typescript
// Sync to Epic Ride Weather (skip permanents)
if (eventType !== 'permanent') {
  let rwgpsId: string | null = null
  if (routeId) {
    const { data: route } = await getSupabaseAdmin()
      .from('routes')
      .select('rwgps_id')
      .eq('id', routeId)
      .single()
    rwgpsId = route?.rwgps_id ?? null
  }

  const erwResult = await createErwEvent({
    name: name.trim(),
    description: description || '',
    distanceKm,
    eventDate,
    startTime: startTime || null,
    slug,
    rwgpsId,
  })

  if (erwResult.success && erwResult.data) {
    await getSupabaseAdmin()
      .from('events')
      .update({
        erw_event_id: erwResult.data.erwEventId,
        erw_canonical_url: erwResult.data.canonicalUrl,
      })
      .eq('id', typedNewEvent.id)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/integration/actions/events.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add lib/actions/events.ts tests/integration/actions/events.test.ts
git commit -m "Sync new events to Epic Ride Weather on creation"
```

---

### Task 5: Server Action Integration — updateEvent and deleteEvent

**Files:**

- Modify: `lib/actions/events.ts:174-312` (updateEvent and deleteEvent functions)
- Modify: `lib/actions/events.ts:314-399` (updateEventStatus for cancellation)
- Modify: `tests/integration/actions/events.test.ts`

- [ ] **Step 1: Write failing tests for updateEvent ERW sync**

Add to the `updateEvent` describe block in `tests/integration/actions/events.test.ts`:

```typescript
it('calls ERW updateErwEvent when event has erw_event_id', async () => {
  mockModule.__mockUpdateSuccess() // DB update
  mockModule.__mockEventFound({
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    slug: 'test-event',
    erw_event_id: 'erw-existing-123',
    route_id: 'route-1',
  })
  // Route lookup for rwgps_id
  mockModule.__mockEventFound({ rwgps_id: '99999' })
  // ERW canonical URL update
  mockModule.__mockUpdateSuccess()
  // Chapter slug for revalidation
  mockModule.__mockEventFound({ slug: 'toronto' })

  const result = await updateEvent('event-1', {
    name: 'Updated Name',
  })

  expect(result.success).toBe(true)

  const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
  expect(mockUpdateErw).toHaveBeenCalledWith(
    'erw-existing-123',
    expect.objectContaining({ name: 'Updated Name' })
  )
})

it('skips ERW sync when event has no erw_event_id', async () => {
  mockModule.__mockUpdateSuccess()
  mockModule.__mockEventFound({
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    slug: 'test-event',
    erw_event_id: null,
  })
  mockModule.__mockEventFound({ slug: 'toronto' }) // revalidation

  const result = await updateEvent('event-1', {
    name: 'Updated Name',
  })

  expect(result.success).toBe(true)

  const { updateErwEvent: mockUpdateErw } = await import('@/lib/erw/client')
  expect(mockUpdateErw).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Write failing tests for deleteEvent ERW sync**

Add to the `deleteEvent` describe block:

```typescript
it('calls ERW deleteErwEvent when event has erw_event_id', async () => {
  const futureDate = new Date()
  futureDate.setFullYear(futureDate.getFullYear() + 1)

  mockModule.__mockEventFound({
    id: 'test-event-id',
    name: 'Test Event',
    event_date: futureDate.toISOString().split('T')[0],
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    erw_event_id: 'erw-to-delete',
  })

  const result = await deleteEvent('test-event-id')

  expect(result.success).toBe(true)

  const { deleteErwEvent: mockDeleteErw } = await import('@/lib/erw/client')
  expect(mockDeleteErw).toHaveBeenCalledWith('erw-to-delete')
})
```

- [ ] **Step 3: Write failing test for cancellation ERW sync**

Add to the `updateEventStatus` describe block:

```typescript
it('calls ERW deleteErwEvent when cancelling event with erw_event_id', async () => {
  mockModule.__mockEventFound({
    id: 'event-1',
    name: 'Test Event',
    event_date: '2025-06-15',
    distance_km: 200,
    chapter_id: 'chapter-1',
    event_type: 'brevet',
    status: 'scheduled',
    erw_event_id: 'erw-cancel-123',
    chapters: { name: 'Toronto' },
  })
  mockModule.__mockUpdateSuccess() // Delete results
  mockModule.__mockUpdateSuccess() // Status update
  mockModule.__mockUpdateSuccess() // Clear ERW columns
  mockModule.__mockEventFound({ slug: 'toronto' }) // Revalidation

  const result = await updateEventStatus('event-1', 'cancelled')

  expect(result.success).toBe(true)

  const { deleteErwEvent: mockDeleteErw } = await import('@/lib/erw/client')
  expect(mockDeleteErw).toHaveBeenCalledWith('erw-cancel-123')
})
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/integration/actions/events.test.ts
```

Expected: FAIL — ERW functions not called from updateEvent/deleteEvent/updateEventStatus.

- [ ] **Step 5: Implement ERW sync in updateEvent**

In `updateEvent()`, the existing code fetches the event after update for cache revalidation. Expand that query to also include `erw_event_id` and `route_id`, then add ERW sync. Modify the post-update section (around line 229):

Replace the existing event fetch query:

```typescript
// Fetch event to get chapter, type, and slug for cache tag revalidation
const { data: event } = await getSupabaseAdmin()
  .from('events')
  .select('chapter_id, event_type, slug')
  .eq('id', eventId)
  .single()
```

With:

```typescript
// Fetch event for revalidation and ERW sync
const { data: event } = await getSupabaseAdmin()
  .from('events')
  .select(
    'chapter_id, event_type, slug, erw_event_id, route_id, name, description, distance_km, event_date, start_time'
  )
  .eq('id', eventId)
  .single()
```

Then add ERW sync after the revalidation block, before the audit log:

```typescript
// Sync to Epic Ride Weather if event is linked
if (event?.erw_event_id) {
  let rwgpsId: string | null = null
  if (event.route_id) {
    const { data: route } = await getSupabaseAdmin()
      .from('routes')
      .select('rwgps_id')
      .eq('id', event.route_id)
      .single()
    rwgpsId = route?.rwgps_id ?? null
  }

  const erwResult = await updateErwEvent(event.erw_event_id, {
    name: event.name,
    description: event.description || '',
    distanceKm: event.distance_km,
    eventDate: event.event_date,
    startTime: event.start_time || null,
    slug: event.slug,
    rwgpsId,
  })

  if (erwResult.success && erwResult.data) {
    await getSupabaseAdmin()
      .from('events')
      .update({ erw_canonical_url: erwResult.data.canonicalUrl })
      .eq('id', eventId)
  }
}
```

- [ ] **Step 6: Implement ERW sync in deleteEvent**

In `deleteEvent()`, after the event fetch (around line 271) and before the delete operation, add ERW sync:

```typescript
// Delete from Epic Ride Weather if linked
if (typedEvent.erw_event_id) {
  await deleteErwEvent(typedEvent.erw_event_id)
}
```

The event fetch query also needs to include `erw_event_id`:

```typescript
const { data: event, error: fetchError } = await getSupabaseAdmin()
  .from('events')
  .select('id, name, event_date, chapter_id, event_type, erw_event_id')
  .eq('id', eventId)
  .single()
```

And update the type assertion to include it:

```typescript
const typedEvent = event as Pick<
  Event,
  'id' | 'name' | 'event_date' | 'chapter_id' | 'event_type'
> & { erw_event_id: string | null }
```

- [ ] **Step 7: Implement ERW sync in updateEventStatus for cancellation**

In `updateEventStatus()`, expand the event fetch query to include `erw_event_id`:

```typescript
      .select('id, name, event_date, distance_km, chapter_id, event_type, status, erw_event_id, chapters(name)')
```

Then after the status update succeeds and before the completion logic, add cancellation ERW sync:

```typescript
// Delete from Epic Ride Weather when cancelling
if (status === 'cancelled' && typedEvent.erw_event_id) {
  await deleteErwEvent(typedEvent.erw_event_id)
  await getSupabaseAdmin()
    .from('events')
    .update({ erw_event_id: null, erw_canonical_url: null })
    .eq('id', eventId)
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run tests/integration/actions/events.test.ts
```

Expected: ALL PASS

- [ ] **Step 9: Run full test suite and typecheck**

```bash
npm test && npm run typecheck
```

Expected: ALL PASS

- [ ] **Step 10: Commit**

```bash
git add lib/actions/events.ts tests/integration/actions/events.test.ts
git commit -m "Sync event updates, deletes, and cancellations to Epic Ride Weather"
```

---

### Task 6: Registration Page Weather Link

**Files:**

- Modify: `lib/data/events.ts:455-506` (getEventBySlugInner query and EventDetails interface)
- Modify: `app/register/[slug]/page.tsx:217-263` (route section)

- [ ] **Step 1: Add `erwCanonicalUrl` to EventDetails interface**

In `lib/data/events.ts`, add to the `EventDetails` interface (around line 250):

```typescript
erwCanonicalUrl: string | null // Epic Ride Weather event page URL
```

- [ ] **Step 2: Update the getEventBySlugInner query**

In `lib/data/events.ts`, add `erw_canonical_url` to the select query (around line 459):

```typescript
      .select(
        `
        id,
        slug,
        name,
        event_date,
        start_time,
        start_location,
        distance_km,
        event_type,
        description,
        image_url,
        erw_canonical_url,
        chapters (name, slug),
        routes (slug, rwgps_id, cue_sheet_url)
      `
      )
```

And add the mapping in the return object (around line 504):

```typescript
    erwCanonicalUrl: typedEvent.erw_canonical_url || null,
```

- [ ] **Step 3: Update the EventWithRelations type**

In `types/queries.ts`, the `EventWithRelations` type may need the new field. Check if the generated Supabase types already include it (they should after Task 1). If the query uses a select, the type assertion should work with the generated types. If not, add `erw_canonical_url` to the type.

- [ ] **Step 4: Add weather link to registration page**

In `app/register/[slug]/page.tsx`, add `CloudSun` to the lucide-react import:

```typescript
import { MapPinIcon, CalendarIcon, CloudSun } from 'lucide-react'
```

Then after the route section closing `</div>` (around line 262) and before the `{/* Registered Riders */}` comment, add:

```typescript
            {/* Weather Forecast */}
            {event.erwCanonicalUrl && (
              <div className="mb-8 md:mb-12">
                <a
                  href={event.erwCanonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline underline-offset-2"
                >
                  <CloudSun className="h-4 w-4" />
                  Weather forecast
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>
            )}
```

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/data/events.ts app/register/[slug]/page.tsx types/queries.ts
git commit -m "Add weather forecast link on registration page from Epic Ride Weather"
```

---

### Task 7: Admin Single Event Sync Button

**Files:**

- Create: `lib/actions/erw-sync.ts`
- Create: `components/admin/erw-sync-button.tsx`
- Modify: `app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Create the sync server action**

Create `lib/actions/erw-sync.ts`:

```typescript
'use server'

import { getSupabaseAdmin } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/auth/get-admin'
import { createErwEvent, updateErwEvent } from '@/lib/erw/client'
import { logAuditEvent } from '@/lib/audit-log'
import { handleActionError } from '@/lib/errors'
import type { ActionResult } from '@/types/actions'

export async function syncEventToErw(
  eventId: string
): Promise<ActionResult<{ canonicalUrl: string }>> {
  try {
    const admin = await requireAdmin()

    // Fetch event with route
    const { data: event, error } = await getSupabaseAdmin()
      .from('events')
      .select(
        'id, slug, name, description, distance_km, event_date, start_time, event_type, erw_event_id, route_id'
      )
      .eq('id', eventId)
      .single()

    if (error || !event) {
      return { success: false, error: 'Event not found' }
    }

    if (event.event_type === 'permanent') {
      return { success: false, error: 'Permanent events cannot be synced to Epic Ride Weather' }
    }

    // Get route's RWGPS ID if a route is linked
    let rwgpsId: string | null = null
    if (event.route_id) {
      const { data: route } = await getSupabaseAdmin()
        .from('routes')
        .select('rwgps_id')
        .eq('id', event.route_id)
        .single()
      rwgpsId = route?.rwgps_id ?? null
    }

    const eventData = {
      name: event.name,
      description: event.description || '',
      distanceKm: event.distance_km,
      eventDate: event.event_date,
      startTime: event.start_time || null,
      slug: event.slug,
      rwgpsId,
    }

    let erwResult
    if (event.erw_event_id) {
      // Update existing
      erwResult = await updateErwEvent(event.erw_event_id, eventData)
    } else {
      // Create new
      erwResult = await createErwEvent(eventData)
    }

    if (!erwResult.success || !erwResult.data) {
      return { success: false, error: erwResult.error || 'Failed to sync to Epic Ride Weather' }
    }

    // Store ERW IDs
    await getSupabaseAdmin()
      .from('events')
      .update({
        erw_event_id: erwResult.data.erwEventId,
        erw_canonical_url: erwResult.data.canonicalUrl,
      })
      .eq('id', eventId)

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      entityId: eventId,
      description: `Synced event to Epic Ride Weather: ${event.name}`,
    })

    return { success: true, data: { canonicalUrl: erwResult.data.canonicalUrl } }
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'syncEventToErw' },
      'Failed to sync to Epic Ride Weather'
    )
  }
}
```

- [ ] **Step 2: Create the sync button component**

Create `components/admin/erw-sync-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CloudSun, Loader2, ExternalLink } from 'lucide-react'
import { syncEventToErw } from '@/lib/actions/erw-sync'

interface ErwSyncButtonProps {
  eventId: string
  erwCanonicalUrl: string | null
}

export function ErwSyncButton({ eventId, erwCanonicalUrl }: ErwSyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [url, setUrl] = useState(erwCanonicalUrl)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setError(null)
    const result = await syncEventToErw(eventId)
    setSyncing(false)

    if (result.success && result.data) {
      setUrl(result.data.canonicalUrl)
    } else {
      setError(result.error || 'Sync failed')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CloudSun className="h-4 w-4 mr-2" />
        )}
        {url ? 'Re-sync to ERW' : 'Sync to ERW'}
      </Button>
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          View
        </a>
      )}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 3: Add the sync button to admin event detail page**

Modify `app/admin/events/[id]/page.tsx`.

Add the import:

```typescript
import { ErwSyncButton } from '@/components/admin/erw-sync-button'
```

Expand the `getEventDetails` query to include ERW fields:

```typescript
      .select(
        `
        id,
        name,
        event_date,
        start_time,
        distance_km,
        event_type,
        status,
        season,
        erw_event_id,
        erw_canonical_url,
        chapters (id, name)
      `
      )
```

Then add the button in the action buttons area (around line 170, after the EventDeleteButton):

```tsx
{
  event.event_type !== 'permanent' && (
    <ErwSyncButton eventId={event.id} erwCanonicalUrl={event.erw_canonical_url} />
  )
}
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/erw-sync.ts components/admin/erw-sync-button.tsx app/admin/events/[id]/page.tsx
git commit -m "Add single event sync to ERW button on admin event page"
```

---

### Task 8: Admin Bulk Sync

**Files:**

- Modify: `lib/actions/erw-sync.ts`
- Create: `components/admin/erw-bulk-sync-button.tsx`
- Modify: `app/admin/events/page.tsx`

- [ ] **Step 1: Add bulk sync action**

Add to `lib/actions/erw-sync.ts`:

```typescript
interface BulkSyncResult {
  synced: number
  failed: number
  errors: string[]
}

export async function syncAllEventsToErw(): Promise<ActionResult<BulkSyncResult>> {
  try {
    const admin = await requireAdmin()

    // Find all scheduled events without ERW sync (excluding permanents)
    const { data: events, error } = await getSupabaseAdmin()
      .from('events')
      .select(
        'id, slug, name, description, distance_km, event_date, start_time, event_type, route_id'
      )
      .eq('status', 'scheduled')
      .is('erw_event_id', null)
      .neq('event_type', 'permanent')
      .order('event_date', { ascending: true })

    if (error) {
      return { success: false, error: 'Failed to fetch events' }
    }

    if (!events || events.length === 0) {
      return { success: true, data: { synced: 0, failed: 0, errors: [] } }
    }

    let synced = 0
    let failed = 0
    const errors: string[] = []

    for (const event of events) {
      // Get route's RWGPS ID
      let rwgpsId: string | null = null
      if (event.route_id) {
        const { data: route } = await getSupabaseAdmin()
          .from('routes')
          .select('rwgps_id')
          .eq('id', event.route_id)
          .single()
        rwgpsId = route?.rwgps_id ?? null
      }

      const erwResult = await createErwEvent({
        name: event.name,
        description: event.description || '',
        distanceKm: event.distance_km,
        eventDate: event.event_date,
        startTime: event.start_time || null,
        slug: event.slug,
        rwgpsId,
      })

      if (erwResult.success && erwResult.data) {
        await getSupabaseAdmin()
          .from('events')
          .update({
            erw_event_id: erwResult.data.erwEventId,
            erw_canonical_url: erwResult.data.canonicalUrl,
          })
          .eq('id', event.id)
        synced++
      } else {
        failed++
        errors.push(`${event.name}: ${erwResult.error}`)
      }
    }

    await logAuditEvent({
      adminId: admin.id,
      action: 'update',
      entityType: 'event',
      description: `Bulk synced ${synced} events to Epic Ride Weather (${failed} failed)`,
    })

    return { success: true, data: { synced, failed, errors } }
  } catch (error) {
    return handleActionError(error, { operation: 'syncAllEventsToErw' }, 'Bulk sync failed')
  }
}
```

- [ ] **Step 2: Create the bulk sync button component**

Create `components/admin/erw-bulk-sync-button.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CloudSun, Loader2 } from 'lucide-react'
import { syncAllEventsToErw } from '@/lib/actions/erw-sync'

export function ErwBulkSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{
    synced: number
    failed: number
    errors: string[]
  } | null>(null)

  async function handleSync() {
    setSyncing(true)
    setResult(null)
    const response = await syncAllEventsToErw()
    setSyncing(false)

    if (response.success && response.data) {
      setResult(response.data)
    } else {
      setResult({ synced: 0, failed: 0, errors: [response.error || 'Sync failed'] })
    }
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
        {syncing ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <CloudSun className="h-4 w-4 mr-2" />
        )}
        Bulk Sync to ERW
      </Button>
      {result && (
        <p className="text-sm text-muted-foreground">
          Synced {result.synced}, failed {result.failed}
          {result.errors.length > 0 && (
            <span className="block text-destructive mt-1">{result.errors.join('; ')}</span>
          )}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Add bulk sync button to admin events page**

Read `app/admin/events/page.tsx` to find the right insertion point. Add the import and place the button near the page header/actions area.

Add import:

```typescript
import { ErwBulkSyncButton } from '@/components/admin/erw-bulk-sync-button'
```

Add the component in the header area next to existing action buttons.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/actions/erw-sync.ts components/admin/erw-bulk-sync-button.tsx app/admin/events/page.tsx
git commit -m "Add bulk sync to ERW button on admin events page"
```

---

### Task 9: Environment Variables and Documentation

**Files:**

- Modify: `.env.local.example`
- Modify: `docs/superpowers/specs/2026-04-15-epic-ride-weather-integration-design.md` (no changes needed — already complete)

- [ ] **Step 1: Add ERW env vars to .env.local.example**

Add after the RWGPS section:

```
# Epic Ride Weather Events API
# Create API credentials at https://events.epicrideweather.com/account/settings
EPIC_RIDE_WEATHER_CLIENT_ID=
EPIC_RIDE_WEATHER_SECRET=
```

- [ ] **Step 2: Run full verification**

```bash
npm run typecheck && npm run lint && npm test
```

Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add .env.local.example
git commit -m "Add ERW API credentials to env example file"
```
