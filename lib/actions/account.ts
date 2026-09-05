'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server-client'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { isRateLimited } from '@/lib/rate-limit'
import { handleActionError, createActionResult, logError } from '@/lib/errors'
import { requireAccount } from '@/lib/auth/get-rider'
import { resolveLink, claimRider, findLinkCandidates } from '@/lib/account/linking'
import { deleteAccountData } from '@/lib/account/deletion'
import { CODE_INVALID_MESSAGE } from '@/lib/account/messages'
import type { ActionResult } from '@/types/actions'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEN_MINUTES = 10 * 60 * 1000

function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase()
}

/**
 * Step 1 of sign-in: ask Supabase to email a 6-digit code.
 * The response is identical whether or not the address is known.
 */
export async function requestSignInCode(
  email: string,
  captchaToken?: string
): Promise<ActionResult> {
  const normalized = normalizeEmail(email)
  if (!EMAIL_RE.test(normalized)) {
    return { success: false, error: 'Enter a valid email address.' }
  }
  // Silent no-op on the per-process limit; Supabase enforces the real one.
  if (isRateLimited('rider-otp', normalized, 5, TEN_MINUTES)) {
    return createActionResult()
  }

  try {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: normalized,
      options: { shouldCreateUser: true, captchaToken },
    })
    if (error) {
      if (/captcha/i.test(error.message)) {
        return { success: false, error: 'Please complete the verification and try again.' }
      }
      if ('code' in error && error.code === 'over_email_send_rate_limit') {
        return { success: false, error: 'Too many codes requested. Try again in a few minutes.' }
      }
      return handleActionError(
        error,
        { operation: 'requestSignInCode' },
        'Something went wrong sending your code. Please try again.'
      )
    }
    return createActionResult()
  } catch (error) {
    return handleActionError(
      error,
      { operation: 'requestSignInCode' },
      'Something went wrong sending your code. Please try again.'
    )
  }
}

/**
 * Step 2 of sign-in: verify the code, establish the cookie session, then link
 * or sync the rider. Returns the path the rider should land on.
 */
export async function verifySignInCode(
  email: string,
  code: string
): Promise<ActionResult<{ next: string }>> {
  const normalized = normalizeEmail(email)
  const token = (code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(token)) {
    return { success: false, error: 'Enter the 6-digit code from your email.' }
  }
  if (isRateLimited('rider-otp-verify', normalized, 10, TEN_MINUTES)) {
    return { success: false, error: 'Too many attempts. Request a new code.' }
  }

  let userId: string
  let verifiedEmail: string
  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalized,
      token,
      type: 'email',
    })
    if (error || !data.user) {
      return { success: false, error: CODE_INVALID_MESSAGE }
    }
    userId = data.user.id
    verifiedEmail = data.user.email ?? normalized
  } catch (error) {
    return handleActionError(error, { operation: 'verifySignInCode' }, CODE_INVALID_MESSAGE)
  }

  // The rider is signed in at this point (verifyOtp succeeded). A failure in
  // linking/syncing below must not be reported as a bad code — fall back to
  // /account, which re-derives link state from the database on its own.
  try {
    const next = await afterSignIn(userId, verifiedEmail)
    return createActionResult({ next })
  } catch (error) {
    logError(error, { operation: 'verifySignInCode', context: { step: 'afterSignIn', userId } })
    return createActionResult({ next: '/account' })
  }
}

/**
 * Runs after every successful code verification.
 * Linked rider: keep riders.email in step with the verified auth email.
 * Unlinked: try to link by email.
 */
async function afterSignIn(userId: string, email: string): Promise<string> {
  const admin = getSupabaseAdmin()
  const { data: rider, error: lookupError } = await admin
    .from('riders')
    .select('id, email')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (lookupError) {
    // Don't fall through to resolveLink on a lookup failure — an
    // already-linked account could be re-run through linking by mistake.
    logError(lookupError, { operation: 'afterSignIn', context: { step: 'lookup', userId } })
    return '/account'
  }

  if (rider) {
    if ((rider.email ?? '').toLowerCase() !== email) {
      const { error: updateError } = await admin.from('riders').update({ email }).eq('id', rider.id)
      if (updateError) {
        logError(updateError, {
          operation: 'afterSignIn',
          context: { step: 'update', riderId: rider.id },
        })
      }
    }
    return '/account'
  }

  const outcome = await resolveLink({ userId, email })
  if (outcome.kind === 'linked') return '/account'
  if (outcome.kind === 'choose') return '/account/choose'
  return '/account/unmatched'
}

/**
 * True for the "not signed in" error thrown by requireAccount/requireRider.
 * Shared so the actions Task 10 adds to this file can reuse it — an expired
 * or missing session isn't a failure worth logging to Sentry.
 *
 * Kept even though handleActionError now matches "unauthorized"
 * case-insensitively: its permission branch says "You do not have permission
 * to perform this action", which is wrong for an expired session, and it logs
 * to Sentry on the way there.
 */
function isUnauthorizedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'Unauthorized'
}

/** Family-email picker: claim one of the riders that share the account's email. */
export async function chooseRider(riderId: string): Promise<ActionResult<{ next: string }>> {
  try {
    const account = await requireAccount()
    if (account.rider) return createActionResult({ next: '/account' })
    if (!account.email) return { success: false, error: 'Your account has no email address.' }

    const candidates = await findLinkCandidates(account.email)
    if (!candidates.some((c) => c.id === riderId)) {
      return { success: false, error: 'That rider is not available to link.' }
    }
    const linked = await claimRider({ riderId, userId: account.userId, email: account.email })
    if (!linked) {
      return { success: false, error: 'That rider was just linked to another account. Pick again.' }
    }
    return createActionResult({ next: '/account' })
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, error: 'Please sign in again.' }
    }
    return handleActionError(error, { operation: 'chooseRider' }, 'Could not link that rider.')
  }
}

/** Signs out this browser only. An admin sharing the browser is signed out too. */
export async function signOutRider(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/')
}

/**
 * Change the sign-in email. Supabase sends a confirmation to both addresses
 * (double_confirm_changes). riders.email follows on the next sign-in.
 */
export async function changeAccountEmail(newEmail: string): Promise<ActionResult> {
  try {
    const account = await requireAccount()
    if (account.isAdmin) {
      return {
        success: false,
        error: 'Admin email addresses are changed from the admin settings page.',
      }
    }
    const normalized = normalizeEmail(newEmail)
    if (!EMAIL_RE.test(normalized)) return { success: false, error: 'Enter a valid email address.' }
    if (normalized === normalizeEmail(account.email)) {
      return { success: false, error: 'That is already your email address.' }
    }
    // Each accepted change makes Supabase send two confirmations
    // (double_confirm_changes) out of the shared project email budget.
    if (isRateLimited('rider-email-change', account.userId, 3, TEN_MINUTES)) {
      return { success: false, error: 'Too many email changes. Try again in a few minutes.' }
    }

    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.updateUser({ email: normalized })
    if (error) {
      return handleActionError(
        error,
        { operation: 'changeAccountEmail' },
        'Could not start the email change.'
      )
    }
    return createActionResult()
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, error: 'Please sign in again.' }
    }
    return handleActionError(
      error,
      { operation: 'changeAccountEmail' },
      'Could not start the email change.'
    )
  }
}

/**
 * Delete the account after re-verifying a freshly emailed code.
 * Rider rows, registrations and results are club records and stay.
 */
export async function deleteAccount(code: string): Promise<ActionResult> {
  try {
    const account = await requireAccount()
    if (account.isAdmin) {
      return { success: false, error: 'Admin accounts are managed from the admin settings page.' }
    }
    if (!account.email) return { success: false, error: 'Your account has no email address.' }

    const token = (code ?? '').replace(/\s+/g, '')
    if (!/^\d{6}$/.test(token))
      return { success: false, error: 'Enter the 6-digit code from your email.' }

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.verifyOtp({
      email: account.email,
      token,
      type: 'email',
    })
    if (error || !data.user) return { success: false, error: CODE_INVALID_MESSAGE }

    await deleteAccountData({ userId: account.userId, riderId: account.rider?.id ?? null })
    await supabase.auth.signOut({ scope: 'local' })
    return createActionResult()
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { success: false, error: 'Please sign in again.' }
    }
    return handleActionError(
      error,
      { operation: 'deleteAccount' },
      'Could not delete your account.'
    )
  }
}
