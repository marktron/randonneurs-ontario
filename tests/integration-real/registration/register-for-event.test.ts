import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a20-4000-a000-000000000001',
  route: '00000000-1a20-4000-a000-000000000002',
  scheduledEvent: '00000000-1a20-4000-a000-000000000003',
  completedEvent: '00000000-1a20-4000-a000-000000000004',
  membership: '00000000-1a20-4000-a000-000000000005',
}

describe('registerForEvent (real DB)', () => {
  const supabase = getTestSupabase()
  const futureDate = daysFromNow(30)
  const pastDate = daysFromNow(-7)

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    // Set up mocks
    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
    searchRiderCandidates.mockResolvedValue({ candidates: [] })

    // sendRegistrationConfirmationEmail must return a Promise so .catch() works
    sendEmail.mockResolvedValue({ success: true })

    // Clean up leftover test data
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-reg-rider',
        first_name: 'Test',
        last_name: 'Rider',
        email: 'test-rider@example.com',
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-reg-route',
        name: 'IntTest Reg Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-reg-brevet-200km-${futureDate}`,
        name: 'IntTest Reg Brevet',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: futureDate,
        start_time: '08:00',
        start_location: 'Test Start',
        status: 'scheduled',
      }),
      'insert scheduled event'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.completedEvent,
        slug: `inttest-reg-completed-200km-${pastDate}`,
        name: 'IntTest Completed Event',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'brevet',
        distance_km: 200,
        event_date: pastDate,
        status: 'completed',
      }),
      'insert completed event'
    )
  })

  afterEach(async () => {
    // Clean up per-test data
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    // Delete riders created during tests (but not the seeded rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    await supabase.from('riders').delete().eq('email', 'other@example.com')
    vi.resetAllMocks()
    // Re-establish default mocks after reset
    searchRiderCandidates.mockResolvedValue({ candidates: [] })
    sendEmail.mockResolvedValue({ success: true })
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('memberships').delete().eq('rider_id', IDS.rider)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().eq('id', IDS.rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    await supabase.from('riders').delete().eq('email', 'other@example.com')
  })

  it('registers with valid membership — success, email with membershipStatus valid', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
    })

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(true)

    // Verify registration in DB
    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')

    // Verify email
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Test Rider',
      eventName: 'IntTest Reg Brevet',
      eventDistance: 200,
    })
    assertManagementUrl(sendEmail)
  })

  it('CCN returns not-found — incomplete membership, email with none', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    // Verify incomplete registration in DB
    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    // Email still sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'none' })
  })

  it('trial member with trial used — incomplete membership, email with trial-used', async () => {
    // Set up: rider has a Trial Member membership
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Trial Member',
    })
    // And a prior finished result (trial used)
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a20-4000-a000-000000000010',
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('trial-used')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'trial-used' })

    // Clean up the result
    await supabase.from('results').delete().eq('id', '00000000-1a20-4000-a000-000000000010')
  })

  it('CCN API throws — returns Registration failed, no registration created', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

    const { registerForEvent } = await import('@/lib/actions/register')
    const result = await registerForEvent(buildRegistrationData({ eventId: IDS.scheduledEvent }))

    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration failed')

    // No registration should exist
    const { data: regs } = await supabase
      .from('registrations')
      .select('id')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
    expect(regs).toEqual([])

    // No email sent
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
