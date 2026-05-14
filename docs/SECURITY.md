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

| Client                         | Use Case     | RLS                         |
| ------------------------------ | ------------ | --------------------------- |
| `getSupabase()`                | Public reads | Enforced                    |
| `createSupabaseServerClient()` | Auth checks  | Enforced                    |
| `getSupabaseAdmin()`           | Admin writes | Bypassed (server-side only) |

**Never import `getSupabaseAdmin()` in client components.**

## Security Headers

The following headers are set on all responses via `next.config.ts`:

- `X-Frame-Options: DENY` - prevents clickjacking
- `X-Content-Type-Options: nosniff` - prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` - limits referrer leakage
- `Permissions-Policy` - disables camera, microphone, geolocation

## Anti-Spam on Public Forms

Event registration (`/register/[slug]`, `/register/permanent`) is publicly accessible and has two layers of bot protection. Both guards return a silent `{ success: true }` so that bots can't infer which check tripped:

1. **Honeypot field** — `HoneypotField` renders a hidden `ro_check` input in each registration form. The field name avoids tokens password managers recognize (`url`, `website`, `homepage`, `email`, `name`) and carries `data-1p-ignore`, `data-lpignore`, `data-bwignore`, and `data-form-type="other"` so 1Password, LastPass, and Bitwarden skip it. Real users can't see or tab to it; bots that fill every field trip the guard. Checked at the top of `registerForEvent`, `registerForPermanent`, and `completeRegistrationWithRider`.
2. **Vercel BotID** — invisible challenge run by `initBotId` (in `instrumentation-client.ts`) and verified server-side via `checkBotId({ advancedOptions: { checkLevel: 'deepAnalysis' } })`. Deep analysis runs an active challenge instead of relying on passive signals only; basic mode produced false positives on real riders scoring in the 0.4–0.6 confidence band. Protected paths are declared as `POST /register/*`. In local dev `checkBotId()` always returns `{ isBot: false }`; to simulate a bot verdict use `developmentOptions: { bypass: 'BAD-BOT' }`.

Rate limiting by email (`isRateLimited`) still applies as a third layer.

When either guard fires, `logSilentDrop()` emits a Sentry `warning` tagged `guard: 'honeypot' | 'botid'` and `action: 'registerForEvent' | 'registerForPermanent' | 'completeRegistrationWithRider'`, with `eventId`/`routeId` and a truncated SHA-256 of the email (`emailHash`) in `extra`. This lets real-user reports ("the success screen showed but no row was created") be correlated to a guard without leaking PII or signalling anything back to the client.

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

## Capability Token Protection

`registrations.management_token` and `results.submission_token` are capability tokens used for unauthenticated rider self-service flows (`/registration/manage/[token]` and `/results/submit/[token]`). These columns are hidden from the anonymous PostgREST role:

| Table           | Mechanism                                        | Hidden Column      |
| --------------- | ------------------------------------------------ | ------------------ |
| `registrations` | `public_registrations` view (excludes the token) | `management_token` |
| `results`       | Column-level `GRANT` (excludes the token)        | `submission_token` |

All server actions that need the tokens use `getSupabaseAdmin()` (service role), which bypasses grants. Public queries use `public_registrations` (view) and the column-restricted `results` table.

Regression tests in `tests/integration-real/token-column-security.test.ts` verify that the anonymous client cannot read either token column.

## Storage Bucket Policies

The app uses two Supabase Storage buckets with distinct access policies:

| Bucket              | Public Read | Anonymous Insert | Notes                                                                   |
| ------------------- | ----------- | ---------------- | ----------------------------------------------------------------------- |
| `images`            | Yes         | No               | Admin uploads via service-role client                                   |
| `rider-submissions` | Yes         | No               | Rider uploads via service-role client in `lib/actions/rider-results.ts` |

Both buckets restrict write access to the service-role client (`getSupabaseAdmin()`), which bypasses RLS. Anonymous/public INSERT policies are not used — application-level token validation (submission tokens for riders, admin auth for images) gates access before the service-role upload occurs.

Regression tests verify these policies against the local DB:

- `tests/integration-real/rider-submissions-bucket-policy.test.ts` — anonymous uploads to `rider-submissions` are rejected.
- `tests/integration-real/images-bucket-policy.test.ts` — both anonymous and freshly-signed-up authenticated users are rejected from the `images` bucket and `images` metadata table.

## Guidelines for Contributors

1. Always use `requireAdmin()` at the start of admin server actions
2. Never log PII (emails, names) to console or Sentry
3. Use parameterized queries via the Supabase client (never string concatenation)
4. Escape user input when building HTML strings (use `escapeHtml()`)
5. Validate redirect URLs - only allow relative paths to known routes
6. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only
