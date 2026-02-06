# Security

This document describes the security measures in place and guidelines for maintaining them.

## Authentication & Authorization

- **Admin authentication** uses Supabase Auth with email/password
- **Middleware** (`proxy.ts`) protects all `/admin/*` routes by verifying:
  1. User is authenticated (has valid session)
  2. User exists in the `admins` table
- **Server actions** use `requireAdmin()` to verify admin access before mutations
- **Role-based access**: `admin` (full access) and `chapter_admin` (chapter-scoped)

## Row Level Security (RLS)

All Supabase tables have RLS policies. The three-client pattern ensures proper access:

| Client | Use Case | RLS |
|--------|----------|-----|
| `getSupabase()` | Public reads | Enforced |
| `createSupabaseServerClient()` | Auth checks | Enforced |
| `getSupabaseAdmin()` | Admin writes | Bypassed (server-side only) |

**Never import `getSupabaseAdmin()` in client components.**

## Security Headers

The following headers are set on all responses via `next.config.ts`:

- `X-Frame-Options: DENY` - prevents clickjacking
- `X-Content-Type-Options: nosniff` - prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` - limits referrer leakage
- `Permissions-Policy` - disables camera, microphone, geolocation

## Input Validation

- **Email templates** escape all user-supplied values with `escapeHtml()` to prevent HTML injection
- **Server actions** validate required fields and data formats before database operations
- **File uploads** validate file type (allowlist) and file size (max 5MB images, 10MB rider submissions)
- **Slug validation** uses regex to ensure only `[a-z0-9-]` characters

## Redirect Safety

The admin login page validates redirect URLs to prevent open redirect attacks. Only paths starting with `/admin` are allowed as redirect targets.

## Secrets Management

- `SUPABASE_SERVICE_ROLE_KEY` is server-side only (no `NEXT_PUBLIC_` prefix)
- `CRON_SECRET` authenticates the cron endpoint via Bearer token
- `.env*` files are in `.gitignore`
- Sentry `sendDefaultPii` is disabled to prevent PII leakage

## Email Security

- All emails are sent from a verified sender address (`fromEmail`)
- Admin emails use `replyTo` rather than spoofing the `from` address
- Email logs do not contain user email addresses

## Guidelines for Contributors

1. Always use `requireAdmin()` at the start of admin server actions
2. Never log PII (emails, names) to console or Sentry
3. Use parameterized queries via the Supabase client (never string concatenation)
4. Escape user input when building HTML strings (use `escapeHtml()`)
5. Validate redirect URLs - only allow relative paths to known routes
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
