import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression coverage for the brevet_card_type preference: the server must
 * write whatever valid value the client sends, and coerce anything else
 * (including omission) to the 'paper' default — never trust the client's
 * value directly (see lib/brevet-card.ts normalizeBrevetCardType).
 *
 * Modeled on register-name-overwrite.test.ts's full-chain supabase mock,
 * but with the rider-matching and membership-lookup steps stubbed out
 * directly (findOrCreateRider, getMembershipForRider) since this test only
 * cares about the registrations INSERT payload.
 */

const insertPayloads: Array<{ table: string; data: Record<string, unknown> }> = []

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

vi.mock('@/lib/supabase-server', () => {
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

      return {
        from: vi.fn((table: string) => {
          currentTable = table
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string) => {
                if (currentTable === 'events' && col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({ data: SCHEDULED_EVENT, error: null }),
                  }
                }
                return fallback
              }),
            })),
            insert: vi.fn((data: Record<string, unknown>) => {
              insertPayloads.push({ table: currentTable, data: { ...data } })
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { management_token: 'tok-abc' },
                    error: null,
                  }),
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

// Skip rider matching entirely — always resolve to a fixed rider.
vi.mock('@/lib/actions/registration/rider', () => ({
  findOrCreateRider: vi.fn().mockResolvedValue({ success: true, riderId: 'rider-1' }),
  insertNewRider: vi.fn(),
}))

// No membership on file — finalizeRegistration still writes the registration
// row (status 'incomplete: membership'), which is all this test needs.
vi.mock('@/lib/memberships/service', () => ({
  getMembershipForRider: vi.fn().mockResolvedValue({ found: false }),
  isTrialUsed: vi.fn().mockResolvedValue(false),
}))

import { registerForEvent } from '@/lib/actions/register'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'

function baseData(overrides: Record<string, unknown> = {}) {
  return {
    eventId: 'event-123',
    firstName: 'Dana',
    lastName: 'Digital',
    email: 'dana.digital@example.com',
    phone: '416-555-0000',
    shareRegistration: false,
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-1234',
    ...overrides,
  }
}

describe('registerForEvent — brevet_card_type', () => {
  beforeEach(() => {
    insertPayloads.length = 0
  })

  it('stores brevet_card_type: "digital" when the client requests a digital card', async () => {
    await registerForEvent(
      baseData({ email: 'digital-case@example.com', brevetCardType: 'digital' })
    )

    const registrationInsert = insertPayloads.find((p) => p.table === 'registrations')
    expect(registrationInsert?.data).toMatchObject({ brevet_card_type: 'digital' })
  })

  it('defaults to "paper" when brevetCardType is omitted', async () => {
    await registerForEvent(baseData({ email: 'omitted-case@example.com' }))

    const registrationInsert = insertPayloads.find((p) => p.table === 'registrations')
    expect(registrationInsert?.data).toMatchObject({ brevet_card_type: 'paper' })
  })

  it('coerces an unrecognised value to "paper" rather than trusting the client', async () => {
    await registerForEvent(
      baseData({ email: 'bogus-case@example.com', brevetCardType: 'hologram' })
    )

    const registrationInsert = insertPayloads.find((p) => p.table === 'registrations')
    expect(registrationInsert?.data).toMatchObject({ brevet_card_type: 'paper' })
  })
})

describe('registerForEvent — confirmation email digital card link', () => {
  beforeEach(() => {
    vi.mocked(sendRegistrationConfirmationEmail).mockClear()
  })

  it.each([
    ['paper', 'paper-link@example.com'],
    ['digital', 'digital-link@example.com'],
  ])('includes the /card/<token> link for a %s-card rider', async (brevetCardType, email) => {
    await registerForEvent(baseData({ email, brevetCardType }))

    // emailBase.eventType is the display string ('Brevet'), not the DB value —
    // the link must survive that.
    expect(sendRegistrationConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'Brevet',
        digitalCardUrl: expect.stringMatching(/\/card\/[^/]+$/),
      })
    )
  })
})
