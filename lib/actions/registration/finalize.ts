/**
 * Registration finalization shared by every entry point.
 *
 * `finalizeRegistration` is the single parameterized path the three public
 * actions converge on once they have an `eventId` and a resolved `riderId`:
 * verify membership, write (or revive) the registration row, fire the
 * confirmation email, and — only on full success — revalidate caches. The
 * caller supplies the bits that genuinely differ between scheduled events and
 * permanents: the base email payload, the duplicate-registration message, the
 * email-error telemetry context, and the cache-revalidation closure.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { sendRegistrationConfirmationEmail } from '@/lib/email/send-registration-email'
import { getMembershipForRider, isTrialUsed } from '@/lib/memberships/service'
import { createActionResult, logError } from '@/lib/errors'
import type { RegistrationInsert } from '@/types/queries'
import { buildManagementUrl, buildConfirmationEmailCardUrl } from './helpers'
import type { BaseEmailPayload } from './types'
import type { RegistrationResult } from '../register'

/**
 * Create or update a registration record for a rider and event.
 *
 * Tries an INSERT first. On conflict (event_id, rider_id):
 * - If existing row is 'incomplete: membership', updates it (re-registration after membership fix)
 * - If existing row is 'cancelled', updates it and clears cancelled_at (re-registration)
 * - If existing row is 'registered', returns 'duplicate' (already registered)
 *
 * @returns The management token, or 'duplicate' if already fully registered
 * @throws Error if registration creation fails for other reasons
 */
export async function createRegistrationRecord(
  eventId: string,
  riderId: string,
  shareRegistration: boolean,
  notes?: string,
  status: 'registered' | 'incomplete: membership' = 'registered',
  teamName?: string,
  isTeamCaptain?: boolean
): Promise<string | 'duplicate'> {
  const supabase = getSupabaseAdmin()

  // First, try a plain INSERT
  const insertRegistration: RegistrationInsert = {
    event_id: eventId,
    rider_id: riderId,
    status,
    share_registration: shareRegistration,
    notes: notes || null,
    team_name: teamName || null,
    is_team_captain: isTeamCaptain || false,
  }
  const { data: inserted, error: insertError } = await supabase
    .from('registrations')
    .insert(insertRegistration)
    .select('management_token')
    .single()

  if (!insertError && inserted) {
    return (inserted as { management_token: string }).management_token
  }

  // If the error is NOT a unique violation, it's a real failure
  if (insertError.code !== '23505') {
    logError(insertError, {
      operation: 'createRegistrationRecord.insert',
      context: { eventId, riderId, supabaseCode: insertError.code },
    })
    throw new Error('Failed to complete registration')
  }

  // Unique violation — a row already exists for this (event_id, rider_id).
  // Try updating if it's an incomplete registration (membership re-check)
  // or a cancelled registration (re-registration).
  for (const revivableStatus of ['incomplete: membership', 'cancelled'] as const) {
    const { data: updated, error: updateError } = await supabase
      .from('registrations')
      .update({
        status,
        share_registration: shareRegistration,
        notes: notes || null,
        team_name: teamName || null,
        is_team_captain: isTeamCaptain || false,
        ...(revivableStatus === 'cancelled' ? { cancelled_at: null } : {}),
      })
      .eq('event_id', eventId)
      .eq('rider_id', riderId)
      .eq('status', revivableStatus)
      .select('management_token')
      .maybeSingle()

    if (updateError) {
      logError(updateError, {
        operation: 'createRegistrationRecord.update',
        context: { eventId, riderId, revivableStatus, supabaseCode: updateError.code },
      })
      throw new Error('Failed to complete registration')
    }

    if (updated) {
      return (updated as { management_token: string }).management_token
    }
  }

  // No row matched either update — the existing registration is already 'registered'
  return 'duplicate'
}

export interface FinalizeRegistrationParams {
  eventId: string
  riderId: string
  /** Submitted first name, used for the membership lookup. */
  firstName: string
  /** Submitted last name, used for the membership lookup. */
  lastName: string
  /** Chapter id for the membership lookup, or undefined for non-geographic chapters. */
  realChapterId: string | undefined
  shareRegistration: boolean
  notes?: string
  /** Scheduled-event team fields; omit for permanents (which have no teams). */
  teamName?: string
  isTeamCaptain?: boolean
  /** Confirmation-email payload minus the membership-dependent fields. */
  emailBase: BaseEmailPayload
  /** Message returned when the rider is already fully registered. */
  duplicateMessage: string
  /** Sentry operation tag for a failed confirmation-email send. */
  emailErrorOperation: string
  /** Sentry context for a failed confirmation-email send. */
  emailErrorContext: Record<string, unknown>
  /** Cache revalidation to run only after a successful, complete registration. */
  revalidate: () => void
}

/**
 * Run the shared tail of every registration: membership verification, the
 * registration write, the confirmation email, and (on success) cache
 * revalidation. Behavior is identical across the three entry points; only the
 * `params` differ.
 */
export async function finalizeRegistration(
  params: FinalizeRegistrationParams
): Promise<RegistrationResult> {
  const {
    eventId,
    riderId,
    firstName,
    lastName,
    realChapterId,
    shareRegistration,
    notes,
    teamName,
    isTeamCaptain,
    emailBase,
    duplicateMessage,
    emailErrorOperation,
    emailErrorContext,
    revalidate,
  } = params

  const membershipResult = await getMembershipForRider(riderId, firstName, lastName, realChapterId)

  // Compose + send the confirmation email (fire-and-forget — never block
  // registration on email delivery). membershipStatus/type vary per branch.
  const sendEmail = (
    membershipFields: {
      membershipStatus: 'valid' | 'none' | 'trial-used'
      membershipType?: string
    },
    managementToken: string
  ): void => {
    sendRegistrationConfirmationEmail({
      ...emailBase,
      ...membershipFields,
      managementUrl: buildManagementUrl(managementToken),
      digitalCardUrl: buildConfirmationEmailCardUrl(emailBase.eventType, managementToken),
    }).catch((error) => {
      logError(error, { operation: emailErrorOperation, context: emailErrorContext })
    })
  }

  // No membership on file — record an incomplete registration and prompt the
  // rider to sort out membership.
  if (!membershipResult.found) {
    const mgmtToken = await createRegistrationRecord(
      eventId,
      riderId,
      shareRegistration,
      notes,
      'incomplete: membership',
      teamName,
      isTeamCaptain
    )
    if (mgmtToken === 'duplicate') {
      return { success: false, error: duplicateMessage }
    }
    sendEmail({ membershipStatus: 'none' }, mgmtToken)
    return {
      success: false,
      membershipError: 'no-membership',
      error: 'Membership verification failed',
    }
  }

  // Trial members get exactly one ride — a used trial is also incomplete.
  if (membershipResult.type === 'Trial Member') {
    const trialUsed = await isTrialUsed(riderId)
    if (trialUsed) {
      const mgmtToken = await createRegistrationRecord(
        eventId,
        riderId,
        shareRegistration,
        notes,
        'incomplete: membership',
        teamName,
        isTeamCaptain
      )
      if (mgmtToken === 'duplicate') {
        return { success: false, error: duplicateMessage }
      }
      sendEmail({ membershipStatus: 'trial-used' }, mgmtToken)
      return {
        success: false,
        membershipError: 'trial-used',
        error: 'Trial membership already used',
      }
    }
  }

  // Valid membership — create the registration (atomically checks for duplicates).
  const mgmtToken = await createRegistrationRecord(
    eventId,
    riderId,
    shareRegistration,
    notes,
    'registered',
    teamName,
    isTeamCaptain
  )
  if (mgmtToken === 'duplicate') {
    return { success: false, error: duplicateMessage }
  }

  sendEmail({ membershipStatus: 'valid', membershipType: membershipResult.type }, mgmtToken)

  revalidate()
  return createActionResult()
}
