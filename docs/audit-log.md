# Audit Log

The audit log records both admin actions and rider-initiated actions on their
own account, providing an immutable trail of who did what and when.

## What gets logged

Every mutating admin action, plus a rider's actions on their own account, is
recorded:

| Entity          | Actions                                                     |
| --------------- | ----------------------------------------------------------- |
| Event           | create, update, delete, status_change, submit               |
| Route           | create, update, delete, merge, toggle active                |
| Rider           | create, merge, account_link, account_unlink, account_delete |
| Result          | create, update, delete, bulk create                         |
| Page            | save (create/update)                                        |
| Admin User      | create, update, delete                                      |
| External result | approve, reject (later phase — no rows exist yet)           |

Rider accounts also add actions a rider performs on their own record, with no
admin involved: `account_link` (linking on sign-in), `account_unlink`, and
`account_delete`. These are written by `logRiderAction()`, not
`logAuditEvent()` — see "Actor model" below.

Each entry includes:

- The actor who performed the action — an admin, or a rider acting on their
  own account (see below)
- The action type (`create`, `update`, `delete`, `status_change`, `merge`,
  `submit`, `account_link`, `account_unlink`, `account_delete`, `approve`,
  `reject`)
- The entity type and ID
- A human-readable description
- A timestamp

## Actor model

`audit_logs` has two actor columns, exactly one of which is set per row
(`audit_logs_actor_check`: `admin_id IS NOT NULL OR actor_user_id IS NOT
NULL`):

- **`admin_id`** — nullable (it wasn't, before rider accounts): the acting
  admin's id, for every action `logAuditEvent()` writes.
- **`actor_user_id`** — the acting rider's `auth.users.id`, for every action
  `logRiderAction()` writes (`lib/audit-log.ts`). Set when a rider links
  their own account on sign-in (`claimRider()`, `lib/account/linking.ts`) or
  deletes their account (`deleteAccountData()`, `lib/account/deletion.ts`).

The admin list UI (`/admin/logs`) shows **"Rider"** as the actor whenever
`admin_id` is null, since there is no admin name to show for a rider-authored
row. An admin linking or unlinking a rider's account from `/admin/riders/[id]`
still writes `admin_id` via `logAuditEvent()` — the actor model doesn't change
which entity type or action name those use, only that the same action names
(`account_link`, `account_unlink`) can now come from either actor.

## Viewing the log

Navigate to **Admin > Management > Audit Log** (`/admin/logs`). This page is restricted to super admins only.

The page has two tabs:

- **Admin Actions** — The 100 most recent admin **and rider-account** actions, ordered newest first. The actor column shows the admin's name, or "Rider" for a row with no `admin_id`.
- **Rider Merges** — The 100 most recent rider merge/link events from registration. Shows who registered, what name they submitted, and the previous name on the rider record. Rows where the submitted name differs from the previous name are highlighted in red, indicating a potential mismatch (e.g. someone registering with the wrong email).

## Technical details

- **Table:** `audit_logs` in Supabase. `admin_id` is nullable and `actor_user_id` was added by `20260905100200_audit_logs_actor_model.sql`, along with the `account_link`/`account_unlink`/`account_delete`/`approve`/`reject` actions and the `external_result` entity type.
- **Helpers:** `logAuditEvent()` for admin actions, `logRiderAction()` for rider actions on their own record — both in `lib/audit-log.ts`.
- **Fire-and-forget:** Audit logging never fails the parent operation. Errors are logged to the console but do not propagate.
- **Immutable:** No UPDATE or DELETE policies exist on the table. Logs cannot be modified once written.
- **RLS:** Only authenticated admins can read logs. Inserts are restricted to the service role (server actions).
