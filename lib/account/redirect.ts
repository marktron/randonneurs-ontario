/**
 * Post-sign-in redirect allow-list. Only same-origin paths under /account or
 * /register are honoured; anything else falls back to the account overview.
 */
export function getSafeAccountRedirect(redirect: string | null | undefined): string {
  if (!redirect) return '/account'
  if (redirect.startsWith('//')) return '/account'
  if (redirect.includes('..')) return '/account'
  if (redirect === '/account' || redirect.startsWith('/account/')) return redirect
  if (redirect === '/register' || redirect.startsWith('/register/')) return redirect
  return '/account'
}
