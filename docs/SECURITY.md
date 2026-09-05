# Security

This document describes the security measures in place and guidelines for maintaining them.

## Authentication & Authorization

There are two independent audiences, sharing one Supabase Auth instance:

- **Admins** sign in with email/password. **Middleware** (`proxy.ts`) protects
  all `/admin/*` routes by verifying (1) the user is authenticated and (2) the
  user exists in the `admins` table. **Server actions** use `requireAdmin()`
  (`lib/auth/get-admin.ts`) to verify admin access before mutations. Both
  admin sign-in (`login`) and the admin change-password re-authentication
  (`changePassword`, `lib/actions/auth.ts`) accept an optional Turnstile
  `captchaToken` and pass it to `signInWithPassword`, since Supabase CAPTCHA,
  once enabled, applies to every auth endpoint (not just rider sign-in) — see
  "Rate limits and Turnstile" in `docs/rider-accounts.md`.
- **Riders** sign in with a passwordless 6-digit email code (Supabase email
  OTP) at `/account/login` — no password, ever. Anyone with an email address
  can obtain a session this way; there is no admission check at sign-in time.
  Server actions and pages that need a rider identity use `requireRider()` /
  `requireAccount()` (`lib/auth/get-rider.ts`), which resolve the rider (and
  whether the same user also has an `admins` row) with the service-role
  client. See `docs/rider-accounts.md` for the full sign-in, linking, and
  settings flow.

Because rider sign-in has no admission check, **`authenticated` is a public
role**: `authenticated` may hold the same public grants as `anon` and nothing
more. Private or owner-scoped data is never gated on role membership alone —
it goes through a server action using the service-role client, gated by
`requireAdmin()`/`requireRider()` in application code. Migration
`20260905100000_lock_down_authenticated_role.sql` is where this was enforced
for the tables that predate rider accounts (`riders`, `registrations`,
`results`, `event_controls`, `control_checkins` all had legacy blanket grants
to `authenticated` until then); any new table's grants to `authenticated`
must mirror `anon`'s.

Two real-DB suites hold this line:
`tests/integration-real/authenticated-role-lockdown.test.ts` (a fresh
signed-in user cannot read rider `email`/`phone`/`emergency_contact_*`, the
`registrations` base table, or `results.submission_token`, and cannot write
`riders` or any storage bucket) and
`tests/integration-real/rider-account-columns.test.ts` (the same role cannot
read `riders.auth_user_id` or `riders.linked_at`).

### Admin roles

There are three roles in the `admins` table: `super_admin`, `admin`, and
`chapter_admin`. The role name records a person's _primary_ affiliation; it is
**not** a data-access boundary.

- **All three roles have full read/write access to every chapter's data.** This
  is intentional. Chapter admins routinely help run and administer events for
  other chapters, so `chapter_admin` is deliberately **not** chapter-scoped for
  writes. `requireAdmin()` (`lib/auth/get-admin.ts`) grants access to anyone with
  a row in the `admins` table, and admin writes go through the service-role
  client (`getSupabaseAdmin()`), which bypasses RLS by design.
- **`super_admin` is the only elevated role.** It gates user management and other
  org-wide operations via `isSuperAdmin()` / `isFullAdmin()` (`lib/auth/roles.ts`).

> **Note for auditors:** a `chapter_admin` being able to mutate another chapter's
> events, routes, results, news, or pages is **expected behaviour, not a
> vulnerability**. Do not "fix" this by adding chapter-scoping to the write
> actions. The `is_chapter_admin()` RLS helper in the migrations exists for
> possible future read-scoping and is not an enforcement gap. The real access
> boundary is: authenticated + present in the `admins` table (any role) vs.
> everyone else.

## Row Level Security (RLS)

All Supabase tables have RLS policies. The three-client pattern ensures proper access:

| Client                         | Use Case     | RLS                         |
| ------------------------------ | ------------ | --------------------------- |
| `getSupabase()`                | Public reads | Enforced                    |
| `createSupabaseServerClient()` | Auth checks  | Enforced                    |
| `getSupabaseAdmin()`           | Admin writes | Bypassed (server-side only) |

`createSupabaseServerClient()` is also how `requireRider()`/`requireAccount()`
(`lib/auth/get-rider.ts`, next to `requireAdmin()` in `lib/auth/get-admin.ts`)
validate the session — `auth.getUser()` on the cookie client — before falling
back to `getSupabaseAdmin()` to read the rider/admin rows, which are
deliberately not exposed to the `authenticated` role.

**Never import `getSupabaseAdmin()` in client components.**

### Hidden riders

The `riders_select_public` RLS policy also enforces the **hidden rider** feature:
a rider flagged `hidden` is invisible to `anon` (base table, public views, and
PostgREST embeds) while remaining visible to the service role used by admin and
the My Rides lookup. SECURITY DEFINER record/award RPCs bypass RLS and are
filtered explicitly. See [hidden-riders.md](hidden-riders.md).

## Security Headers

The following headers are set on all responses via `next.config.ts`:

- `X-Frame-Options: DENY` - prevents clickjacking
- `X-Content-Type-Options: nosniff` - prevents MIME-type sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` - limits referrer leakage
- `Permissions-Policy` - disables camera, microphone, geolocation

## Anti-Spam on Public Forms

Event registration (`/register/[slug]`, `/register/permanent`) is publicly accessible. The honeypot guard returns a silent `{ success: true }` so bots can't infer that it tripped:

- **Honeypot field** — `HoneypotField` renders a hidden `ro_check` input in each registration form. The field name avoids tokens password managers recognize (`url`, `website`, `homepage`, `email`, `name`) and carries `data-1p-ignore`, `data-lpignore`, `data-bwignore`, and `data-form-type="other"` so 1Password, LastPass, and Bitwarden skip it. Real users can't see or tab to it; bots that fill every field trip the guard. Checked at the top of `registerForEvent`, `registerForPermanent`, and `completeRegistrationWithRider`.

Rate limiting by email (`isRateLimited`) applies as a second layer.

`initBotId` (in `instrumentation-client.ts`) still runs client-side on `POST /register/*` so signals stream into the Vercel BotID dashboard for observability. The server-side `checkBotId()` check was removed: in basic mode (the only mode available on the Hobby plan) it produced false positives on confirmed real users, silently dropping their registrations. Deep analysis would likely fix that but is Pro/Enterprise-only — revisit if the honeypot stops being sufficient.

When the honeypot fires, `logSilentDrop()` emits a Sentry `warning` tagged `guard: 'honeypot'` and `action: 'registerForEvent' | 'registerForPermanent' | 'completeRegistrationWithRider'`, with `eventId`/`routeId` and a truncated SHA-256 of the email (`emailHash`) in `extra`. This lets real-user reports ("the success screen showed but no row was created") be correlated to a guard without leaking PII or signalling anything back to the client.

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

`rider-submissions` previously also had `"Authenticated update for rider submissions"` and `"Authenticated delete for rider submissions"` storage policies, letting any signed-in user overwrite or delete any rider's control-card photo or GPX file. Once rider sign-in shipped, "any signed-in user" stopped meaning "an admin" and started meaning "anyone with an email address" — `20260905100000_lock_down_authenticated_role.sql` drops both policies. Writes to this bucket go through the service-role client exclusively now.

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
