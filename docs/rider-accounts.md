# Rider Accounts

## Purpose

Riders previously had no durable identity on the site: "My rides" ran off a
`localStorage` email, registration matched riders by fuzzy name/email, and
every self-service flow (manage a registration, view a digital card, submit a
result) depended on a capability token mailed once and never rotated. Rider
accounts give a rider an optional, persistent sign-in that links to their
existing rider record, so they can see their own ride history from any device
without a token in hand.

This is phase 0+1 of the design: the `authenticated`-role lockdown, sign-in,
linking, and "My rides". Registration prefill, a rider-authored profile
(bio/photo), and rider-submitted out-of-club results are later phases — see
"Later phases" below.

## Sign-in flow (code only)

Sign-in is a 6-digit email code (Supabase email OTP) — no passwords, no magic
links. An account is not proof of identity beyond "controls this mailbox";
using a code rather than a link keeps the credential something a rider
copy-types rather than something that can be silently pre-fetched or forwarded,
and avoids shipping a password reset flow the club would then have to secure
and support.

1. `/account/login` — rider enters an email. The form carries a Cloudflare
   Turnstile challenge. Server action `requestSignInCode(email, captchaToken)`
   (`lib/actions/account.ts`) normalizes the email, checks the in-process rate
   limiter, then calls `supabase.auth.signInWithOtp({ email, options: {
shouldCreateUser: true, captchaToken } })`. The response is identical
   whether or not the address is known — "If that address is known to us, a
   code is on its way." (`lib/account/messages.ts`).
2. Rider enters the 6-digit code. `verifySignInCode(email, code)` checks the
   rate limiter, then `supabase.auth.verifyOtp({ email, token, type: 'email'
})`. A wrong or expired code returns "That code is invalid or expired."
   Neither step ever reveals whether an email exists.
3. On success `afterSignIn()` runs linking (below) and returns the path to
   redirect to. The redirect itself is constrained by
   `getSafeAccountRedirect()` (`lib/account/redirect.ts`) to `/account/*` or
   `/register/*` — the same allow-list pattern as `/admin/login`.

A rider can technically set a password later via `updateUser({ password })`;
this is accepted because it grants nothing beyond the session the code
already grants, and admin access is gated by the `admins` table, not by auth
method. The site never offers a password UI to riders.

## Routes

| Route                | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `/account/login`     | Email → code → verify.                                           |
| `/account`           | Overview: greeting, rider number, My rides.                      |
| `/account/choose`    | Family-email picker when more than one rider shares the address. |
| `/account/unmatched` | Shown when no rider matches the signed-in email.                 |
| `/account/settings`  | Change email, sign out, delete account.                          |

`/account/profile` and the external-results routes are later phases and do
not exist yet.

## Linking rules

Linking runs once, right after a successful code verification, only while the
account has no linked rider yet (`lib/account/linking.ts`):

- **0 candidates** (no rider shares this email and is unlinked) → redirect to
  `/account/unmatched`. The account persists, unlinked; linking is
  re-evaluated on every future sign-in the rider hasn't linked by, so an
  admin link made in the meantime is picked up automatically — and so is a
  first registration, which is what the `/account/unmatched` copy tells a
  brand-new rider to do (sign in again afterwards). Linking _during_
  registration is phase 2 and is deliberately not promised anywhere.
- **1 candidate** → linked immediately, redirect to `/account`.
- **N candidates** (a shared family email) → redirect to `/account/choose`,
  which lists each candidate as "First L." and lets the rider pick themselves.
  The unpicked family members keep needing their own email to get an account.

**Atomic claim:** the link is a single conditional `UPDATE riders SET
auth_user_id = $user, linked_at = now() WHERE id = $rider AND auth_user_id IS
NULL AND lower(email) = $email` (`claimRider`). Exactly one row updates or the
claim fails silently and `resolveLink()` re-evaluates once — this is what
makes a race between two concurrent sign-ins, an admin link, or a merge safe:
whichever write lands first wins, and the loser sees a `choose`/`unmatched`
outcome instead of overwriting the link. A successful claim is audit-logged
as `account_link` with `actorUserId` set to the rider.

**Admin link/unlink** (`/admin/riders/[id]`, `components/admin/rider-account-card.tsx`,
`lib/actions/riders.ts`): an admin enters an email; `linkRiderAccount()` calls
the SECURITY DEFINER function `auth_user_id_for_email(text)` (service-role
only — `auth.admin.listUsers` has no email filter) to resolve the auth user,
then does the same atomic `UPDATE ... WHERE auth_user_id IS NULL`. This only
works once the rider has signed in at least once with that address.
`unlinkRiderAccount()` clears `auth_user_id`/`linked_at`; the auth user itself
is untouched and can sign in again to re-link or be re-linked by an admin.
Both actions require `isFullAdmin()` and are audit-logged as `account_link` /
`account_unlink` with an `admin_id` actor.

**Merge behaviour** (`mergeRiders`, `lib/actions/riders.ts`): `auth_user_id`
is `UNIQUE`, so at most one of the merged rows can end up linked.

- If the target already has a link, it wins; every linked source is unlinked
  (their auth users are untouched, just detached).
- If only sources have links, the first one found moves to the target with
  its original `linked_at`.
- The count of links that were dropped (not moved) is appended to the audit
  description, e.g. `"...(dropped account link: 1)"` (pluralized past one).
- Bio/photo: the target's non-null value wins; otherwise the first source's
  non-null value is used. Orphaned values are not separately cleaned up in
  phase 1 (no photo storage yet).

**Email sync on next sign-in:** `afterSignIn()` treats the verified Supabase
auth email as authoritative for an already-linked rider. If `riders.email`
differs from the auth email (case-insensitive), it is updated on the rider
row on that sign-in — no separate "previous email" bookkeeping.

## The `authenticated`-role rule

> **`authenticated` may hold the same public grants as `anon` and nothing
> more.**

Once anyone can sign in, `authenticated` is exactly as trustworthy as `anon`
— a hostile visitor can obtain a session as easily as a legitimate rider. All
private or owner-scoped access (a rider's own email/phone, another rider's
capability tokens, `auth_user_id`/`linked_at`) is never granted on the basis
of role membership; every such read or write goes through a server action
using the service-role client, gated in application code by `requireRider()`
or `requireAccount()`. Migration `20260905100000_lock_down_authenticated_role.sql`
enforces this once for existing tables, revoking the legacy blanket grants
`authenticated` held on `riders`, `registrations`, `results`,
`event_controls`, and `control_checkins`, and re-granting only the same
column list `anon` already had (plus dropping two storage policies that let
any signed-in user overwrite or delete another rider's control-card photos or
GPX files). `20260905100100_add_rider_account_columns.sql` extends that same
column allow-list with `bio`/`photo_path` only — `auth_user_id` and
`linked_at` are never granted to `anon` or `authenticated`.
Two real-DB suites are the regression tests.
`tests/integration-real/authenticated-role-lockdown.test.ts` signs in as a
fresh, unlinked user and asserts it cannot read rider
`email`/`phone`/`emergency_contact_*`, the `registrations` base table, or
`results.submission_token`, and cannot write to `riders` or any storage
bucket. `tests/integration-real/rider-account-columns.test.ts` covers the two
account columns added later — it is where "authenticated cannot read
`auth_user_id` or `linked_at`" is asserted.

## Dual-role users (admin who is also a rider)

An admin and a rider can be the same `auth.users` row — they share one
Supabase session in one browser. Behaviour:

| Action                                | Behaviour                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in with a code                   | Works; the session is both admin and rider at once.                                                                                                                                                                                                                                                                                                                          |
| `/admin/login` while signed in        | Admin → `/admin`; a signed-in non-admin → `/account` (not an infinite redirect loop).                                                                                                                                                                                                                                                                                        |
| Rider sign-out (`/account/settings`)  | Ends the shared browser session, including the admin session.                                                                                                                                                                                                                                                                                                                |
| Change email from `/account/settings` | Blocked; the form is disabled and points the admin to the admin settings page, which keeps `admins.email` in sync.                                                                                                                                                                                                                                                           |
| Delete account                        | Blocked entirely; the dialog trigger is disabled with an explanatory message.                                                                                                                                                                                                                                                                                                |
| Linking                               | Allowed and independent — `admins.id` and `riders.auth_user_id` don't interact.                                                                                                                                                                                                                                                                                              |
| Promoting a rider to admin            | `createAdminUser()` looks the email up via `auth_user_id_for_email` and reuses the existing auth user (setting its password) instead of failing on "email already registered"; the rider link is untouched.                                                                                                                                                                  |
| Promoting an email already an admin   | Refused before any mutation — `createAdminUser()` checks for an existing `admins` row first, so a super admin cannot reset another admin's password by "creating" them again.                                                                                                                                                                                                |
| Remove admin role                     | `deleteAdminUser()` first looks for a rider with `auth_user_id = <that user>`. If one exists, only the `admins` row is deleted and the auth user is kept, so the rider stays signed in and linked; the audit entry reads "Removed admin role from `<email>`; account kept because it is linked to rider `<name>`". With no linked rider, the auth user is deleted as before. |

## My rides

`/account` renders `getAccountRides(riderId)` (`lib/account/rides.ts`): every
`registrations` row for the rider joined to its event and chapter, plus the
rider's `results.status` for that event, split into upcoming/past by
`splitRides()` (pure, unit-tested). Upcoming = event `status = 'scheduled'`,
`event_date >= today`, and the registration itself isn't `cancelled`;
everything else is past. Each row links to `/registration/manage/[token]` and,
for upcoming rides, `/card/[token]` — tokens are read with the service-role
client and only ever rendered for the account's own `riderId` (never a
client-supplied id). A past ride links through its
`registrations.management_token` too — `results.submission_token` is
deliberately never surfaced to the page, so `authenticated` gaining a way to
read it would still expose nothing here.

The homepage widget (`components/my-rides-section.tsx`,
`docs/my-rides.md`) now checks the signed-in account first
(`getAccountUpcomingRides()`, `lib/actions/my-rides.ts`): if signed in and
linked, it shows the account's own upcoming rides and an "All my rides" link
to `/account`; if not signed in, it falls back to the existing anonymous
`localStorage` widget. Signed-in-but-unlinked renders nothing extra (no rides
to show, and no email to look up).

## Settings

`/account/settings` (`app/account/settings/page.tsx`):

- **Change email** — `changeAccountEmail(newEmail)` calls
  `auth.updateUser({ email })`. Supabase's `double_confirm_changes` is on, so
  the rider must click the confirmation link sent to **both** the old and the
  new address before the change takes effect; the UI tells them so
  (`ChangeEmailForm`). Blocked for admins (see dual-role table).
- **Sign out** — `signOutRider()` calls `auth.signOut({ scope: 'local' })`:
  this browser only, not every device.
- **Delete account** — requires a **freshly emailed code**, not the existing
  session: the dialog runs `requestSignInCode` again (with its own Turnstile
  challenge) and then `deleteAccount(code)` re-verifies via `verifyOtp`
  before doing anything — a deliberate choice over inspecting an `auth_time`
  claim on the existing JWT, which Supabase does not refresh per action and
  which would let a session left open on a shared machine delete the account. `deleteAccountData()` (`lib/account/deletion.ts`)
  works in that order deliberately: (1) `auth.admin.deleteUser` — it throws on
  failure, and until it succeeds nothing has changed, so a retry is clean; the
  FK on `riders.auth_user_id` (`ON DELETE SET NULL`) and its trigger clear the
  link and `linked_at`, but only for a rider still pointing at that user;
  (2) null out `bio`/`photo_path`, scoped by `auth_user_id IS NULL` so that an
  admin re-pointing the rider at someone else in between makes it a no-op
  rather than wiping the new owner's profile; (3) log `account_delete`, last,
  so an audit row only ever describes work that actually
  happened. **What survives:** the rider row itself, and every
  registration and result — those are club records, not account data.
  Pending/rejected external results would be deleted once that phase ships;
  none exist yet. Blocked entirely for admins.

## Rate limits and Turnstile

- `requestSignInCode`: `isRateLimited('rider-otp', email, 5, 10 min)` — a
  silent no-op (returns the generic success message) past the limit; the real
  enforcement is Supabase's own per-email send limit.
- `verifySignInCode`: `isRateLimited('rider-otp-verify', email, 10, 10 min)`
  — returns "Too many attempts. Request a new code." past the limit.
- Both limiters are `lib/rate-limit.ts`'s in-process, sweeper-backed store —
  a convenience layer only, since the sweeper drops keys idle for 10 minutes
  and the store doesn't survive a restart or span multiple server instances.
  CAPTCHA and Supabase's own auth rate limits are the real controls.
- **Turnstile** (`components/account/turnstile-field.tsx`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`): renders nothing when the site key is
  unset, which is the local-dev and test default. When Supabase's own CAPTCHA
  setting is enabled (production only — see the checklist), the widget's
  token is required and Supabase itself rejects requests without a valid one.
  CAPTCHA is a project-wide Supabase Auth setting, so it also gates admin
  password sign-in and the admin change-password re-authentication, not just
  rider OTP — `app/admin/login/page.tsx` and
  `components/admin/change-password-form.tsx` render `TurnstileField` and
  pass the token into `login`/`changePassword` (`lib/actions/auth.ts`) the
  same way the rider sign-in form does.

## Local development

- Codes land in **Mailpit** at `http://127.0.0.1:54324` (Supabase's `config.toml`
  still calls the section `[inbucket]` for historical reasons, but the local
  CLI runs Mailpit under that key) — read them from its API or UI rather than
  a real inbox.
- The email template is `supabase/templates/rider-otp.html`, wired in
  `supabase/config.toml` under **both** `[auth.email.template.magic_link]`
  and `[auth.email.template.confirmation]`. Both must point at the same file:
  `shouldCreateUser: true` on `requestSignInCode` means a brand-new address
  gets the "Confirm signup" template rather than "Magic Link" on a project
  with email confirmation enabled (the hosted default; masked locally by
  `enable_confirmations = false`), so both need the code-only override or a
  first-time rider gets a link instead of a code.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset locally, and `[auth.captcha]`
  stays disabled in `config.toml` — the sign-in form and Supabase agree there
  is no challenge to satisfy.
- The template file is read at Supabase container startup, not on each
  request: after editing `supabase/templates/rider-otp.html`, run
  `npx supabase stop && npx supabase start` to pick up the change (a plain
  `db reset` does not reload it).

## Production checklist (once, before enabling rider sign-in)

1. **Custom SMTP** — Supabase Dashboard → Authentication → SMTP Settings: host `email-smtp.<region>.amazonaws.com`, port 587, SES SMTP credentials, sender `no-reply@randonneurs.to`, sender name `Randonneurs Ontario`. Without this the default sender is capped at 2 emails/hour.
2. **Email template** — Authentication → Email Templates: paste the token-only HTML (`supabase/templates/rider-otp.html`) into **both** "Magic Link" and "Confirm signup", subject `Your Randonneurs Ontario sign-in code` on each. A new address on a project with email confirmation enabled receives the Confirm-signup template, not Magic Link, so both must contain `{{ .Token }}` and no `{{ .ConfirmationURL }}`.
3. **Turnstile site key first** — create the widget in Cloudflare, add the production and preview hostnames to its allowed domains, then add `NEXT_PUBLIC_TURNSTILE_SITE_KEY` to Vercel (production **and** preview) and redeploy. Load `/account/login` and confirm the widget actually renders. Do this **before** step 4: `TurnstileField` renders nothing when the key is unset, so enabling CAPTCHA in Supabase first locks every rider out of sign-in with "Please complete the verification and try again" and no widget to complete.
4. **CAPTCHA** — Authentication → Attack Protection → Enable CAPTCHA, provider Turnstile, secret from Cloudflare. Only once step 3 is verified in the deployed app. This setting is global: once enabled it also covers admin password sign-in (`app/admin/login/page.tsx`) and the admin change-password re-authentication (`components/admin/change-password-form.tsx`), both of which already render `TurnstileField` and forward the token to `lib/actions/auth.ts`'s `login`/`changePassword`. The Turnstile site key from step 3 must be deployed before this step for admin flows too, or admins are locked out the same way riders would be.
5. **Site URL and redirect allow-list** — Authentication → URL Configuration: Site URL is the production origin (`https://randonneurs.to`), and the Redirect URLs list covers it plus any preview origins in use. The email-change confirmation links Supabase sends from `changeAccountEmail` are built from these; a stale Site URL sends riders to the wrong host and the change never confirms.
6. **Rate limits** — Authentication → Rate Limits: emails sent 2 → 60 per hour. Leave the others.
7. **Sign-ups** — Authentication → Providers → Email: "Allow new users to sign up" ON (it is today), "Confirm email" irrelevant for OTP.
8. **Migrations** — merge to main; `deploy-migrations.yml` applies `20260905100000`, `20260905100100`, `20260905100200`. Verify in the SQL editor:

   ```sql
   select column_name, has_column_privilege('authenticated', 'public.riders', column_name, 'SELECT') as can_select
   from information_schema.columns where table_schema = 'public' and table_name = 'riders' order by 1;
   ```

   `can_select` should be true for exactly `id, slug, first_name, last_name, gender, rider_number, created_at, updated_at, bio, photo_path` and false for everything else (notably `email`, `phone`, `emergency_contact_*`, `auth_user_id`, `linked_at`, `hidden`). (`information_schema.column_privileges` is not used here — it reports false positives for `anon`/`authenticated` on this project.)

   Then confirm the other two tables the lockdown migration touched — `authenticated` must hold **no** privilege on `registrations`, and on `results` only the same columns `anon` has:

   ```sql
   -- every one of these must be false
   select p as privilege, has_table_privilege('authenticated', 'public.registrations', p) as granted
   from unnest(array['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER']) as p;

   -- can_select must match anon exactly; submission_token in particular must be false
   select column_name,
          has_column_privilege('anon', 'public.results', column_name, 'SELECT') as anon_can_select,
          has_column_privilege('authenticated', 'public.results', column_name, 'SELECT') as auth_can_select
   from information_schema.columns
   where table_schema = 'public' and table_name = 'results' order by 1;
   ```

9. **Advisors** — Dashboard → Advisors → Security: no new findings for `riders`, `audit_logs`, `auth_user_id_for_email`.
10. **Smoke test** — sign in with a real rider email on production, confirm the code arrives from `no-reply@randonneurs.to`, the account links, and `/account` lists rides.

## Testing

```bash
# Unit — linking decisions, redirect allow-list, ride splitting, get-rider helpers
npx vitest run tests/unit/account/ tests/unit/auth/get-rider.test.ts tests/unit/audit-log.test.ts

# Mock integration — server actions for signed-out/unlinked/linked/dual-role
npx vitest run tests/integration/actions/account.test.ts tests/integration/actions/account-rides.test.ts tests/integration/actions/rider-accounts-admin.test.ts

# Real-DB (needs `npx supabase start`; run with Node 24 — see docs/TESTING.md)
nvm use 24 && npx vitest run --config vitest.config.integration-real.mts \
  tests/integration-real/authenticated-role-lockdown.test.ts \
  tests/integration-real/rider-account-columns.test.ts \
  tests/integration-real/account-linking.test.ts \
  tests/integration-real/account-deletion.test.ts \
  tests/integration-real/merge-riders-accounts.test.ts

# E2E — needs the dev server and Mailpit (npx supabase start)
npx playwright test tests/e2e/account-login.spec.ts --project=chromium
```

## Housekeeping

`scripts/cleanup-unlinked-auth-users.ts` deletes auth users that were never
linked to a rider, are not admins, and have not signed in for 12 months —
accounts created by mistake, or by someone who requested a code and never
returned. Dry-run by default:

```bash
npx tsx scripts/cleanup-unlinked-auth-users.ts          # report only
npx tsx scripts/cleanup-unlinked-auth-users.ts --apply   # delete
```

Run manually (not on a schedule yet); nothing else references these users.

## Later phases

Registration prefill (phase 2), a rider-authored profile with bio and photo
(phase 3), and rider-submitted out-of-club results (phase 4) were designed
alongside phase 0+1 but are not built yet. Explicit non-goals for v1:
magic-link sign-in, passkeys, social/OAuth, MFA, enforcing OTP-only per user,
multi-rider (family) accounts, counting external results toward totals or
records, pre-moderation of profile content, and replacing capability tokens
(the emailed links keep working unchanged).
