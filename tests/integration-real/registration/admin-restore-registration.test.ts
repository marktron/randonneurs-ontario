import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID, daysFromNow } from './helpers'
import { addRegistration, adminRestoreRegistration } from '@/lib/actions/results'

// Admin actions run with no auth session, and audit_logs.admin_id has a
// NOT NULL FK to admins(id) — mock both so the actions run against the real DB.
vi.mock('@/lib/auth/get-admin', () => ({
  getAdmin: vi.fn(async () => ({ id: '00000000-7e57-4000-a000-0000000000ad' })),
  requireAdmin: vi.fn(async () => ({ id: '00000000-7e57-4000-a000-0000000000ad' })),
}))
vi.mock('@/lib/audit-log', () => ({
  logAuditEvent: vi.fn(async () => {}),
}))

const IDS = {
  event: '00000000-7e57-4000-a000-000000000001',
  riderCancelled: '00000000-7e57-4000-a000-000000000002',
  riderActive: '00000000-7e57-4000-a000-000000000003',
  riderIncomplete: '00000000-7e57-4000-a000-000000000004',
  regCancelled: '00000000-7e57-4000-a000-000000000005',
  regActive: '00000000-7e57-4000-a000-000000000006',
  regIncomplete: '00000000-7e57-4000-a000-000000000007',
}

const EMAILS = {
  cancelled: 'inttest-restore-cancelled@example.com',
  active: 'inttest-restore-active@example.com',
  incomplete: 'inttest-restore-incomplete@example.com',
}

const EVENT_SLUG_PREFIX = 'inttest-restore-reg-'

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  const riderIds = [IDS.riderCancelled, IDS.riderActive, IDS.riderIncomplete]
  await supabase.from('registrations').delete().eq('event_id', IDS.event)
  await supabase.from('results').delete().eq('event_id', IDS.event)
  await supabase.from('events').delete().eq('id', IDS.event)
  // Also by natural key: the slug embeds a relative date, so leftovers from an
  // interrupted run on another day carry our id but a different slug.
  await supabase.from('events').delete().ilike('slug', `${EVENT_SLUG_PREFIX}%`)
  await supabase.from('riders').delete().in('id', riderIds)
  for (const email of Object.values(EMAILS)) {
    await supabase.from('riders').delete().ilike('email', email)
  }
}

describe('admin un-cancelling a registration (real DB)', () => {
  const supabase = getTestSupabase()
  const eventDate = daysFromNow(21)

  beforeAll(async () => {
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
      ]),
      'seed riders'
    )

    await checked(
      supabase.from('events').insert({
        id: IDS.event,
        name: 'Restore Registration Test 200',
        slug: `${EVENT_SLUG_PREFIX}${eventDate}`,
        chapter_id: TORONTO_CHAPTER_ID,
        event_date: eventDate,
        start_time: '07:00',
        distance_km: 200,
        event_type: 'brevet',
        status: 'scheduled',
      }),
      'seed event'
    )
  })

  beforeEach(async () => {
    // Reset registration rows so each test starts from the same state and the
    // suite is order-independent (and rerunnable).
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
      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderCancelled })

      expect(res.success).toBe(true)

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

    it('revives a registration left incomplete for membership', async () => {
      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderIncomplete })

      expect(res.success).toBe(true)

      const { data } = await supabase
        .from('registrations')
        .select('status')
        .eq('id', IDS.regIncomplete)
        .single()
      expect((data as { status: string }).status).toBe('registered')
    })

    it('still reports a duplicate for an active registration', async () => {
      const res = await addRegistration({ eventId: IDS.event, riderId: IDS.riderActive })

      expect(res.success).toBe(false)
      expect(res.error).toBe('This rider is already registered for this event')
    })

    it('regenerates a management token that was nulled on cancellation', async () => {
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
  })

  describe('adminRestoreRegistration', () => {
    it('restores a cancelled registration', async () => {
      const res = await adminRestoreRegistration(IDS.regCancelled)

      expect(res.success).toBe(true)

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

    it('regenerates a management token that was nulled on cancellation', async () => {
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
