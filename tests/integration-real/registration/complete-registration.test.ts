import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import {
  TORONTO_CHAPTER_ID,
  daysFromNow,
  buildCompleteRegistrationData,
  assertEmailPayload,
  assertManagementUrl,
} from './helpers'

vi.mock('@/lib/email/send-registration-email')
vi.mock('@/lib/ccn/client')
vi.mock('@/lib/actions/rider-match')

const IDS = {
  rider: '00000000-1a22-4000-a000-000000000001',
  route: '00000000-1a22-4000-a000-000000000002',
  scheduledEvent: '00000000-1a22-4000-a000-000000000003',
  completedEvent: '00000000-1a22-4000-a000-000000000004',
}

describe('completeRegistrationWithRider (real DB)', () => {
  const supabase = getTestSupabase()
  const futureDate = daysFromNow(30)
  const pastDate = daysFromNow(-7)

  let sendEmail: ReturnType<typeof vi.fn>
  let searchCCNMembership: ReturnType<typeof vi.fn>
  let searchRiderCandidates: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_CURRENT_SEASON = '2026'

    const emailMod = await import('@/lib/email/send-registration-email')
    sendEmail = vi.mocked(emailMod.sendRegistrationConfirmationEmail)

    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    const matchMod = await import('@/lib/actions/rider-match')
    searchRiderCandidates = vi.mocked(matchMod.searchRiderCandidates)
    searchRiderCandidates.mockResolvedValue({ candidates: [] })

    // sendRegistrationConfirmationEmail must return a Promise so .catch() works
    sendEmail.mockResolvedValue({ success: true })

    // Clean up
    const riderIds = [IDS.rider]
    await supabase.from('rider_merges').delete().in('rider_id', riderIds)
    await supabase.from('rider_memberships').delete().in('rider_id', riderIds)
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', riderIds)

    // Seed
    await checked(
      supabase.from('riders').insert({
        id: IDS.rider,
        slug: 'inttest-complete-rider',
        first_name: 'Existing',
        last_name: 'Rider',
        email: null, // No email — simulates rider found by fuzzy match
      }),
      'insert rider'
    )

    await checked(
      supabase.from('routes').insert({
        id: IDS.route,
        slug: 'inttest-complete-route',
        name: 'IntTest Complete Route',
        chapter_id: TORONTO_CHAPTER_ID,
        distance_km: 200,
        is_active: true,
      }),
      'insert route'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.scheduledEvent,
        slug: `inttest-complete-brevet-${futureDate}`,
        name: 'IntTest Complete Brevet',
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
        slug: `inttest-complete-completed-${pastDate}`,
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
    await supabase.from('rider_merges').delete().in('rider_id', [IDS.rider])
    // Also clean merges for any newly created riders
    const { data: newRiders } = await supabase
      .from('riders')
      .select('id')
      .eq('email', 'completer@example.com')
    if (newRiders && newRiders.length > 0) {
      await supabase
        .from('rider_merges')
        .delete()
        .in(
          'rider_id',
          newRiders.map((r: { id: string }) => r.id)
        )
    }
    await supabase.from('rider_memberships').delete().in('rider_id', [IDS.rider])
    await supabase.from('results').delete().in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    // Restore seeded rider BEFORE deleting by email, in case it was updated with completer@example.com
    await supabase
      .from('riders')
      .update({
        first_name: 'Existing',
        last_name: 'Rider',
        email: null,
        gender: null,
        emergency_contact_name: null,
        emergency_contact_phone: null,
      })
      .eq('id', IDS.rider)
    // Delete newly created riders (exclude the seeded rider which has been restored above)
    await supabase.from('riders').delete().eq('email', 'completer@example.com').neq('id', IDS.rider)
    vi.resetAllMocks()
    // Re-set mocks after resetAllMocks (critical — without this, .catch() on undefined throws)
    sendEmail.mockResolvedValue({ success: true })
    searchRiderCandidates.mockResolvedValue({ candidates: [] })
  })

  afterAll(async () => {
    await supabase.from('rider_merges').delete().in('rider_id', [IDS.rider])
    await supabase.from('rider_memberships').delete().in('rider_id', [IDS.rider])
    await supabase.from('results').delete().in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase
      .from('registrations')
      .delete()
      .in('event_id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('events').delete().in('id', [IDS.scheduledEvent, IDS.completedEvent])
    await supabase.from('routes').delete().eq('id', IDS.route)
    await supabase.from('riders').delete().in('id', [IDS.rider])
    await supabase.from('riders').delete().eq('email', 'completer@example.com')
  })

  // --- Update existing rider ---

  it('selectedRiderId provided — updates rider, creates registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Existing',
        lastName: 'Rider',
      })
    )

    expect(result.success).toBe(true)

    // Rider should be updated with email (name stays the same)
    const { data: rider } = await supabase
      .from('riders')
      .select('first_name, last_name, email')
      .eq('id', IDS.rider)
      .single()

    expect(rider).toMatchObject({
      first_name: 'Existing',
      last_name: 'Rider',
      email: 'completer@example.com',
    })

    // Registration created
    const { data: reg } = await supabase
      .from('registrations')
      .select('status, rider_id, share_registration, notes')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
      .single()
    expect(reg?.status).toBe('registered')
    expect(reg?.share_registration).toBe(false)
    expect(reg?.notes).toBeNull()

    // Email sent
    expect(sendEmail).toHaveBeenCalledTimes(1)
    assertEmailPayload(sendEmail, {
      membershipStatus: 'valid',
      registrantName: 'Existing Rider',
      registrantEmail: 'completer@example.com',
      eventName: 'IntTest Complete Brevet',
      eventDistance: 200,
      eventLocation: 'Test Start',
    })
    assertManagementUrl(sendEmail)
  })

  it('selectedRiderId with mismatched name — returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Completely',
        lastName: 'Different',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Selected rider does not match the submitted name')
  })

  it('creates rider_merges audit entry with before/after fields', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Existing',
        lastName: 'Rider',
      })
    )

    const { data: merges } = await supabase
      .from('rider_merges')
      .select(
        'submitted_first_name, submitted_last_name, submitted_email, previous_first_name, previous_last_name, previous_email, merge_source'
      )
      .eq('rider_id', IDS.rider)

    expect(merges).toHaveLength(1)
    expect(merges![0]).toMatchObject({
      submitted_first_name: 'Existing',
      submitted_last_name: 'Rider',
      submitted_email: 'completer@example.com',
      previous_first_name: 'Existing',
      previous_last_name: 'Rider',
      previous_email: null,
      merge_source: 'registration',
    })
  })

  // --- Create new rider ---

  it('selectedRiderId null — creates new rider and registration', async () => {
    searchCCNMembership.mockResolvedValue({
      found: true,
      membershipId: 42,
      type: 'Individual Membership',
      city: 'Toronto',
      country: 'Canada',
    })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: null,
        email: 'completer@example.com',
        firstName: 'Brand',
        lastName: 'New',
      })
    )

    expect(result.success).toBe(true)

    // New rider should exist
    const { data: rider } = await supabase
      .from('riders')
      .select('first_name, last_name, email, slug')
      .eq('email', 'completer@example.com')
      .single()

    expect(rider).toBeTruthy()
    expect(rider!.first_name).toBe('Brand')
    expect(rider!.last_name).toBe('New')
    expect(rider!.slug).toMatch(/^completer-[a-z0-9]+$/)

    // Verify registration exists for this event
    const { data: allRegs } = await supabase
      .from('registrations')
      .select('status, rider_id')
      .eq('event_id', IDS.scheduledEvent)
    expect(allRegs).toHaveLength(1)
    expect(allRegs![0].status).toBe('registered')
  })

  // --- Membership handling ---

  it('no membership — incomplete registration', async () => {
    searchCCNMembership.mockResolvedValue({ found: false })

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Existing',
        lastName: 'Rider',
      })
    )

    expect(result.success).toBe(false)
    expect(result.membershipError).toBe('no-membership')

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('event_id', IDS.scheduledEvent)
      .eq('rider_id', IDS.rider)
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
    // Seed a prior finished result to mark trial as used
    await checked(
      supabase.from('results').insert({
        id: '00000000-1a22-4000-a000-000000000010',
        rider_id: IDS.rider,
        event_id: IDS.completedEvent,
        status: 'finished',
        season: 2026,
        distance_km: 200,
      }),
      'insert finished result for trial'
    )

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: IDS.rider,
        email: 'completer@example.com',
        firstName: 'Existing',
        lastName: 'Rider',
      })
    )

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
  })

  it('CCN error — throws unhandled rejection', async () => {
    searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

    const { completeRegistrationWithRider } = await import('@/lib/actions/register')

    await expect(
      completeRegistrationWithRider(
        buildCompleteRegistrationData({
          eventId: IDS.scheduledEvent,
          selectedRiderId: IDS.rider,
          email: 'completer@example.com',
          firstName: 'Existing',
          lastName: 'Rider',
        })
      )
    ).rejects.toThrow('CCN API error')
  })

  // --- Validation ---

  it('event not found returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: '00000000-0000-0000-0000-000000000000',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Event not found')
  })

  it('completed event returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.completedEvent,
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Registration is not open for this event')
  })

  it('invalid selectedRiderId returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        selectedRiderId: '00000000-0000-0000-0000-000000000000',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Selected rider not found')
  })

  it('missing required fields returns error', async () => {
    const { completeRegistrationWithRider } = await import('@/lib/actions/register')
    const result = await completeRegistrationWithRider(
      buildCompleteRegistrationData({
        eventId: IDS.scheduledEvent,
        firstName: '',
        email: 'completer@example.com',
      })
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Missing required fields')
  })
})
