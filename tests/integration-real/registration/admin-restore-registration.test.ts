import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './helpers'
import { addRegistration, adminRestoreRegistration } from '@/lib/actions/results'
import { getCurrentSeason } from '@/lib/season'

// Admin actions run with no auth session, and audit_logs.admin_id has a
// NOT NULL FK to admins(id) — mock both so the actions run against the real DB.
vi.mock('@/lib/auth/get-admin', () => ({
  getAdmin: vi.fn(async () => ({ id: '00000000-7e57-4000-a000-0000000000ad' })),
  requireAdmin: vi.fn(async () => ({ id: '00000000-7e57-4000-a000-0000000000ad' })),
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => {}),
}))
// addRegistration/adminRestoreRegistration now resolve membership status via
// getMembershipForRider, which falls through to the CCN client when there is
// no cached rider_memberships row.
vi.mock('@/lib/ccn/client')

const IDS = {
  event: '00000000-7e57-4000-a000-000000000001',
  eventOther: '00000000-7e57-4000-a000-00000000000b',
  riderCancelled: '00000000-7e57-4000-a000-000000000002',
  riderActive: '00000000-7e57-4000-a000-000000000003',
  riderIncomplete: '00000000-7e57-4000-a000-000000000004',
  regCancelled: '00000000-7e57-4000-a000-000000000005',
  regActive: '00000000-7e57-4000-a000-000000000006',
  regIncomplete: '00000000-7e57-4000-a000-000000000007',
  riderNew: '00000000-7e57-4000-a000-000000000008',
  riderCached: '00000000-7e57-4000-a000-000000000009',
  riderTrialUsed: '00000000-7e57-4000-a000-00000000000a',
  regTrialUsedOther: '00000000-7e57-4000-a000-00000000000c',
}

const EMAILS = {
  cancelled: 'inttest-restore-cancelled@example.com',
  active: 'inttest-restore-active@example.com',
  incomplete: 'inttest-restore-incomplete@example.com',
  new: 'inttest-restore-new@example.com',
  cached: 'inttest-restore-cached@example.com',
  trialUsed: 'inttest-restore-trialused@example.com',
}

const EVENT_SLUG_PREFIX = 'inttest-restore-reg-'
const EVENT_OTHER_SLUG_PREFIX = 'inttest-restore-reg-other-'

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const riderIds = [
    IDS.riderCancelled,
    IDS.riderActive,
    IDS.riderIncomplete,
    IDS.riderNew,
    IDS.riderCached,
    IDS.riderTrialUsed,
  ]
  await supabase.from('registrations').delete().in('event_id', [IDS.event, IDS.eventOther])
  await supabase.from('results').delete().in('event_id', [IDS.event, IDS.eventOther])
  await supabase.from('rider_memberships').delete().in('rider_id', riderIds)
  await supabase.from('events').delete().in('id', [IDS.event, IDS.eventOther])
  // Also by natural key: the slug embeds a relative date, so leftovers from an
  // interrupted run on another day carry our id but a different slug.
  await supabase.from('events').delete().ilike('slug', `${EVENT_SLUG_PREFIX}%`)
  await supabase.from('events').delete().ilike('slug', `${EVENT_OTHER_SLUG_PREFIX}%`)
  await supabase.from('riders').delete().in('id', riderIds)
  for (const email of Object.values(EMAILS)) {
    await supabase.from('riders').delete().ilike('email', email)
  }
}

describe('admin membership-aware registration writes (real DB)', () => {
  const supabase = getTestSupabase()
  const eventDate = daysFromNow(21)
  const otherEventDate = daysFromNow(25)
  const currentSeason = getCurrentSeason()

  let searchCCNMembership: ReturnType<typeof vi.fn>

  beforeAll(async () => {
    const ccnMod = await import('@/lib/ccn/client')
    searchCCNMembership = vi.mocked(ccnMod.searchCCNMembership)

    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderCancelled,
          slug: 'inttest-restore-cancelled',
          first_name: 'Cancelled',
          last_name: 'Rider',
          email: EMAILS.cancelled,
        },
        {
          id: IDS.riderActive,
          slug: 'inttest-restore-active',
          first_name: 'Active',
          last_name: 'Rider',
          email: EMAILS.active,
        },
        {
          id: IDS.riderIncomplete,
          slug: 'inttest-restore-incomplete',
          first_name: 'Incomplete',
          last_name: 'Rider',
          email: EMAILS.incomplete,
        },
        {
          id: IDS.riderNew,
          slug: 'inttest-restore-new',
          first_name: 'Brand',
          last_name: 'New',
          email: EMAILS.new,
        },
        {
          id: IDS.riderCached,
          slug: 'inttest-restore-cached',
          first_name: 'Cached',
          last_name: 'Member',
          email: EMAILS.cached,
        },
        {
          id: IDS.riderTrialUsed,
          slug: 'inttest-restore-trialused',
          first_name: 'Trial',
          last_name: 'Used',
          email: EMAILS.trialUsed,
        },
      ]),
      'seed riders'
    )

    await checked(
      supabase.from('events').insert([
        {
          id: IDS.event,
          name: 'Restore Registration Test 200',
          slug: `${EVENT_SLUG_PREFIX}${eventDate}`,
          chapter_id: TORONTO_CHAPTER_ID,
          event_date: eventDate,
          start_time: '07:00',
          distance_km: 200,
          event_type: 'brevet',
          status: 'scheduled',
        },
        {
          id: IDS.eventOther,
          name: 'Restore Registration Test Other 300',
          slug: `${EVENT_OTHER_SLUG_PREFIX}${otherEventDate}`,
          chapter_id: TORONTO_CHAPTER_ID,
          event_date: otherEventDate,
          start_time: '07:00',
          distance_km: 300,
          event_type: 'brevet',
          status: 'scheduled',
        },
      ]),
      'seed events'
    )

    // riderCached has a cached non-Trial membership for the current season —
    // getMembershipForRider must return it without calling CCN.
    await checked(
      supabase.from('rider_memberships').insert({
        rider_id: IDS.riderCached,
        season: currentSeason,
        membership_type: 'Individual Membership',
      }),
      'seed cached membership'
    )

    // riderTrialUsed already has an upcoming 'registered' registration on a
    // different event — isTrialUsed() treats that as the trial already spent.
    await checked(
      supabase.from('registrations').insert({
        id: IDS.regTrialUsedOther,
        event_id: IDS.eventOther,
        rider_id: IDS.riderTrialUsed,
        status: 'registered',
        share_registration: true,
      }),
      'seed trial-used evidence registration'
    )
  })

  beforeEach(async () => {
    searchCCNMembership.mockReset()
    searchCCNMembership.mockResolvedValue({ found: false })

    // getMembershipForRider caches into rider_memberships on a CCN hit, so a
    // rider reused across scenarios (found now / still missing / CCN throws)
    // must lose that cache between tests, or a later "still missing" case
    // would see the earlier test's cached membership instead of calling CCN.
    // riderCached keeps its seeded row on purpose — it is never cleared here.
    await supabase
      .from('rider_memberships')
      .delete()
      .in('rider_id', [IDS.riderCancelled, IDS.riderIncomplete, IDS.riderNew, IDS.riderTrialUsed])

    // Reset registration rows for the primary event so each test starts from
    // the same state and the suite is order-independent (and rerunnable).
    await supabase.from('registrations').delete().eq('event_id', IDS.event)
    await checked(
      supabase.from('registrations').insert([
        {
          id: IDS.regCancelled,
          event_id: IDS.event,
          rider_id: IDS.riderCancelled,
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          share_registration: true,
          notes: 'original notes',
        },
        {
          id: IDS.regActive,
          event_id: IDS.event,
          rider_id: IDS.riderActive,
          status: 'registered',
          cancelled_at: null,
          share_registration: true,
          notes: null,
        },
        {
          id: IDS.regIncomplete,
          event_id: IDS.event,
          rider_id: IDS.riderIncomplete,
          status: 'incomplete: membership',
          cancelled_at: null,
          share_registration: true,
          notes: null,
        },
      ]),
      'seed registrations'
    )
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  describe('addRegistration', () => {
    it('revives a cancelled registration instead of reporting a duplicate', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 1,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderCancelled })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('valid')

      const { data } = await supabase
        .from('registrations')
        .select('id, status, cancelled_at, management_token')
        .eq('id', IDS.regCancelled)
        .single()

      const row = data as {
        id: string
        status: string
        cancelled_at: string | null
        management_token: string | null
      }
      expect(row.status).toBe('registered')
      expect(row.cancelled_at).toBeNull()
      expect(row.management_token).toBeTruthy()

      // No second row — the unique (event_id, rider_id) row was reused.
      const { count } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderCancelled)
      expect(count).toBe(1)
    })

    it('revives an incomplete-membership registration to registered when membership now exists', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 2,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderIncomplete })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('valid')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('id', IDS.regIncomplete)
        .single()
      expect((data as { status: string }).status).toBe('registered')
    })

    it('keeps an incomplete-membership registration incomplete when membership is still missing', async () => {
      searchCCNMembership.mockResolvedValue({ found: false })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderIncomplete })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('none')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('id', IDS.regIncomplete)
        .single()
      expect((data as { status: string }).status).toBe('incomplete: membership')
    })

    it('still reports a duplicate for an active registration', async () => {
      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderActive })

      expect(res.success).toBe(false)
      expect(res.error).toBe('This rider is already registered for this event')
      // Duplicate short-circuits before any membership check is needed.
      expect(searchCCNMembership).not.toHaveBeenCalled()
    })

    it('regenerates a management token that was nulled on cancellation', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 3,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      await checked(
        supabase
          .from('registrations')
          .update({ management_token: null })
          .eq('id', IDS.regCancelled),
        'null out management_token'
      )

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderCancelled })
      expect(res.success).toBe(true)

      const { data } = await supabase
        .from('registrations')
        .select('management_token')
        .eq('id', IDS.regCancelled)
        .single()
      expect((data as { management_token: string | null }).management_token).toBeTruthy()
    })

    it('adds a new rider with no membership on file as incomplete', async () => {
      searchCCNMembership.mockResolvedValue({ found: false })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderNew })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('none')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderNew)
        .single()
      expect((data as { status: string }).status).toBe('incomplete: membership')
    })

    it('adds a rider with a cached current-season membership as registered, without calling CCN', async () => {
      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderCached })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('valid')
      expect(searchCCNMembership).not.toHaveBeenCalled()

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderCached)
        .single()
      expect((data as { status: string }).status).toBe('registered')
    })

    it('adds a rider whose CCN lookup finds a membership as registered', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 4,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderNew })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('valid')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderNew)
        .single()
      expect((data as { status: string }).status).toBe('registered')
    })

    it('adds a rider as incomplete when the CCN lookup throws, but still succeeds', async () => {
      searchCCNMembership.mockRejectedValue(new Error('CCN API error: 500'))

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderNew })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('check-failed')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderNew)
        .single()
      expect((data as { status: string }).status).toBe('incomplete: membership')
    })

    it('adds a Trial Member whose trial is already used as incomplete', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 5,
        type: 'Trial Member',
        city: 'Toronto',
        country: 'Canada',
      })

      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderTrialUsed })

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('trial-used')

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.riderTrialUsed)
        .single()
      expect((data as { status: string }).status).toBe('incomplete: membership')
    })
  })

  describe('adminRestoreRegistration', () => {
    it('restores a cancelled registration to registered when membership is found', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 6,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      const res = await adminRestoreRegistration(IDS.regCancelled)

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('valid')

      const { data } = await supabase
        .from('registrations')
        .select('status, cancelled_at, management_token, notes')
        .eq('id', IDS.regCancelled)
        .single()

      const row = data as {
        status: string
        cancelled_at: string | null
        management_token: string | null
        notes: string | null
      }
      expect(row.status).toBe('registered')
      expect(row.cancelled_at).toBeNull()
      expect(row.management_token).toBeTruthy()
      // Restoring must not discard what the rider originally told the organizer.
      expect(row.notes).toBe('original notes')
    })

    it('restores a cancelled registration to incomplete when no membership is found', async () => {
      searchCCNMembership.mockResolvedValue({ found: false })

      const res = await adminRestoreRegistration(IDS.regCancelled)

      expect(res.success).toBe(true)
      expect(res.data?.membershipStatus).toBe('none')

      const { data } = await supabase
        .from('registrations')
        .select('status, cancelled_at')
        .eq('id', IDS.regCancelled)
        .single()

      const row = data as { status: string; cancelled_at: string | null }
      expect(row.status).toBe('incomplete: membership')
      expect(row.cancelled_at).toBeNull()
    })

    it('regenerates a management token that was nulled on cancellation', async () => {
      searchCCNMembership.mockResolvedValue({
        found: true,
        membershipId: 7,
        type: 'Individual Membership',
        city: 'Toronto',
        country: 'Canada',
      })

      await checked(
        supabase
          .from('registrations')
          .update({ management_token: null })
          .eq('id', IDS.regCancelled),
        'null out management_token'
      )

      const res = await adminRestoreRegistration(IDS.regCancelled)
      expect(res.success).toBe(true)

      const { data } = await supabase
        .from('registrations')
        .select('management_token')
        .eq('id', IDS.regCancelled)
        .single()
      expect((data as { management_token: string | null }).management_token).toBeTruthy()
    })

    it('rejects a registration that is not cancelled', async () => {
      const res = await adminRestoreRegistration(IDS.regActive)

      expect(res.success).toBe(false)
      expect(res.error).toBe('This registration is not cancelled')
    })

    it('reports a missing registration', async () => {
      const res = await adminRestoreRegistration('00000000-7e57-4000-a000-0000000000ff')

      expect(res.success).toBe(false)
      expect(res.error).toBeDefined()
    })
  })
})
