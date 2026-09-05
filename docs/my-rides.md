# My Rides — Quick View on Homepage

## Overview

Returning visitors who have previously registered for a ride see a personalized "Your Rides" section in the homepage sidebar, above the general Upcoming Rides list. This uses the email saved in `localStorage` during registration — no login required. The section has a subtle background tint to distinguish it from the rest of the sidebar.

## How It Works

1. **Registration saves data**: When a rider registers for any event, `localStorage` stores their name and email under the key `ro-registration`.
2. **Homepage checks for saved data**: The `MyRidesSection` client component reads `localStorage` on mount.
3. **Server action fetches rides**: If an email is found, it calls `getMyUpcomingRides(email)` which queries the database for upcoming registered events.
4. **Conditional rendering**: If rides are found, the section fades in. If not (or if no saved data), nothing is rendered — no layout shift.

## Behavior Matrix

| Visitor type                             | What they see                                                                                                         |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| First-time visitor (no localStorage)     | Normal homepage — no extra section                                                                                    |
| Returning visitor with upcoming rides    | "Your Rides" section in sidebar with ride list (first 3 shown, expandable)                                            |
| Returning visitor with no upcoming rides | Normal homepage — section not rendered                                                                                |
| Corrupted localStorage                   | Normal homepage — section not rendered                                                                                |
| Signed in (rider account, linked)        | Same section, sourced from the account instead of localStorage, plus an "All my rides" link to `/account` (see below) |

## Signed-in riders

Since rider accounts shipped (`docs/rider-accounts.md`), `MyRidesSection`
checks the signed-in account **before** falling back to `localStorage`:
`getAccountUpcomingRides()` (`lib/actions/my-rides.ts`) calls `getAccount()`
and, if there is a linked rider, returns `{ signedIn: true, firstName,
rides }` sourced by `rider.id` rather than by email lookup. The component
only reads `localStorage` when `getAccountUpcomingRides()` reports
`signedIn: false` (no session at all). This means:

- A signed-in, linked rider always sees their own account's rides, even if
  the browser's `localStorage` has a stale or different `ro-registration`
  email.
- A signed-in, **unlinked** account (no rider row yet) shows nothing extra —
  there is no rider to look up, and it does not fall back to `localStorage`
  either, since the visitor is authenticated and any locally-saved email is
  moot.
- When the account is linked, the section adds an **"All my rides"** link to
  `/account`, which lists the complete upcoming/past history (this widget
  still only ever shows the first 3, expandable). Anonymous
  (`localStorage`-sourced) rendering has no such link.

`/account` itself (`lib/account/rides.ts`, `docs/rider-accounts.md`) is the
full picture: every registration, tokens included, split upcoming/past. This
homepage widget is a small preview of the same data for a signed-in rider,
and the pre-existing fallback for everyone else.

## Files

| File                              | Purpose                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------- |
| `lib/actions/my-rides.ts`         | Server actions: `getMyUpcomingRides(email)`, `getAccountUpcomingRides()`     |
| `lib/account/rides.ts`            | `getAccountRides(riderId)` — the full `/account` history, not just upcoming  |
| `components/my-rides-section.tsx` | Client component: checks the account, falls back to localStorage, renders UI |
| `app/page.tsx`                    | Homepage: includes `<MyRidesSection />` in sidebar above `<UpcomingRides />` |

## Security

- **Email sent via POST** (server action), never in URL
- **No enumeration**: Unknown emails return `[]`, same as "no upcoming rides"
- **No PII in response**: Only public event data (names, dates, distances) already visible on the calendar
- **firstName in greeting** comes from localStorage, not from server

## Data Flow

```
localStorage('ro-registration')
  → { email, firstName }
  → getMyUpcomingRides(email)    [server action, POST]
  → riders table (lookup by email)
  → registrations JOIN events JOIN chapters
  → filter: status='registered', event status='scheduled', date >= today
  → MyUpcomingRide[] (slug, name, date, distance, startTime, startLocation, chapterName)
```

## Testing

```bash
# Server action tests
npx vitest run tests/integration/actions/my-rides.test.ts

# Component tests
npx vitest run tests/unit/components/my-rides-section.test.tsx
```
