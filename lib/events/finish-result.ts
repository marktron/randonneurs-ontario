import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logError } from '@/lib/errors'
import { sendRideCompleteEmail } from '@/lib/email/send-ride-complete-email'
import type { ResultInsert, ResultUpdate } from '@/types/queries'

/**
 * Digital brevet card finish flow (see docs/digital-brevet-card.md).
 *
 * When a rider's final-control check-in lands, pre-fill their result
 * (status=finished + elapsed time) and email them once asking for their GPS
 * track. Pre-fill never sets submitted_at — that column stays the marker for
 * "the rider themselves submitted" — and never overwrites a row that has it.
 * A retried check-in re-enters the card's OWN pre-fill (a finished row with
 * prefilled_at set): if a crash landed the pre-fill insert but lost the email
 * claim, the retry refreshes the row and resumes the single-send claim. The
 * finish_email_sent_at guard keeps that idempotent. Nothing here may throw:
 * these run inside check-in/undo actions whose success must not depend on the
 * follow-up work.
 *
 * Neither function queries `event_controls` itself: whether the checked-in
 * (or undone) control is the event's final one is decided by the caller
 * (`lib/actions/brevet-card.ts`), which folds that lookup into a Promise.all
 * alongside a query it already makes — no added sequential round trip on the
 * check-in/undo hot path.
 */

export interface FinishCheckinParams {
  isFinalControl: boolean
  event: {
    id: string
    name: string
    status: string | null
    event_date: string
    distance_km: number
    chapters: { name: string; slug: string } | null
  }
  rider: { id: string; firstName: string; lastName: string; email: string | null }
  managementToken: string
  finishTime: string
}

export async function handleFinishIfFinalControl(params: FinishCheckinParams): Promise<void> {
  try {
    const { event, rider } = params
    if (!params.isFinalControl) return

    const supabase = getSupabaseAdmin()

    const insertData: ResultInsert = {
      event_id: event.id,
      rider_id: rider.id,
      status: 'finished',
      finish_time: params.finishTime,
      season: parseInt(event.event_date.split('-')[0]),
      distance_km: event.distance_km,
      submission_token: params.managementToken,
      prefilled_at: new Date().toISOString(),
    }

    const { error: insertError } = await supabase.from('results').insert(insertData)

    if (insertError) {
      // Unique violation (event_id, rider_id): the row already exists (cron,
      // manage page, or an earlier final check-in). Inspect it before touching
      // it — an un-submitted card pre-fill may be (re-)filled; anything an
      // admin or the rider owns is authoritative.
      if (insertError.code === '23505') {
        const { data: existing, error: existingError } = await supabase
          .from('results')
          .select('submission_token, submitted_at, status, prefilled_at')
          .eq('event_id', event.id)
          .eq('rider_id', rider.id)
          .maybeSingle()

        if (existingError) {
          logError(existingError, {
            operation: 'handleFinishIfFinalControl.select',
            context: { eventId: event.id, riderId: rider.id },
          })
          return
        }

        const existingRow = existing as {
          submission_token: string | null
          submitted_at: string | null
          status: string | null
          prefilled_at: string | null
        } | null

        // The row is re-enterable only if the rider hasn't submitted it AND it
        // is either still pending, or a finish the card itself pre-filled
        // (status 'finished' WITH prefilled_at set). The latter is the
        // crash-retry case: the pre-fill insert landed but the process died
        // before the email claim, so a retried check-in must carry it forward.
        // A row with no match, a submitted row, or an admin-entered
        // finished/DNF/OTD row (prefilled_at NULL) is authoritative — never
        // overwrite it, and never claim/send an email against it.
        const reenterablePending = existingRow?.status === 'pending'
        const reenterablePrefill =
          existingRow?.status === 'finished' && existingRow?.prefilled_at != null
        if (
          !existingRow ||
          existingRow.submitted_at ||
          !(reenterablePending || reenterablePrefill)
        ) {
          return
        }

        const updateData: ResultUpdate = {
          status: 'finished',
          finish_time: params.finishTime,
          prefilled_at: new Date().toISOString(),
          // Backfill the management token only when the row carries none — never
          // clobber a cron-issued token that may already have been emailed.
          ...(existingRow.submission_token ? {} : { submission_token: params.managementToken }),
        }
        // Re-assert the exact state we observed in the update's filters so a
        // race that flips the row (admin edit, rider submit, undo) can still
        // never be overwritten: a pending row must stay pending; a re-entered
        // pre-fill must stay finished AND keep its prefilled_at marker.
        let updateQuery = supabase
          .from('results')
          .update(updateData)
          .eq('event_id', event.id)
          .eq('rider_id', rider.id)
          .is('submitted_at', null)
        updateQuery = reenterablePending
          ? updateQuery.eq('status', 'pending')
          : updateQuery.eq('status', 'finished').not('prefilled_at', 'is', null)
        const { data: filled, error: updateError } = await updateQuery.select('id').maybeSingle()

        if (updateError) {
          logError(updateError, {
            operation: 'handleFinishIfFinalControl.update',
            context: { eventId: event.id, riderId: rider.id },
          })
          return
        }
        // Zero rows matched (a race flipped the row out of pending) — the row
        // this call would have emailed about no longer exists as we expect.
        if (!filled) return
      } else {
        logError(insertError, {
          operation: 'handleFinishIfFinalControl.insert',
          context: { eventId: event.id, riderId: rider.id },
        })
        return
      }
    }

    // A completed event already sent this rider the "submit your results"
    // email at event close — don't stack a second ask on top of it.
    if (event.status === 'completed') return
    if (!rider.email) return

    // Atomic single-send claim: stamp finish_email_sent_at only if it is
    // still null and the rider hasn't submitted themselves. Zero rows back
    // means another writer won (or the rider already submitted) — skip.
    const { data: claimed, error: claimError } = await supabase
      .from('results')
      .update({ finish_email_sent_at: new Date().toISOString() } as ResultUpdate)
      .eq('event_id', event.id)
      .eq('rider_id', rider.id)
      .is('finish_email_sent_at', null)
      .is('submitted_at', null)
      .select('id, submission_token')
      .maybeSingle()

    if (claimError) {
      logError(claimError, {
        operation: 'handleFinishIfFinalControl.claim',
        context: { eventId: event.id, riderId: rider.id },
      })
      return
    }
    if (!claimed) return

    // Link the token the claimed row actually carries. An admin-created
    // pending row holds a gen_random_uuid() default token (non-NULL, so the
    // pre-fill never backfills it) — emailing the management token there
    // would be a dead link. Fall back to the management token only if the
    // row's token is somehow NULL (the insert path and backfill prevent it).
    const rowToken =
      (claimed as { id: string; submission_token: string | null }).submission_token ??
      params.managementToken

    const { error: emailError } = await sendRideCompleteEmail({
      event: {
        id: event.id,
        name: event.name,
        event_date: event.event_date,
        distance_km: event.distance_km,
        chapters: event.chapters,
      },
      riderName: `${rider.firstName} ${rider.lastName}`,
      riderEmail: rider.email,
      submissionToken: rowToken,
      finishTime: params.finishTime,
    })

    if (emailError) {
      // Stamp already claimed; the admin reminder flow is the backstop.
      logError(new Error(emailError), {
        operation: 'handleFinishIfFinalControl.email',
        context: { eventId: event.id, riderId: rider.id },
      })
    }
  } catch (error) {
    logError(error, { operation: 'handleFinishIfFinalControl' })
  }
}

/**
 * After a rider undoes their final-control check-in, roll a pre-filled
 * finish back to pending. Only rows the card itself pre-filled (prefilled_at
 * set) are reverted — admin-created rows (prefilled_at NULL) and admin- or
 * rider-touched rows (which clear prefilled_at) are never wiped by an undo.
 * finish_email_sent_at is deliberately left set: a later re-check-in must not
 * send a second email.
 */
export async function revertFinishIfFinalControl(params: {
  eventId: string
  riderId: string
  isFinalControl: boolean
}): Promise<void> {
  try {
    if (!params.isFinalControl) return

    const supabase = getSupabaseAdmin()

    const updateData: ResultUpdate = { status: 'pending', finish_time: null, prefilled_at: null }
    const { error: updateError } = await supabase
      .from('results')
      .update(updateData)
      .eq('event_id', params.eventId)
      .eq('rider_id', params.riderId)
      .is('submitted_at', null)
      .eq('status', 'finished')
      .not('prefilled_at', 'is', null)

    if (updateError) {
      logError(updateError, {
        operation: 'revertFinishIfFinalControl.update',
        context: { eventId: params.eventId, riderId: params.riderId },
      })
    }
  } catch (error) {
    logError(error, { operation: 'revertFinishIfFinalControl' })
  }
}
