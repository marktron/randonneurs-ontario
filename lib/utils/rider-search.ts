/**
 * Apply rider search filters to a Supabase query.
 * Splits search into terms - each must appear in full_name or email.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyRiderSearchFilter<T>(query: T, search: string): T {
  const terms = search.trim().split(/\s+/).filter(t => t.length > 0)
  let result = query
  for (const term of terms) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = (result as any).or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
  }
  return result
}
