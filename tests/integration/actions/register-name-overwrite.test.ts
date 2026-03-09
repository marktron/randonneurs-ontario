import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression test: registering with an existing rider's email must NOT
 * overwrite that rider's name. This was a production bug where a different
 * person used the same email and silently replaced the original rider's name.
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
          // Rider lookup by email or id
          if (currentTable === 'riders' && (col === 'email' || col === 'id')) {
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

import { registerForEvent } from '@/lib/actions/register'

describe('rider name preservation on email match', () => {
  beforeEach(() => {
    updatePayloads.length = 0
    insertPayloads.length = 0
  })

  it('does not include first_name or last_name when updating an existing rider found by email', async () => {
    await registerForEvent({
      eventId: 'event-123',
      firstName: 'Peter',
      lastName: 'Agelakos',
      email: 'fchagnon@gmail.com',
      shareRegistration: false,
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '555-1234',
    })

    const riderUpdate = updatePayloads.find((u) => u.table === 'riders')
    expect(riderUpdate).toBeDefined()
    expect(riderUpdate!.data).not.toHaveProperty('first_name')
    expect(riderUpdate!.data).not.toHaveProperty('last_name')
  })

  it('still updates gender and emergency contact fields', async () => {
    await registerForEvent({
      eventId: 'event-123',
      firstName: 'Peter',
      lastName: 'Agelakos',
      email: 'fchagnon@gmail.com',
      gender: 'M',
      shareRegistration: false,
      emergencyContactName: 'New Contact',
      emergencyContactPhone: '555-9999',
    })

    const riderUpdate = updatePayloads.find((u) => u.table === 'riders')
    expect(riderUpdate).toBeDefined()
    expect(riderUpdate!.data).toMatchObject({
      gender: 'M',
      emergency_contact_name: 'New Contact',
      emergency_contact_phone: '555-9999',
    })
  })

  it('creates a rider_merges audit entry with submitted and previous names', async () => {
    await registerForEvent({
      eventId: 'event-123',
      firstName: 'Peter',
      lastName: 'Agelakos',
      email: 'fchagnon@gmail.com',
      shareRegistration: false,
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '555-1234',
    })

    const mergeInsert = insertPayloads.find((i) => i.table === 'rider_merges')
    expect(mergeInsert).toBeDefined()
    expect(mergeInsert!.data).toMatchObject({
      rider_id: 'rider-fred',
      submitted_first_name: 'Peter',
      submitted_last_name: 'Agelakos',
      submitted_email: 'fchagnon@gmail.com',
      previous_first_name: 'Fred',
      previous_last_name: 'Chagnon',
      previous_email: 'fchagnon@gmail.com',
      merge_source: 'registration',
    })
  })
})
