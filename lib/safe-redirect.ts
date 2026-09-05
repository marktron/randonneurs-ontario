/**
 * Shared open-redirect guard. Honours `redirect` only when it is a same-origin
 * path that is exactly one of `allowedPrefixes` or sits directly under one;
 * anything else returns `fallback`.
 *
 * A prefix is matched as a path segment, not as a bare string prefix, so
 * '/accounts-payable' is not accepted by an allow-list of '/account'.
 */
export function getSafeRedirect(
  redirect: string | null | undefined,
  allowedPrefixes: string[],
  fallback: string
): string {
  if (!redirect) return fallback
  // '//host' is protocol-relative and leaves the origin despite the leading '/'.
  if (redirect.startsWith('//')) return fallback
  // '..' can walk out of an allowed prefix once the browser normalizes it.
  if (redirect.includes('..')) return fallback
  const allowed = allowedPrefixes.some(
    (prefix) => redirect === prefix || redirect.startsWith(`${prefix}/`)
  )
  return allowed ? redirect : fallback
}
