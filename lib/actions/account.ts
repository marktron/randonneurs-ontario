'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server-client'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { isRateLimited } from '@/lib/rate-limit'
import { handleActionError, createActionResult } from '@/lib/errors'
import { requireAccount } from '@/lib/auth/get-rider'
import { resolveLink, claimRider, findLinkCandidates } from '@/lib/account/linking'
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
    const next = await afterSignIn(data.user.id, normalized)
    return createActionResult({ next })
  } catch (error) {
    return handleActionError(error, { operation: 'verifySignInCode' }, CODE_INVALID_MESSAGE)
  }
}

/**
 * Runs after every successful code verification.
 * Linked rider: keep riders.email in step with the verified auth email.
 * Unlinked: try to link by email.
 */
async function afterSignIn(userId: string, email: string): Promise<string> {
  const admin = getSupabaseAdmin()
  const { data: rider } = await admin
    .from('riders')
    .select('id, email')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (rider) {
    if ((rider.email ?? '').toLowerCase() !== email) {
      await admin.from('riders').update({ email }).eq('id', rider.id)
    }
    return '/account'
  }

  const outcome = await resolveLink({ userId, email })
  if (outcome.kind === 'linked') return '/account'
  if (outcome.kind === 'choose') return '/account/choose'
  return '/account/unmatched'
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
    return handleActionError(error, { operation: 'chooseRider' }, 'Could not link that rider.')
  }
}

/** Signs out this browser only. An admin sharing the browser is signed out too. */
export async function signOutRider(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/')
}
