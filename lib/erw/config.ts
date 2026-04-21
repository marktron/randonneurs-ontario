/**
 * Gate Epic Ride Weather sync to the Vercel production environment only.
 * Blocks local dev (`VERCEL_ENV` unset) and preview deploys so test events
 * from admins clicking around never pollute the live ERW dashboard.
 *
 * The bulk-sync script (`scripts/bulk-sync-erw.ts`) calls the client directly
 * and is unaffected — it's an ops tool run with production credentials.
 */
export function isErwSyncEnabled(): boolean {
  return process.env.VERCEL_ENV === 'production'
}
