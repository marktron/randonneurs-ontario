import { getSafeRedirect } from '@/lib/safe-redirect'

/**
 * Post-sign-in redirect allow-list. Only same-origin paths under /account or
 * /register are honoured; anything else falls back to the account overview.
 */
export function getSafeAccountRedirect(redirect: string | null | undefined): string {
  return getSafeRedirect(redirect, ['/account', '/register'], '/account')
}
