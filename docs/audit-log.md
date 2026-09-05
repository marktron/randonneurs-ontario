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

`audit_logs` has three actor-related columns (`admin_id` and `actor_user_id`
satisfy `audit_logs_actor_check`: `admin_id IS NOT NULL OR actor_user_id IS
NOT NULL`):

- **`admin_id`** — nullable (it wasn't, before rider accounts), `REFERENCES
admins(id) ON DELETE SET NULL`: the acting admin's id, for every action
  `logAuditEvent()` writes. It goes `NULL` once that admin is deleted
  (`deleteAdminUser()`, `lib/actions/admin-users.ts`) — the row is kept, not
  cascade-deleted, so admin history survives losing an admin account.
- **`actor_user_id`** — no foreign key, so it is never nulled out by a
  deletion. The durable actor id: for a rider action it's the rider's
  `auth.users.id` (written by `logRiderAction()`); for an admin action it's
  the same id as `admin_id` at write time (written by `logAuditEvent()`, so
  the id survives even after `admin_id` is later nulled by the admin being
  deleted). Also set when a rider links their own account on sign-in
  (`claimRider()`, `lib/account/linking.ts`) or deletes their account
  (`deleteAccountData()`, `lib/account/deletion.ts`).
- **`actor_label`** — added by `20260905100300_audit_logs_admin_delete_set_null.sql`.
  A durable snapshot of the acting admin's display name, taken at write time
  by `logAuditEvent()`. Always `NULL` for rider-authored rows (`logRiderAction()`
  never sets it — a rider row's identity comes from `entity_id`/description,
  not from a name lookup). It's the fallback once `admin_id` is `NULL` and the
  `admins` join can no longer resolve a name.

The admin list UI (`/admin/logs`) resolves the actor as `admins.name` (live
admin) → `actor_label` (deleted admin's name, snapshotted) → `"Rider"` (no
admin name, but an `actor_user_id` is set) → `"Unknown"`. An admin linking or
unlinking a rider's account from `/admin/riders/[id]` still writes `admin_id`
via `logAuditEvent()` — the actor model doesn't change which entity type or
action name those use, only that the same action names (`account_link`,
`account_unlink`) can now come from either actor.

### Deleting an admin doesn't lose their audit history

Before `20260905100300_audit_logs_admin_delete_set_null.sql`, `admin_id` had
no `ON DELETE` clause, so `deleteAdminUser()` failed with a foreign-key
violation for any admin who had ever written an audit row. The FK is now `ON
DELETE SET NULL`, and `logAuditEvent()` populates `actor_user_id`/`actor_label`
at write time so the row is self-sufficient once `admin_id` goes `NULL`.

A backfill in that migration set `actor_user_id`/`actor_label` on every
pre-existing admin-authored row. As a safety net for any row that reaches an
admin deletion without `actor_user_id` already set (e.g. a direct insert that
bypassed `logAuditEvent()`), a `BEFORE UPDATE` trigger
(`audit_logs_preserve_actor_on_admin_delete`) copies `admin_id` into
`actor_user_id` when the FK's `SET NULL` action would otherwise leave both
columns null and trip `audit_logs_actor_check`. That trigger cannot also
backfill `actor_label` — by the time it fires, the admin's row is already
gone from `admins` in the same transaction — so a row that reaches it without
`actor_label` already set keeps `actor_label = NULL` and falls back to
`"Rider"` in the UI. This is understood to only affect audit rows written by
something other than `logAuditEvent()`.

## Viewing the log

Navigate to **Admin > Management > Audit Log** (`/admin/logs`). This page is restricted to super admins only.

The page has two tabs:

- **Admin Actions** — The 100 most recent admin **and rider-account** actions, ordered newest first. The actor column shows the admin's name, falling back to the snapshotted `actor_label` if that admin has since been deleted, then "Rider" for a row with no `admin_id` and no `actor_label`.
- **Rider Merges** — The 100 most recent rider merge/link events from registration. Shows who registered, what name they submitted, and the previous name on the rider record. Rows where the submitted name differs from the previous name are highlighted in red, indicating a potential mismatch (e.g. someone registering with the wrong email).

## Technical details

- **Table:** `audit_logs` in Supabase. `admin_id` is nullable and `actor_user_id` was added by `20260905100200_audit_logs_actor_model.sql`, along with the `account_link`/`account_unlink`/`account_delete`/`approve`/`reject` actions and the `external_result` entity type. `actor_label` and the `admin_id` FK's `ON DELETE SET NULL` were added by `20260905100300_audit_logs_admin_delete_set_null.sql`.
- **Helpers:** `logAuditEvent()` for admin actions, `logRiderAction()` for rider actions on their own record — both in `lib/audit-log.ts`.
- **Fire-and-forget:** Audit logging never fails the parent operation. Errors are logged to the console but do not propagate.
- **Immutable:** No UPDATE or DELETE policies exist on the table, so no client or server action can modify or remove a row. The one exception is internal to Postgres: deleting an admin fires the `admin_id` foreign key's `ON DELETE SET NULL` action, which updates any of that admin's rows to null out `admin_id` (and, via `audit_logs_preserve_actor_on_admin_delete`, preserve `actor_user_id`) — this runs as part of referential-integrity enforcement, not as a policy-gated client update.
- **RLS:** Only authenticated admins can read logs. Inserts are restricted to the service role (server actions).
