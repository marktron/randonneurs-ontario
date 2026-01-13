/**
 * Apply rider search filters to a Supabase query.
 * Splits search into terms - each must appear in full_name or email.
 *
 * Note: Uses type assertion because Supabase query builder's `.or()` method
 * returns a type that TypeScript can't infer when chaining generics.
 */
export function applyRiderSearchFilter<T>(query: T, search: string): T {
  const terms = search
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
  let result: T = query
  for (const term of terms) {
    // Type assertion needed because Supabase query builder's .or() method
    // returns a complex type that TypeScript can't infer in generic context

    result = (result as unknown as { or: (filter: string) => T }).or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%`
    ) as T
  }
  return result
}
