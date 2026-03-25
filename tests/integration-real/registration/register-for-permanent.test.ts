import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildPermanentRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a21-4000-a000-000000000001',
  route: '00000000-1a21-4000-a000-000000000002',
  inactiveRoute: '00000000-1a21-4000-a000-000000000003',
}

describe('registerForPermanent (real DB)', () => {
  const supabase = getTestSupabase()

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)
    sendEmail.mockResolvedValue({ success: true })

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
    searchRiderCandidates.mockResolvedValue({ candidates: [] })

    // Clean up
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('rider_memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    await supabase.from('registrations').delete().eq('rider_id', IDS.rider)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    // Clean up trial-used temp event (slug doesn't match permanent-* pattern)
    await supabase.from('results').delete().eq('event_id', '00000000-1a21-4000-a000-000000000010')
    await supabase
      .from('registrations')
      .delete()
      .eq('event_id', '00000000-1a21-4000-a000-000000000010')
    await supabase.from('events').delete().eq('id', '00000000-1a21-4000-a000-000000000010')
    await supabase.from('routes').delete().in('id', [IDS.route, IDS.inactiveRoute])
    await supabase.from('riders').delete().eq('id', IDS.rider)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-perm-rider',
        first_name: 'Test',
        last_name: 'Rider',
        email: 'test-rider@example.com',
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-perm-route',
        name: 'IntTest Perm Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.inactiveRoute,
        slug: 'inttest-perm-inactive',
        name: 'IntTest Inactive Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 100,
        is_active: false,
      }),
      'insert inactive route'
    )
  })

  afterEach(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('rider_memberships').delete().eq('rider_id', IDS.rider)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
    vi.resetAllMocks()
    sendEmail.mockResolvedValue({ success: true })
    searchRiderCandidates.mockResolvedValue({ candidates: [] })
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().eq('rider_id', IDS.rider)
    await supabase.from('rider_memberships').delete().eq('rider_id', IDS.rider)
    await supabase.from('results').delete().eq('rider_id', IDS.rider)
    await supabase.from('registrations').delete().eq('rider_id', IDS.rider)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .like('slug', 'permanent-inttest-perm-route%')
    if (events && events.length > 0) {
      const eventIds = events.map((e: { id: string }) => e.id)
      await supabase.from('registrations').delete().in('event_id', eventIds)
      await supabase.from('events').delete().in('id', eventIds)
    }
    // Clean up trial-used temp event
    await supabase.from('results').delete().eq('event_id', '00000000-1a21-4000-a000-000000000010')
    await supabase
      .from('registrations')
      .delete()
      .eq('event_id', '00000000-1a21-4000-a000-000000000010')
    await supabase.from('events').delete().eq('id', '00000000-1a21-4000-a000-000000000010')
    await supabase.from('routes').delete().in('id', [IDS.route, IDS.inactiveRoute])
    await supabase.from('riders').delete().eq('id', IDS.rider)
    await supabase.from('riders').delete().eq('email', 'new-rider@example.com')
  })

  // --- Happy path ---

  it('registers with valid route and future date — creates event and registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(30)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id, slug, name, distance_km, event_type, status')
      .eq('slug', expectedSlug)
      .single()

    expect(event).toBeTruthy()
    expect(event!.name).toBe('IntTest Perm Route')
    expect(event!.distance_km).toBe(200)
    expect(event!.event_type).toBe('permanent')
    expect(event!.status).toBe('scheduled')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id, share_registration, notes')
      .eq('event_id', event!.id)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')
    expect(reg?.share_registration).toBe(false)
    expect(reg?.notes).toBeNull()

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Test Rider',
      registrantEmail: 'test-rider@example.com',
      eventName: 'IntTest Perm Route',
      eventDistance: 200,
      eventType: 'Permanent',
    })
    assertManagementUrl(sendEmail)
  })

  it('second registration for same route+date reuses existing event', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(31)
    const { registerForPermanent } = await import('@/lib/actions/register')

    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result1.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(result2.success).toBe(true)

    const { data: events } = await supabase.from('events').select('id').eq('slug', expectedSlug)
    expect(events).toHaveLength(1)
    expect(events![0].id).toBe(event!.id)
  })

  // --- Validation ---

  it('ride date of today returns error (deadline already passed)', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(0),
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('8 p.m.')
  })

  it('invalid route ID returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: '00000000-0000-0000-0000-000000000000',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Record not found')
  })

  it('inactive route returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.inactiveRoute })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Record not found')
  })

  it('missing required fields returns error', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, firstName: '' })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })

  // --- Event creation ---

  it('reversed direction creates event with (Reversed) in name', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(32)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        direction: 'reversed',
      })
    )

    expect(result.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('slug', expectedSlug)
      .single()

    expect(event!.name).toBe('IntTest Perm Route (Reversed)')
  })

  it('reversed registration reuses event created by as_posted (same slug)', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(36)
    const { registerForPermanent } = await import('@/lib/actions/register')

    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, direction: 'as_posted' })
    )
    expect(result1.success).toBe(true)

    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        direction: 'reversed',
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(result2.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: events } = await supabase.from('events').select('id').eq('slug', expectedSlug)
    expect(events).toHaveLength(1)
  })

  // --- Membership flows ---

  it('no membership — incomplete registration with none email status', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const eventDate = daysFromNow(33)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', event!.id)
      .single()
    expect(reg?.status).toBe('incomplete: membership')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'none' })
  })

  it('trial used — incomplete registration with trial-used email status', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 99,
      type: 'Trial Member',
      city: 'Toronto',
      country: 'Canada',
    })
    const tempEventId = '00000000-1a21-4000-a000-000000000010'
    await checked(
      supabase.from('events').insert({
        id: tempEventId,
        slug: 'inttest-perm-trial-check',
        name: 'Temp',
        chapter_id: TORONTO_CHAPTER_ID,
        route_id: IDS.route,
        event_type: 'permanent',
        distance_km: 200,
        event_date: daysFromNow(-7),
        status: 'completed',
      }),
      'insert temp completed event'
    )
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a21-4000-a000-000000000011',
        rider_id: IDS.rider,
        event_id: tempEventId,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const eventDate = daysFromNow(34)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('trial-used')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, { membershipStatus: 'trial-used' })

    // Clean up temp event and result
    await supabase.from('results').delete().eq('id', '00000000-1a21-4000-a000-000000000011')
    await supabase.from('registrations').delete().eq('event_id', tempEventId)
    await supabase.from('events').delete().eq('id', tempEventId)
  })

  // --- Duplicate ---

  it('duplicate registration returns permanent-specific error', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(35)
    const { registerForPermanent } = await import('@/lib/actions/register')

    const result1 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result1.success).toBe(true)

    const result2 = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result2.success).toBe(false)
    expect(result2.error).toContain('already registered')
  })
})
