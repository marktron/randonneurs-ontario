import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID } from '../registration/helpers'
import {
  getBrevetCardByToken,
  getCheckinRoster,
  setCheckinSharing,
} from '@/lib/actions/brevet-card'
import { resetRateLimitStores } from '@/lib/rate-limit'

/**
 * Who a rider sees under "N other riders checked in" on their digital card
 * (docs/digital-brevet-card.md §7b). The mock-based unit suite can only
 * check the code-level filter; this proves the embedded-resource filters in
 * the real PostgREST query (share_checkins, registered status, riders.hidden)
 * and the share_checkins column itself.
 *
 * Distinct ID space from the other brevet-card files (…1b0c…, …1b0d…).
 */
const IDS = {
  riderViewer: '00000000-1b0e-4000-a000-000000000001',
  riderSharer: '00000000-1b0e-4000-a000-000000000002',
  riderOptedOut: '00000000-1b0e-4000-a000-000000000003',
  riderHidden: '00000000-1b0e-4000-a000-000000000004',
  riderCancelled: '00000000-1b0e-4000-a000-000000000005',
  event: '00000000-1b0e-4000-a000-000000000006',
  otherEvent: '00000000-1b0e-4000-a000-000000000007',
  controlStart: '00000000-1b0e-4000-a000-000000000008',
  controlMid: '00000000-1b0e-4000-a000-000000000009',
  controlOtherEvent: '00000000-1b0e-4000-a000-00000000000a',
  regViewer: '00000000-1b0e-4000-a000-00000000000b',
  regSharer: '00000000-1b0e-4000-a000-00000000000c',
  regOptedOut: '00000000-1b0e-4000-a000-00000000000d',
  regHidden: '00000000-1b0e-4000-a000-00000000000e',
  regCancelled: '00000000-1b0e-4000-a000-00000000000f',
  regOtherEvent: '00000000-1b0e-4000-a000-000000000010',
}

const EMAILS = {
  viewer: 'inttest-brevet-sharing-viewer@example.com',
  sharer: 'inttest-brevet-sharing-sharer@example.com',
  optedOut: 'inttest-brevet-sharing-opted-out@example.com',
  hidden: 'inttest-brevet-sharing-hidden@example.com',
  cancelled: 'inttest-brevet-sharing-cancelled@example.com',
}

// Union Station, Toronto — the seeded location of the start control.
const CONTROL_LAT = 43.6453
const CONTROL_LNG = -79.3806

/**
 * Toronto-local calendar date and wall time for `now + offsetMs`, so seeded
 * events are "happening now" regardless of the machine's timezone. Never
 * hardcode dates in fixtures.
 */
function torontoNowParts(offsetMs: number): { date: string; time: string } {
  const d = new Date(Date.now() + offsetMs)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Toronto',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const eventIds = [IDS.event, IDS.otherEvent]
  const riderIds = Object.entries(IDS)
    .filter(([key]) => key.startsWith('rider'))
    .map(([, id]) => id)
  const regIds = Object.entries(IDS)
    .filter(([key]) => key.startsWith('reg'))
    .map(([, id]) => id)
  await supabase.from('control_checkins').delete().in('registration_id', regIds)
  await supabase.from('event_controls').delete().in('event_id', eventIds)
  await supabase.from('registrations').delete().in('event_id', eventIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('riders').delete().in('id', riderIds)
  // Also clean by natural key: duplicate emails from interrupted runs break
  // lookups elsewhere.
  for (const email of Object.values(EMAILS)) {
    await supabase.from('riders').delete().ilike('email', email)
  }
}

describe('digital brevet card check-in sharing (real DB)', () => {
  const supabase = getTestSupabase()

  let viewerToken: string
  let sharerToken: string
  let hiddenToken: string

  beforeAll(async () => {
    await cleanup(supabase)

    // Every row sets `hidden` explicitly: supabase-js normalizes bulk inserts
    // to the union of keys and sends missing ones as NULL, bypassing the
    // column default.
    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.riderViewer,
          slug: 'inttest-brevet-sharing-viewer',
          first_name: 'Viewer',
          last_name: 'Tester',
          email: EMAILS.viewer,
          hidden: false,
        },
        {
          id: IDS.riderSharer,
          slug: 'inttest-brevet-sharing-sharer',
          first_name: 'Sharer',
          last_name: 'Tester',
          email: EMAILS.sharer,
          hidden: false,
        },
        {
          id: IDS.riderOptedOut,
          slug: 'inttest-brevet-sharing-opted-out',
          first_name: 'OptedOut',
          last_name: 'Tester',
          email: EMAILS.optedOut,
          hidden: false,
        },
        {
          id: IDS.riderHidden,
          slug: 'inttest-brevet-sharing-hidden',
          first_name: 'Hidden',
          last_name: 'Tester',
          email: EMAILS.hidden,
          hidden: true,
        },
        {
          id: IDS.riderCancelled,
          slug: 'inttest-brevet-sharing-cancelled',
          first_name: 'Cancelled',
          last_name: 'Tester',
          email: EMAILS.cancelled,
          hidden: false,
        },
      ]),
      'insert riders'
    )

    // Both events started one hour ago Toronto time — "happening now".
    const started = torontoNowParts(-60 * 60 * 1000)
    await checked(
      supabase.from('events').insert([
        {
          id: IDS.event,
          slug: `inttest-brevet-sharing-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Sharing',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
        {
          id: IDS.otherEvent,
          slug: `inttest-brevet-sharing-other-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Brevet Sharing Other',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
      ]),
      'insert events'
    )

    await checked(
      supabase.from('event_controls').insert([
        {
          id: IDS.controlStart,
          event_id: IDS.event,
          position: 1,
          name: 'Start — Union Station',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlMid,
          event_id: IDS.event,
          position: 2,
          name: 'Mid Control',
          distance_km: 100,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
        {
          id: IDS.controlOtherEvent,
          event_id: IDS.otherEvent,
          position: 1,
          name: 'Other Event Start',
          distance_km: 0,
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    // Every row sets status and share_checkins explicitly (bulk-insert key
    // union, see above). The viewer's row relies on the column default so
    // the default itself is under test — inserted separately.
    await checked(
      supabase.from('registrations').insert({
        id: IDS.regViewer,
        event_id: IDS.event,
        rider_id: IDS.riderViewer,
        status: 'registered',
      }),
      'insert viewer registration'
    )
    await checked(
      supabase.from('registrations').insert([
        {
          id: IDS.regSharer,
          event_id: IDS.event,
          rider_id: IDS.riderSharer,
          status: 'registered',
          share_checkins: true,
        },
        {
          id: IDS.regOptedOut,
          event_id: IDS.event,
          rider_id: IDS.riderOptedOut,
          status: 'registered',
          share_checkins: false,
        },
        {
          id: IDS.regHidden,
          event_id: IDS.event,
          rider_id: IDS.riderHidden,
          status: 'registered',
          share_checkins: true,
        },
        {
          id: IDS.regCancelled,
          event_id: IDS.event,
          rider_id: IDS.riderCancelled,
          status: 'cancelled',
          share_checkins: true,
        },
        {
          id: IDS.regOtherEvent,
          event_id: IDS.otherEvent,
          rider_id: IDS.riderSharer,
          status: 'registered',
          share_checkins: true,
        },
      ]),
      'insert registrations'
    )

    const regs = await checked(
      supabase
        .from('registrations')
        .select('id, management_token')
        .in('id', [IDS.regViewer, IDS.regSharer, IDS.regHidden]),
      'read management tokens'
    )
    const tokenById = new Map(
      (regs as { id: string; management_token: string }[]).map((r) => [r.id, r.management_token])
    )
    viewerToken = tokenById.get(IDS.regViewer)!
    sharerToken = tokenById.get(IDS.regSharer)!
    hiddenToken = tokenById.get(IDS.regHidden)!

    // Everyone has tapped the start control; the sharer has also reached
    // the mid control, and has a check-in on a different event that must
    // never bleed into this one.
    const checkinRows = [
      { registration_id: IDS.regViewer, control_id: IDS.controlStart, minutes: 50 },
      { registration_id: IDS.regSharer, control_id: IDS.controlStart, minutes: 55 },
      { registration_id: IDS.regOptedOut, control_id: IDS.controlStart, minutes: 52 },
      { registration_id: IDS.regHidden, control_id: IDS.controlStart, minutes: 51 },
      { registration_id: IDS.regCancelled, control_id: IDS.controlStart, minutes: 53 },
      { registration_id: IDS.regSharer, control_id: IDS.controlMid, minutes: 5 },
      { registration_id: IDS.regOtherEvent, control_id: IDS.controlOtherEvent, minutes: 40 },
    ]
    await checked(
      supabase.from('control_checkins').insert(
        checkinRows.map((row) => ({
          control_id: row.control_id,
          registration_id: row.registration_id,
          checked_in_at: minutesAgo(row.minutes),
          received_at: minutesAgo(row.minutes),
          method: 'gps',
          lat: CONTROL_LAT,
          lng: CONTROL_LNG,
          accuracy_m: 10,
          distance_to_control_m: 5,
        }))
      ),
      'insert check-ins'
    )
  })

  afterEach(async () => {
    // Tests flip the sharer's preference; restore it for order-independence.
    await checked(
      supabase.from('registrations').update({ share_checkins: true }).eq('id', IDS.regSharer),
      'restore sharer preference'
    )
    resetRateLimitStores()
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('defaults a new registration to sharing', async () => {
    const card = await getBrevetCardByToken(viewerToken)

    expect(card).not.toBeNull()
    expect(card!.registration.shareCheckins).toBe(true)
    expect(card!.rider.canShareCheckins).toBe(true)
  })

  it("shows only registered, sharing, non-hidden riders' check-ins on this event, minus the viewer", async () => {
    const card = await getBrevetCardByToken(viewerToken)

    expect(card!.roster).toEqual([
      expect.objectContaining({ controlId: IDS.controlStart, riderName: 'Sharer Tester' }),
      expect.objectContaining({ controlId: IDS.controlMid, riderName: 'Sharer Tester' }),
    ])
  })

  it('serves the same roster from the on-demand refresh action', async () => {
    const card = await getBrevetCardByToken(viewerToken)
    const refreshed = await getCheckinRoster(viewerToken)

    expect(refreshed.success).toBe(true)
    expect(refreshed.data).toEqual(card!.roster)
  })

  it('orders the roster by tap time, earliest first', async () => {
    const result = await getCheckinRoster(sharerToken)

    // The sharer sees everyone else who shares: only the viewer qualifies.
    expect(result.data!.map((entry) => entry.riderName)).toEqual(['Viewer Tester'])

    const times = (await getCheckinRoster(viewerToken)).data!.map((e) => e.checkedInAt)
    expect([...times].sort()).toEqual(times)
  })

  it('removes a rider from everyone else’s card the moment they opt out, and restores them when they opt back in', async () => {
    const off = await setCheckinSharing(sharerToken, { share: false })
    expect(off.success).toBe(true)

    const stored = await checked(
      supabase.from('registrations').select('share_checkins').eq('id', IDS.regSharer).single(),
      'read sharer preference'
    )
    expect((stored as { share_checkins: boolean }).share_checkins).toBe(false)

    expect((await getCheckinRoster(viewerToken)).data).toEqual([])
    expect((await getBrevetCardByToken(sharerToken))!.registration.shareCheckins).toBe(false)

    const on = await setCheckinSharing(sharerToken, { share: true })
    expect(on.success).toBe(true)
    expect((await getCheckinRoster(viewerToken)).data!.map((e) => e.riderName)).toEqual([
      'Sharer Tester',
      'Sharer Tester',
    ])
  })

  it('never lets a hidden rider share, whatever their registration says', async () => {
    const card = await getBrevetCardByToken(hiddenToken)

    expect(card!.rider.canShareCheckins).toBe(false)
    // Their card still shows other riders — hiding is one-way. Earliest
    // tap first: the sharer's start (55 min ago), the viewer's (50), then
    // the sharer's mid control (5).
    expect(card!.roster.map((e) => e.riderName)).toEqual([
      'Sharer Tester',
      'Viewer Tester',
      'Sharer Tester',
    ])
  })

  it('rejects an unknown token for both the roster and the preference', async () => {
    expect((await getCheckinRoster('00000000-0000-4000-a000-000000000000')).success).toBe(false)
    expect(
      (await setCheckinSharing('00000000-0000-4000-a000-000000000000', { share: false })).success
    ).toBe(false)
  })
})
