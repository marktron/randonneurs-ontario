import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression test: registering with an existing rider's email must NOT
 * silently link to that rider when names don't match. Instead, it should
 * fall through to the fuzzy match picker.
 *
 * When names DO match (same person, same email), auto-linking should work
 * and only update supplementary fields (gender, emergency contact) — never
 * overwrite the rider's name.
 */

// Track DB operations so we can inspect payloads
const updatePayloads: Array<{ table: string; data: Record<string, unknown>; id: string }> = []
const insertPayloads: Array<{ table: string; data: Record<string, unknown> }> = []

vi.mock('@/lib/supabase-server', () => {
  const EXISTING_RIDER = { id: 'rider-fred', first_name: 'Fred', last_name: 'Chagnon' }
  const SCHEDULED_EVENT = {
    id: 'event-123',
    slug: 'test-event',
    status: 'scheduled',
    name: 'Test Event',
    event_date: '2026-04-01',
    start_time: '08:00',
    start_location: 'Toronto',
    distance_km: 200,
    event_type: 'brevet',
    chapters: { slug: 'toronto', name: 'Toronto' },
    routes: { slug: 'test-route' },
  }

  // Fallback terminal for unhandled chains
  const fallback = {
    single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn((): unknown => fallback),
    ilike: vi.fn((): unknown => fallback),
    limit: vi.fn((): unknown => fallback),
    then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
  }

  return {
    getSupabaseAdmin: vi.fn(() => {
      let currentTable = ''
      let currentData: Record<string, unknown> = {}

      const chainEnd = {
        eq: vi.fn((col: string, val: string): unknown => {
          // For update().eq('id', ...) — record the update payload
          if (currentData && Object.keys(currentData).length > 0) {
            updatePayloads.push({ table: currentTable, data: { ...currentData }, id: val })
            currentData = {}
            return Promise.resolve({ data: null, error: null })
          }
          // Rider lookup by email — return array (new query doesn't use .single())
          if (currentTable === 'riders' && col === 'email') {
            return {
              then: vi.fn((resolve: (v: unknown) => void) =>
                resolve({ data: [EXISTING_RIDER], error: null })
              ),
              single: vi.fn().mockResolvedValue({ data: EXISTING_RIDER, error: null }),
            }
          }
          // Rider lookup by id
          if (currentTable === 'riders' && col === 'id') {
            return {
              single: vi.fn().mockResolvedValue({ data: EXISTING_RIDER, error: null }),
            }
          }
          // Event lookup
          if (currentTable === 'events' && col === 'id') {
            return {
              single: vi.fn().mockResolvedValue({ data: SCHEDULED_EVENT, error: null }),
            }
          }
          return fallback
        }),
        ilike: vi.fn((col: string): unknown => {
          // Rider email lookup is now case-insensitive — returns an array
          if (currentTable === 'riders' && col === 'email') {
            return {
              then: vi.fn((resolve: (v: unknown) => void) =>
                resolve({ data: [EXISTING_RIDER], error: null })
              ),
            }
          }
          return fallback
        }),
      }

      return {
        from: vi.fn((table: string) => {
          currentTable = table
          currentData = {}
          return {
            select: vi.fn(() => chainEnd),
            update: vi.fn((data: Record<string, unknown>) => {
              currentData = data
              return chainEnd
            }),
            insert: vi.fn((data: Record<string, unknown>) => {
              insertPayloads.push({ table: currentTable, data: { ...data } })
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }),
                })),
              }
            }),
          }
        }),
      }
    }),
  }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/email/send-registration-email', () => ({
  sendRegistrationConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Mock searchRiderCandidates — returns empty for simplicity
vi.mock('@/lib/actions/rider-match', () => ({
  searchRiderCandidates: vi.fn().mockResolvedValue({ candidates: [] }),
}))

import { registerForEvent } from '@/lib/actions/register'

describe('rider name preservation on email match', () => {
  beforeEach(() => {
    updatePayloads.length = 0
    insertPayloads.length = 0
  })

  it('name mismatch with matching email — does not auto-link, falls through to fuzzy search', async () => {
    await registerForEvent({
      eventId: 'event-123',
      firstName: 'Peter',
      lastName: 'Agelakos',
      email: 'fchagnon@gmail.com',
      phone: '416-555-0000',
      shareRegistration: false,
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '555-1234',
    })

    // "Peter Agelakos" vs "Fred Chagnon" scores < 0.8, so should NOT auto-link.
    // With no fuzzy match candidates mocked, a new rider is created.
    // The key point: Fred Chagnon's rider record is NOT updated.
    const riderUpdate = updatePayloads.find((u) => u.table === 'riders')
    expect(riderUpdate).toBeUndefined()

    // No rider_merges entry from findOrCreateRider (auto-link didn't happen)
    const mergeInsert = insertPayloads.find((i) => i.table === 'rider_merges')
    expect(mergeInsert).toBeUndefined()
  })

  it('name match with matching email — auto-links and updates supplementary fields only', async () => {
    await registerForEvent({
      eventId: 'event-123',
      firstName: 'Fred',
      lastName: 'Chagnon',
      email: 'fchagnon@gmail.com',
      phone: '647-555-0123',
      gender: 'M',
      shareRegistration: false,
      emergencyContactName: 'New Contact',
      emergencyContactPhone: '555-9999',
    })

    // Same name + same email → auto-link
    const riderUpdate = updatePayloads.find((u) => u.table === 'riders')
    expect(riderUpdate).toBeDefined()

    // Should NOT include first_name or last_name
    expect(riderUpdate!.data).not.toHaveProperty('first_name')
    expect(riderUpdate!.data).not.toHaveProperty('last_name')

    // Should update supplementary fields (phones are normalized by server)
    expect(riderUpdate!.data).toMatchObject({
      gender: 'M',
      phone: '647-555-0123',
      emergency_contact_name: 'New Contact',
      emergency_contact_phone: '5559999',
    })

    // No rider_merges entry when name is identical (nothing changed)
    const mergeInsert = insertPayloads.find((i) => i.table === 'rider_merges')
    expect(mergeInsert).toBeUndefined()
  })
})
