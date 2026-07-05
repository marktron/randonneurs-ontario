import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { getTestSupabase, checked } from '../helpers/supabase'
import { TORONTO_CHAPTER_ID } from '../registration/helpers'
import { checkInAtControl, undoCheckin } from '@/lib/actions/brevet-card'
import { resetRateLimitStores } from '@/lib/rate-limit'

// Distinct ID space from checkin.test.ts (…1b0c…) and undo.test.ts (…1b0d…)
// to avoid cross-file collisions when both run against the same local DB.
const IDS = {
  rider: '00000000-1f0c-4000-a000-000000000001',
  event: '00000000-1f0c-4000-a000-000000000002',
  controlStart: '00000000-1f0c-4000-a000-000000000003',
  controlFinish: '00000000-1f0c-4000-a000-000000000004',
  registration: '00000000-1f0c-4000-a000-000000000005',
}

const RIDER_EMAIL = 'inttest-finish-result@example.com'

/**
 * Toronto-local calendar date and wall time for `now + offsetMs`, so the
 * seeded event is "happening now" regardless of the machine's timezone.
 * Never hardcode dates in fixtures.
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

async function cleanup(supabase: ReturnType<typeof getTestSupabase>) {
  await supabase.from('control_checkins').delete().eq('registration_id', IDS.registration)
  await supabase.from('results').delete().eq('event_id', IDS.event)
  await supabase.from('event_controls').delete().eq('event_id', IDS.event)
  await supabase.from('registrations').delete().eq('event_id', IDS.event)
  await supabase.from('events').delete().eq('id', IDS.event)
  await supabase.from('riders').delete().eq('id', IDS.rider)
  // Also clean by natural key: a duplicate email from an interrupted run
  // breaks lookups elsewhere.
  await supabase.from('riders').delete().ilike('email', RIDER_EMAIL)
}

describe('digital brevet card finish flow (real DB)', () => {
  const supabase = getTestSupabase()

  let token: string

  beforeAll(async () => {
    await cleanup(supabase)

    await checked(
      supabase.from('riders').insert([
        {
          id: IDS.rider,
          slug: 'inttest-finish-result-rider',
          first_name: 'Finish',
          last_name: 'Tester',
          email: RIDER_EMAIL,
        },
      ]),
      'insert rider'
    )

    // Event started two hours ago Toronto time — "happening now", well past
    // any realistic finish time for a 200 km brevet's minimum ride time.
    const started = torontoNowParts(-2 * 60 * 60 * 1000)
    await checked(
      supabase.from('events').insert([
        {
          id: IDS.event,
          slug: `inttest-finish-result-${started.date}`,
          chapter_id: TORONTO_CHAPTER_ID,
          name: 'IntTest Finish Result',
          event_type: 'brevet',
          distance_km: 200,
          event_date: started.date,
          start_time: started.time,
          status: 'scheduled',
        },
      ]),
      'insert event'
    )

    await checked(
      supabase.from('event_controls').insert([
        {
          id: IDS.controlStart,
          event_id: IDS.event,
          position: 1,
          name: 'Start',
          distance_km: 0,
          radius_m: 500,
        },
        {
          id: IDS.controlFinish,
          event_id: IDS.event,
          position: 2,
          name: 'Finish',
          distance_km: 200,
          radius_m: 500,
        },
      ]),
      'insert controls'
    )

    await checked(
      supabase.from('registrations').insert([
        {
          id: IDS.registration,
          event_id: IDS.event,
          rider_id: IDS.rider,
          status: 'registered',
        },
      ]),
      'insert registration'
    )

    const reg = await checked(
      supabase.from('registrations').select('management_token').eq('id', IDS.registration).single(),
      'read management token'
    )
    token = (reg as { management_token: string }).management_token
  })

  afterEach(async () => {
    // Undo any check-ins and results created by the test so the next test
    // (and a second full run of this file) starts from a clean slate.
    await supabase.from('control_checkins').delete().eq('registration_id', IDS.registration)
    await supabase.from('results').delete().eq('event_id', IDS.event).eq('rider_id', IDS.rider)
    resetRateLimitStores()
  })

  afterAll(async () => {
    await cleanup(supabase)
  })

  it('final-control check-in creates a finished result with elapsed time and the management token', async () => {
    const result = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)

    const row = await checked(
      supabase
        .from('results')
        .select('status, finish_time, submission_token, submitted_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after final check-in'
    )
    const typed = row as {
      status: string
      finish_time: string | null
      submission_token: string | null
      submitted_at: string | null
      finish_email_sent_at: string | null
    }
    expect(typed.status).toBe('finished')
    expect(typed.finish_time).not.toBeNull()
    expect(typed.submission_token).toBe(token)
    expect(typed.submitted_at).toBeNull()
    // SES is unconfigured locally so no real email is sent, but the
    // single-send claim still runs and stamps this column.
    expect(typed.finish_email_sent_at).not.toBeNull()
  })

  it('non-final check-in does not create a result', async () => {
    const result = await checkInAtControl(token, {
      controlId: IDS.controlStart,
      checkedInAt: new Date().toISOString(),
    })
    expect(result.success).toBe(true)

    const rows = await checked(
      supabase.from('results').select('id').eq('event_id', IDS.event).eq('rider_id', IDS.rider),
      'read results after non-final check-in'
    )
    expect((rows as unknown[]).length).toBe(0)
  })

  it('pre-fills an existing pending row without touching submitted results', async () => {
    // Cron/manage-page shape: a pending row already exists with the
    // registration's management token as its submission token.
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'pending',
        season: new Date().getFullYear(),
        distance_km: 200,
        submission_token: token,
      }),
      'seed pending result'
    )

    const first = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(first.success).toBe(true)

    const flipped = await checked(
      supabase
        .from('results')
        .select('status, finish_time')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after pre-fill'
    )
    const flippedTyped = flipped as { status: string; finish_time: string | null }
    expect(flippedTyped.status).toBe('finished')
    expect(flippedTyped.finish_time).not.toBeNull()

    // Now simulate the rider having already submitted their own result: mark
    // it submitted with a distinct status/finish_time, undo the check-in so
    // a fresh one can land, and confirm the final check-in leaves it alone.
    await checked(
      supabase
        .from('results')
        .update({
          status: 'dnf',
          finish_time: '5:00',
          submitted_at: new Date().toISOString(),
        })
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider),
      'mark result as rider-submitted'
    )
    const undone = await undoCheckin(token, { controlId: IDS.controlFinish })
    expect(undone.success).toBe(true)

    const second = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(second.success).toBe(true)

    const unchanged = await checked(
      supabase
        .from('results')
        .select('status, finish_time, submitted_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after final check-in on a submitted row'
    )
    const unchangedTyped = unchanged as {
      status: string
      finish_time: string | null
      submitted_at: string | null
    }
    expect(unchangedTyped.status).toBe('dnf')
    expect(unchangedTyped.submitted_at).not.toBeNull()
  })

  it('undoing the final check-in reverts the pre-fill but keeps the email stamp', async () => {
    const checkin = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(checkin.success).toBe(true)

    const undo = await undoCheckin(token, { controlId: IDS.controlFinish })
    expect(undo.success).toBe(true)

    const row = await checked(
      supabase
        .from('results')
        .select('status, finish_time, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after undo'
    )
    const typed = row as {
      status: string
      finish_time: string | null
      finish_email_sent_at: string | null
    }
    expect(typed.status).toBe('pending')
    expect(typed.finish_time).toBeNull()
    expect(typed.finish_email_sent_at).not.toBeNull()
  })

  it('leaves an admin-entered row untouched on final check-in and undo', async () => {
    // Organizer-entered shape: a finished row with a recorded time, no
    // submission token, no submitted_at, and — crucially — no prefilled_at.
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'finished',
        finish_time: '7:30',
        season: new Date().getFullYear(),
        distance_km: 200,
        // Explicit null overrides the column's gen_random_uuid() default so
        // this really is a "no token" organizer row.
        submission_token: null,
      }),
      'seed admin-entered result'
    )

    const checkin = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(checkin.success).toBe(true)

    const afterCheckin = await checked(
      supabase
        .from('results')
        .select('status, finish_time, submission_token, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read admin row after final check-in'
    )
    const ac = afterCheckin as {
      status: string
      finish_time: string | null
      submission_token: string | null
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    // The organizer's row is authoritative: not overwritten, and no email
    // claim/send stamped against it.
    expect(ac.status).toBe('finished')
    expect(ac.finish_time).toBe('07:30:00')
    expect(ac.submission_token).toBeNull()
    expect(ac.prefilled_at).toBeNull()
    expect(ac.finish_email_sent_at).toBeNull()

    const undo = await undoCheckin(token, { controlId: IDS.controlFinish })
    expect(undo.success).toBe(true)

    const afterUndo = await checked(
      supabase
        .from('results')
        .select('status, finish_time, prefilled_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read admin row after undo'
    )
    const au = afterUndo as {
      status: string
      finish_time: string | null
      prefilled_at: string | null
    }
    // Undo must not revert an admin-entered row (prefilled_at is NULL).
    expect(au.status).toBe('finished')
    expect(au.finish_time).toBe('07:30:00')
    expect(au.prefilled_at).toBeNull()
  })

  it('round-trips pre-fill -> undo -> re-check-in with a single email stamp and preserved token', async () => {
    const first = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(first.success).toBe(true)

    const afterFirst = await checked(
      supabase
        .from('results')
        .select('status, submission_token, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after first pre-fill'
    )
    const af = afterFirst as {
      status: string
      submission_token: string | null
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    expect(af.status).toBe('finished')
    expect(af.submission_token).toBe(token)
    expect(af.prefilled_at).not.toBeNull()
    expect(af.finish_email_sent_at).not.toBeNull()
    const firstStamp = af.finish_email_sent_at

    const undo = await undoCheckin(token, { controlId: IDS.controlFinish })
    expect(undo.success).toBe(true)

    const afterUndo = await checked(
      supabase
        .from('results')
        .select('status, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after undo'
    )
    const au = afterUndo as {
      status: string
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    expect(au.status).toBe('pending')
    expect(au.prefilled_at).toBeNull()
    // The email stamp survives the undo so a re-check-in cannot re-send.
    expect(au.finish_email_sent_at).toBe(firstStamp)

    const second = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(second.success).toBe(true)

    const afterSecond = await checked(
      supabase
        .from('results')
        .select('status, submission_token, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after re-check-in'
    )
    const as = afterSecond as {
      status: string
      submission_token: string | null
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    expect(as.status).toBe('finished')
    expect(as.prefilled_at).not.toBeNull()
    // Token preserved (not re-issued) and the single-send stamp is unchanged.
    expect(as.submission_token).toBe(token)
    expect(as.finish_email_sent_at).toBe(firstStamp)
  })

  it('resumes the finish flow on a re-check-in when a prior pre-fill left no email stamp', async () => {
    // Crash-retry shape: the pre-fill insert landed (status finished,
    // prefilled_at set, submitted_at null) but the process died before the
    // email claim, so finish_email_sent_at is still NULL. A retried final
    // check-in must re-enter the card's own pre-fill and run the lost claim.
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'finished',
        finish_time: '6:00',
        season: new Date().getFullYear(),
        distance_km: 200,
        submission_token: token,
        prefilled_at: new Date().toISOString(),
      }),
      'seed pre-filled finished row without email stamp'
    )

    const checkin = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(checkin.success).toBe(true)

    const row = await checked(
      supabase
        .from('results')
        .select('status, submission_token, submitted_at, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after crash-retry re-check-in'
    )
    const typed = row as {
      status: string
      submission_token: string | null
      submitted_at: string | null
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    expect(typed.status).toBe('finished')
    expect(typed.submission_token).toBe(token)
    expect(typed.submitted_at).toBeNull()
    expect(typed.prefilled_at).not.toBeNull()
    // The claim that the crash lost now runs and stamps the single-send column.
    expect(typed.finish_email_sent_at).not.toBeNull()
  })

  it('backfills the management token when the existing pending row has none', async () => {
    // Pending row with a NULL submission_token (finding 2's edge case).
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'pending',
        season: new Date().getFullYear(),
        distance_km: 200,
        // Explicit null overrides the gen_random_uuid() default so the row
        // genuinely has no token for the pre-fill path to backfill.
        submission_token: null,
      }),
      'seed pending result with null token'
    )

    const checkin = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(checkin.success).toBe(true)

    const row = await checked(
      supabase
        .from('results')
        .select('status, submission_token, prefilled_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after pre-fill with token backfill'
    )
    const typed = row as {
      status: string
      submission_token: string | null
      prefilled_at: string | null
    }
    expect(typed.status).toBe('finished')
    expect(typed.submission_token).toBe(token)
    expect(typed.prefilled_at).not.toBeNull()
  })

  it('keeps a pending row token that is not the management token and still stamps the email claim', async () => {
    // Admin-created pending shape: inserting without submission_token lets the
    // gen_random_uuid() default fill a token that is NOT the management token.
    await checked(
      supabase.from('results').insert({
        event_id: IDS.event,
        rider_id: IDS.rider,
        status: 'pending',
        season: new Date().getFullYear(),
        distance_km: 200,
      }),
      'seed pending result with default token'
    )

    const seeded = await checked(
      supabase
        .from('results')
        .select('submission_token')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read seeded default token'
    )
    const seededToken = (seeded as { submission_token: string | null }).submission_token
    expect(seededToken).not.toBeNull()
    expect(seededToken).not.toBe(token)

    const checkin = await checkInAtControl(token, {
      controlId: IDS.controlFinish,
      checkedInAt: new Date().toISOString(),
    })
    expect(checkin.success).toBe(true)

    const row = await checked(
      supabase
        .from('results')
        .select('status, submission_token, prefilled_at, finish_email_sent_at')
        .eq('event_id', IDS.event)
        .eq('rider_id', IDS.rider)
        .single(),
      'read result after pre-fill on a default-token row'
    )
    const typed = row as {
      status: string
      submission_token: string | null
      prefilled_at: string | null
      finish_email_sent_at: string | null
    }
    expect(typed.status).toBe('finished')
    // The existing token is preserved (no clobber with the management token);
    // the unit suite asserts the email links this row token.
    expect(typed.submission_token).toBe(seededToken)
    expect(typed.prefilled_at).not.toBeNull()
    expect(typed.finish_email_sent_at).not.toBeNull()
  })
})
