/**
 * Canonical public origin for the site. Single source of truth for every
 * absolute URL we emit (metadata, sitemap, robots, JSON-LD, emails, feeds).
 *
 * `www.randonneursontario.ca` is the canonical host — `register.` and the
 * apex both redirect to it. Safe to import from client components:
 * `NEXT_PUBLIC_*` references are inlined at build time.
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.randonneursontario.ca'
