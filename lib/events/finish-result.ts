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
 * Nothing here may throw: these run inside check-in/undo actions whose
 * success must not depend on the follow-up work.
 */

export interface FinishCheckinParams {
  controlPosition: number
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

async function isFinalControlPosition(eventId: string, position: number): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('event_controls')
    .select('position')
    .eq('event_id', eventId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      logError(error, { operation: 'finishResult.maxPosition', context: { eventId } })
    }
    return false
  }
  return (data as { position: number }).position === position
}

export async function handleFinishIfFinalControl(params: FinishCheckinParams): Promise<void> {
  try {
    const { event, rider } = params
    if (!(await isFinalControlPosition(event.id, params.controlPosition))) return

    const supabase = getSupabaseAdmin()

    const insertData: ResultInsert = {
      event_id: event.id,
      rider_id: rider.id,
      status: 'finished',
      finish_time: params.finishTime,
      season: parseInt(event.event_date.split('-')[0]),
      distance_km: event.distance_km,
      submission_token: params.managementToken,
    }

    const { error: insertError } = await supabase.from('results').insert(insertData)

    if (insertError) {
      // Unique violation (event_id, rider_id): the row already exists (cron,
      // manage page, or an earlier final check-in). Pre-fill it unless the
      // rider already submitted themselves.
      if (insertError.code === '23505') {
        const updateData: ResultUpdate = {
          status: 'finished',
          finish_time: params.finishTime,
        }
        const { error: updateError } = await supabase
          .from('results')
          .update(updateData)
          .eq('event_id', event.id)
          .eq('rider_id', rider.id)
          .is('submitted_at', null)

        if (updateError) {
          logError(updateError, {
            operation: 'handleFinishIfFinalControl.update',
            context: { eventId: event.id, riderId: rider.id },
          })
          return
        }
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
      .select('id')
      .maybeSingle()

    if (claimError) {
      logError(claimError, {
        operation: 'handleFinishIfFinalControl.claim',
        context: { eventId: event.id, riderId: rider.id },
      })
      return
    }
    if (!claimed) return

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
      submissionToken: params.managementToken,
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
 * finish back to pending. Guarded so a rider-submitted result is never
 * touched. finish_email_sent_at is deliberately left set: a later
 * re-check-in must not send a second email.
 */
export async function revertFinishIfFinalControl(params: {
  eventId: string
  riderId: string
  controlId: string
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()

    const { data: controlRow, error: controlError } = await supabase
      .from('event_controls')
      .select('position')
      .eq('id', params.controlId)
      .single()

    if (controlError || !controlRow) {
      if (controlError) {
        logError(controlError, {
          operation: 'revertFinishIfFinalControl.control',
          context: { controlId: params.controlId },
        })
      }
      return
    }

    const position = (controlRow as { position: number }).position
    if (!(await isFinalControlPosition(params.eventId, position))) return

    const updateData: ResultUpdate = { status: 'pending', finish_time: null }
    const { error: updateError } = await supabase
      .from('results')
      .update(updateData)
      .eq('event_id', params.eventId)
      .eq('rider_id', params.riderId)
      .is('submitted_at', null)
      .eq('status', 'finished')

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
