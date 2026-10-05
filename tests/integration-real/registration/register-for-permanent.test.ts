import { describe, it, expect, vi, beforeAll, beforeEach, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildPermanentRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'
import { buildRouteTrack } from '@/lib/routeTrack'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')
vi.mock('@/lib/data/route-track')

const IDS = {
  rider: '00000000-1a21-4000-a000-000000000001',
  route: '00000000-1a21-4000-a000-000000000002',
  inactiveRoute: '00000000-1a21-4000-a000-000000000003',
}

// A 20 km out-and-back that closes on itself (a loop), and a 10 km line.
const LOOP_TRACK = buildRouteTrack(
  Array.from({ length: 181 }, (_, i) => ({
    lat: 44 + (i <= 90 ? i : 180 - i) * 0.001,
    lng: -79,
    km: i * 0.1112,
  })),
  20.016
)!
const LINE_TRACK = buildRouteTrack(
  Array.from({ length: 91 }, (_, i) => ({ lat: 44 + i * 0.001, lng: -79, km: i * 0.1112 })),
  10.008
)!

describe('registerForPermanent (real DB)', () => {
  const supabase = getTestSupabase()

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>
  let loadRouteTrack: ReturnType<typeof vi.fn>

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

    const trackMod = await import('@/lib/data/route-track')
    loadRouteTrack = vi.mocked(trackMod.loadRouteTrack)

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
        rwgps_id: '990001',
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

  beforeEach(() => {
    loadRouteTrack.mockReset()
    loadRouteTrack.mockResolvedValue(LOOP_TRACK)
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
      .select('status, rider_id, share_registration, notes, brevet_card_type')
      .eq('event_id', event!.id)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')
    expect(reg?.share_registration).toBe(false)
    expect(reg?.notes).toBeNull()
    expect(reg?.brevet_card_type).toBe('paper')

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

  it('registers with brevetCardType: "digital" — stored as digital', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(37)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, brevetCardType: 'digital' })
    )

    expect(result.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    const { data: reg } = await supabase
      .from('registrations')
      .select('brevet_card_type')
      .eq('event_id', event!.id)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.brevet_card_type).toBe('digital')
  })

  it('registers with an unrecognised brevetCardType — coerced to "paper" server-side', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const eventDate = daysFromNow(38)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        // @ts-expect-error deliberately bogus value to verify server-side coercion
        brevetCardType: 'hologram',
      })
    )

    expect(result.success).toBe(true)

    const expectedSlug = `permanent-inttest-perm-route-${eventDate}`
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('slug', expectedSlug)
      .single()

    const { data: reg } = await supabase
      .from('registrations')
      .select('brevet_card_type')
      .eq('event_id', event!.id)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.brevet_card_type).toBe('paper')
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

    // Reversed rides get a distinct slug (suffixed with -reverse) so they are
    // tracked as a separate event from the as-posted direction.
    const expectedSlug = `permanent-inttest-perm-route-${eventDate}-reverse`
    const { data: event } = await supabase
      .from('events')
      .select('name')
      .eq('slug', expectedSlug)
      .single()

    expect(event!.name).toBe('IntTest Perm Route (Reversed)')
  })

  it('reversed registration creates a distinct event from as_posted (separate slugs)', async () => {
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

    // Same route + date, but the two directions are tracked as separate events:
    // as_posted keeps the plain slug, reversed gets a -reverse suffix.
    const asPostedSlug = `permanent-inttest-perm-route-${eventDate}`
    const reversedSlug = `permanent-inttest-perm-route-${eventDate}-reverse`

    const { data: asPosted } = await supabase
      .from('events')
      .select('id, name')
      .eq('slug', asPostedSlug)
      .single()
    expect(asPosted!.name).toBe('IntTest Perm Route')

    const { data: reversed } = await supabase
      .from('events')
      .select('id, name')
      .eq('slug', reversedSlug)
      .single()
    expect(reversed!.name).toBe('IntTest Perm Route (Reversed)')

    expect(reversed!.id).not.toBe(asPosted!.id)
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

  // --- Ride start: direction, alternate start, one ride per route/date/direction ---

  const member = () =>
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })
  const eventBySlug = async (slug: string) =>
    (
      await supabase
        .from('events')
        .select('id, direction, start_time, start_location, start_offset_km, start_lat, start_lng')
        .eq('slug', slug)
        .single()
    ).data

  it('stores direction, offset, coordinates and place name for an alternate start', async () => {
    member()
    const eventDate = daysFromNow(41)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        direction: 'reversed',
        startOffsetKm: 5.04,
        startLocation: '  Tim Hortons, Uxbridge  ',
      })
    )
    expect(result.success).toBe(true)
    const event = await eventBySlug(`permanent-inttest-perm-route-${eventDate}-reverse`)
    expect(event).toMatchObject({
      direction: 'reversed',
      start_location: 'Tim Hortons, Uxbridge',
      start_offset_km: 5,
    })
    // Coordinates come from the track, not the client.
    expect(event!.start_lat).toBeCloseTo(44.045, 3)
    expect(event!.start_lng).toBe(-79)
    assertEmailPayload(sendEmail, {
      eventLocation: 'Tim Hortons, Uxbridge (5.0 km into the route), riding the route reversed',
    })
  })

  it('stores no start point for a plain registration', async () => {
    member()
    const eventDate = daysFromNow(42)
    const { registerForPermanent } = await import('@/lib/actions/register')
    await registerForPermanent(buildPermanentRegistrationData({ routeId: IDS.route, eventDate }))
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      direction: 'as_posted',
      start_location: null,
      start_offset_km: null,
      start_lat: null,
      start_lng: null,
    })
    expect(loadRouteTrack).not.toHaveBeenCalled()
  })

  it('requires a place name with an alternate start', async () => {
    member()
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(43),
        startOffsetKm: 5,
      })
    )
    expect(result).toMatchObject({ success: false, error: 'Please name your start location' })
  })

  it('refuses an alternate start on a route that is not a loop', async () => {
    member()
    loadRouteTrack.mockResolvedValue(LINE_TRACK)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(44),
        startOffsetKm: 5,
        startLocation: 'Somewhere',
      })
    )
    expect(result).toMatchObject({
      success: false,
      error: 'An alternate start is only available on loop routes',
    })
  })

  it('refuses an alternate start when the route track cannot be loaded', async () => {
    member()
    loadRouteTrack.mockResolvedValue(null)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(45),
        startOffsetKm: 5,
        startLocation: 'Somewhere',
      })
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/could not load the route map/i)
  })

  it('treats an offset at the posted start as no alternate start', async () => {
    member()
    const eventDate = daysFromNow(46)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        startOffsetKm: 0.04,
        startLocation: 'x',
      })
    )
    expect(result.success).toBe(true)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      start_offset_km: null,
      start_location: null,
    })
  })

  it('lets a second rider join with the same start after a database round trip', async () => {
    member()
    const eventDate = daysFromNow(47)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const start = { startTime: '08:00', startOffsetKm: 5, startLocation: 'Tim Hortons' }
    expect(
      (
        await registerForPermanent(
          buildPermanentRegistrationData({ routeId: IDS.route, eventDate, ...start })
        )
      ).success
    ).toBe(true)
    const second = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        ...start,
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(second.success).toBe(true)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('slug', `permanent-inttest-perm-route-${eventDate}`)
    expect(events).toHaveLength(1)
  })

  it('rejects a second rider with a different start and writes nothing', async () => {
    member()
    const eventDate = daysFromNow(48)
    const { registerForPermanent } = await import('@/lib/actions/register')
    await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        startOffsetKm: 5,
        startLocation: 'Tim Hortons',
      })
    )
    const second = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        startTime: '09:30',
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(second.success).toBe(false)
    expect(second.error).toBe(
      'A ride on this route is already registered for this date, starting at 8:00 AM from Tim Hortons (5.0 km into the route). Join it with the same start, or choose another date.'
    )
    const event = await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)
    const { count } = await supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event!.id)
    expect(count).toBe(1)
    expect(event).toMatchObject({ start_time: '08:00:00', start_offset_km: 5 })
  })

  it('two simultaneous first registrations with the same start share one event', async () => {
    member()
    const eventDate = daysFromNow(49)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const results = await Promise.all([
      registerForPermanent(buildPermanentRegistrationData({ routeId: IDS.route, eventDate })),
      registerForPermanent(
        buildPermanentRegistrationData({
          routeId: IDS.route,
          eventDate,
          email: 'new-rider@example.com',
          firstName: 'Another',
          lastName: 'Person',
        })
      ),
    ])
    expect(results.map((r) => r.success)).toEqual([true, true])
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('slug', `permanent-inttest-perm-route-${eventDate}`)
    expect(events).toHaveLength(1)
  })

  it('two simultaneous first registrations with different starts: one wins, one is told why', async () => {
    member()
    const eventDate = daysFromNow(50)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const results = await Promise.all([
      registerForPermanent(
        buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '07:00' })
      ),
      registerForPermanent(
        buildPermanentRegistrationData({
          routeId: IDS.route,
          eventDate,
          startTime: '09:00',
          email: 'new-rider@example.com',
          firstName: 'Another',
          lastName: 'Person',
        })
      ),
    ])
    expect(results.filter((r) => r.success)).toHaveLength(1)
    const loser = results.find((r) => !r.success)!
    expect(loser.error).toMatch(/^A ride on this route is already registered for this date/)
    const { data: events } = await supabase
      .from('events')
      .select('id')
      .eq('slug', `permanent-inttest-perm-route-${eventDate}`)
    expect(events).toHaveLength(1)
  })

  // --- Re-claiming a ride nobody is on ---

  const OTTAWA_CHAPTER_ID = '6c44658e-8f0d-4569-9f79-a5f2d1dd6db6'
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
  const seedRide = async (eventDate: string, fields: Record<string, unknown> = {}) =>
    (await checked(
      supabase
        .from('events')
        .insert({
          slug: `permanent-inttest-perm-route-${eventDate}`,
          name: 'IntTest Perm Route',
          chapter_id: TORONTO_CHAPTER_ID,
          route_id: IDS.route,
          event_type: 'permanent',
          distance_km: 200,
          event_date: eventDate,
          status: 'scheduled',
          start_time: '07:00',
          ...fields,
        })
        .select('id')
        .single(),
      'seed ride'
    ))!.id as string
  const seedControls = async (eventId: string) =>
    (await checked(
      supabase
        .from('event_controls')
        .insert([
          { event_id: eventId, position: 1, name: 'Start', distance_km: 0 },
          { event_id: eventId, position: 2, name: 'Finish', distance_km: 200 },
        ])
        .select('id'),
      'seed controls'
    ))!.map((c: { id: string }) => c.id)
  const controlCount = async (eventId: string) =>
    (
      await supabase
        .from('event_controls')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
    ).count

  it('a rider who cancelled can re-register at a different time', async () => {
    member()
    const eventDate = daysFromNow(51)
    const { registerForPermanent } = await import('@/lib/actions/register')
    expect(
      (
        await registerForPermanent(
          buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '07:00' })
        )
      ).success
    ).toBe(true)
    const event = await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)
    await checked(
      supabase
        .from('registrations')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('event_id', event!.id),
      'cancel registration'
    )

    const again = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '08:00' })
    )
    expect(again.success).toBe(true)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      id: event!.id,
      start_time: '08:00:00',
    })
  })

  it('takes over a ride nobody registered for once it is over 15 minutes old', async () => {
    member()
    const eventDate = daysFromNow(52)
    const eventId = await seedRide(eventDate, { created_at: minutesAgo(20) })
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '08:00' })
    )
    expect(result.success).toBe(true)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      id: eventId,
      start_time: '08:00:00',
    })
  })

  it('does not take over a ride created moments ago (its first rider may be mid-registration)', async () => {
    member()
    const eventDate = daysFromNow(53)
    await seedRide(eventDate)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '08:00' })
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/^A ride on this route is already registered for this date/)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      start_time: '07:00:00',
    })
  })

  it('a takeover that moves the start deletes saved controls nobody has checked in at', async () => {
    member()
    const eventDate = daysFromNow(54)
    const eventId = await seedRide(eventDate, { start_time: '08:00', created_at: minutesAgo(20) })
    await seedControls(eventId)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        startOffsetKm: 5,
        startLocation: 'Tim Hortons',
      })
    )
    expect(result.success).toBe(true)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      id: eventId,
      start_offset_km: 5,
      start_location: 'Tim Hortons',
    })
    expect(await controlCount(eventId)).toBe(0)
  })

  it('refuses a takeover that moves the start when a control has a check-in', async () => {
    member()
    const eventDate = daysFromNow(55)
    const eventId = await seedRide(eventDate, { start_time: '08:00' })
    const [controlId] = await seedControls(eventId)
    const reg = await checked(
      supabase
        .from('registrations')
        .insert({ event_id: eventId, rider_id: IDS.rider, status: 'cancelled' })
        .select('id')
        .single(),
      'seed cancelled registration'
    )
    await checked(
      supabase.from('control_checkins').insert({
        control_id: controlId,
        registration_id: (reg as { id: string }).id,
        checked_in_at: new Date().toISOString(),
        method: 'manual',
      }),
      'seed check-in'
    )
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate,
        startOffsetKm: 5,
        startLocation: 'Tim Hortons',
        email: 'new-rider@example.com',
        firstName: 'Another',
        lastName: 'Person',
      })
    )
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/^A ride on this route is already registered for this date/)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      start_offset_km: null,
    })
    expect(await controlCount(eventId)).toBe(2)
  })

  it('a takeover that changes only the time keeps saved controls', async () => {
    member()
    const eventDate = daysFromNow(56)
    const eventId = await seedRide(eventDate, { created_at: minutesAgo(20) })
    await seedControls(eventId)
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate, startTime: '08:00' })
    )
    expect(result.success).toBe(true)
    expect(await eventBySlug(`permanent-inttest-perm-route-${eventDate}`)).toMatchObject({
      start_time: '08:00:00',
    })
    expect(await controlCount(eventId)).toBe(2)
  })

  it('getExistingPermanentRide hides a ride nobody is on and shows a live one', async () => {
    member()
    const { getExistingPermanentRide } = await import('@/lib/actions/permanent-start')
    const abandonedDate = daysFromNow(57)
    await seedRide(abandonedDate, { created_at: minutesAgo(20) })
    expect(await getExistingPermanentRide(IDS.route, abandonedDate, 'as_posted')).toBeNull()

    const liveDate = daysFromNow(58)
    const { registerForPermanent } = await import('@/lib/actions/register')
    await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: liveDate,
        startOffsetKm: 5,
        startLocation: 'Tim Hortons',
      })
    )
    expect(await getExistingPermanentRide(IDS.route, liveDate, 'as_posted')).toEqual({
      startTime: '08:00',
      startLocation: 'Tim Hortons',
      startOffsetKm: 5,
    })
  })

  it('ignores an event with the same slug in another chapter', async () => {
    member()
    const eventDate = daysFromNow(59)
    const otherId = await seedRide(eventDate, {
      chapter_id: OTTAWA_CHAPTER_ID,
      start_time: '06:00',
    })
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({ routeId: IDS.route, eventDate })
    )
    expect(result.success).toBe(true)
    const { data: own } = await supabase
      .from('events')
      .select('id, start_time')
      .eq('slug', `permanent-inttest-perm-route-${eventDate}`)
      .eq('chapter_id', TORONTO_CHAPTER_ID)
      .single()
    expect(own!.id).not.toBe(otherId)
    expect(own!.start_time).toBe('08:00:00')
  })

  it('rejects a start time that is not HH:MM', async () => {
    const { registerForPermanent } = await import('@/lib/actions/register')
    const result = await registerForPermanent(
      buildPermanentRegistrationData({
        routeId: IDS.route,
        eventDate: daysFromNow(60),
        startTime: '8:00',
      })
    )
    expect(result).toMatchObject({ success: false, error: 'Please enter a start time as HH:MM' })
  })
})
