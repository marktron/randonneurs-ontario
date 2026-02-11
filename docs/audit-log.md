# Audit Log

The audit log records admin actions across the system, providing an immutable trail of who did what and when.

## What gets logged

All mutating admin actions are recorded:

| Entity     | Actions                                       |
| ---------- | --------------------------------------------- |
| Event      | create, update, delete, status_change, submit |
| Route      | create, update, delete, merge, toggle active  |
| Rider      | create, merge                                 |
| Result     | create, update, delete, bulk create           |
| Page       | save (create/update)                          |
| Admin User | create, update, delete                        |

Each entry includes:

- The admin who performed the action
- The action type (create, update, delete, status_change, merge, submit)
- The entity type and ID
- A human-readable description
- A timestamp

## Viewing the log

Navigate to **Admin > Management > Audit Log** (`/admin/logs`). This page is restricted to super admins only.

The log displays the 100 most recent entries, ordered newest first.

## Technical details

- **Table:** `audit_logs` in Supabase
- **Helper:** `logAuditEvent()` in `lib/audit-log.ts`
- **Fire-and-forget:** Audit logging never fails the parent operation. Errors are logged to the console but do not propagate.
- **Immutable:** No UPDATE or DELETE policies exist on the table. Logs cannot be modified once written.
- **RLS:** Only authenticated admins can read logs. Inserts are restricted to the service role (server actions).
