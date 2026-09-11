/**
 * Server-only feature flag: shows draft events (`events.status = 'draft'`)
 * on the public calendar and event pages, so members can review a season's
 * schedule before it is finalized. Registration for a draft event stays
 * refused regardless of this flag — see `lib/actions/register.ts`.
 *
 * Deliberately not `NEXT_PUBLIC_`: this must never reach client bundles.
 * Read it only through this helper (never `process.env.SHOW_DRAFT_EVENTS`
 * directly) so every read site stays consistent and easy to find. The anon
 * RLS policy (`events_select_public`) still hides drafts, so callers that
 * flip behaviour on this flag must also switch to the service-role client
 * (`getSupabaseAdmin()` from `lib/supabase-server.ts`) to see them.
 *
 * Toggled via the `SHOW_DRAFT_EVENTS` environment variable on Vercel, which
 * requires a redeploy to take effect.
 *
 * @see lib/erw/config.ts for the same shape used to gate Epic Ride Weather sync.
 */
export function isDraftPreviewEnabled(): boolean {
  return process.env.SHOW_DRAFT_EVENTS === 'true'
}
