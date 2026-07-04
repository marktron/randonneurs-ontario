# Digital Brevet Card

> Status: **Phase 1 implemented** (2026-07-03). Review decisions in §14;
> implementation map and operational notes in §15. This spec adapts the
> standalone [CTRL prototype](https://github.com/marktron/ctrl) into the
> Randonneurs Ontario site.

## 1. Summary

Give every registered rider a **digital brevet card**: a mobile web page,
reached from their existing capability-token URL, that lists the event's
controls with ACP open/close times and lets them check in at each control
using GPS. Organizers manage controls per event in the admin, watch
check-ins arrive, and use the recorded times when validating results.

The digital card **supplements** the printed card during rollout — it does
not replace it. Paper remains the fallback for dead phones, dead zones, and
riders who don't want it.

## 2. Goals

- Riders check in at controls from their phone with one tap; a timestamped,
  geo-stamped record lands in the club database.
- Works through connectivity gaps: check-ins recorded on-device are synced
  when the network returns. The rider is never blocked on the network.
- Organizers define controls once per event (imported from RWGPS, editable),
  and see a live rider × control grid with anomaly flags.
- Recorded finish check-in feeds the existing result-submission flow.
- No new accounts, no new auth surface: reuses the per-registration
  capability token (`management_token`) exactly like result submission does.

## 3. Non-goals (this feature, all phases)

- Replacing paper cards or changing what is submitted for homologation.
- Rider accounts/logins, native apps, App Store distribution.
- Route-line map rendering or turn-by-turn anything.
- SpotWalla-style continuous live tracking (`/live-tracking` already covers
  that niche).
- Mid-ride device transfer or multi-device sync of the offline queue.

## 4. Decisions & departures from CTRL

CTRL was designed as a portable, no-backend, no-account PWA. This site has a
database, riders, registrations, capability tokens, admin auth, and email.
Several CTRL mechanisms exist only to compensate for having no backend, and
should be dropped rather than ported:

| CTRL mechanism                                                                          | Decision here                                                                                                                                           | Why                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event Access Code + local rider profile + generated rider token                         | **Drop.** Card URL is derived from the registration's `management_token`.                                                                               | We know who's registered. A capability URL is stronger than a shared event code and matches `/results/submit/[token]`.                                                                                                                                                                          |
| SHA-256 hash chain on check-ins                                                         | **Drop.** Store device timestamp + server `received_at` + geo + accuracy instead.                                                                       | A hash chain computed entirely on the rider's device can be regenerated wholesale by that device — it detects accidental corruption, not tampering. Server receive-timestamps on append-only rows are better evidence, and the trust model is the same as paper (signatures are forgeable too). |
| Object-storage mirror (one JSON file per check-in) + CSV export endpoints               | **Drop.** Check-ins are Postgres rows; admin views/exports come from normal queries.                                                                    | The site has a database; the blob layout existed because CTRL refused to have one.                                                                                                                                                                                                              |
| `club-config.json`                                                                      | **Drop.** Defaults live in code; per-control radius is a column.                                                                                        | One club, one deployment.                                                                                                                                                                                                                                                                       |
| IndexedDB as the canonical store, service-worker background sync                        | **Adapt.** Server is canonical; the device keeps a small **outbox** of unsent check-ins and retries. Full PWA installability/service worker is Phase 2. | See §8 Offline strategy.                                                                                                                                                                                                                                                                        |
| BRM time math (`brmTimes.ts`), haversine radius check, "next control" UX, sign-in sheet | **Keep.** The site already has better-tested versions of the first two (`lib/brmTimes.ts`, `lib/geo.ts`); reuse them.                                   |                                                                                                                                                                                                                                                                                                 |
| Code-word check-in fallback                                                             | **Defer** (Phase 2, if ever).                                                                                                                           | Requires organizers to plant/maintain secrets per control. GPS + flagged manual check-in covers the MVP; paper card is the true fallback.                                                                                                                                                       |

## 5. User stories

**Rider**

1. After registering, I can open my brevet card from my registration-manage
   page (and the link in my confirmation email).
2. On event morning the card shows every control: name, km, opening and
   closing time, and my progress.
3. At a control I tap **Check in**. If I'm within the control radius it
   records instantly with a ✓ and the time.
4. If I have no signal, the check-in is saved on my phone and shows
   "waiting to sync"; it uploads automatically when I'm back online.
5. If GPS won't cooperate (urban canyon, indoor control) I can still check
   in — it's recorded but flagged for the organizer, like a missing
   signature on a paper card.
6. After checking in at the finish, the card links me straight to result
   submission (same token).

**Organizer / admin** 7. On the event's admin page I import controls from the route's RWGPS data
(name, km, lat/lng), tweak them, set radii, and save. 8. During the event I see a rider × control grid with check-in times and
flags (out of radius, no GPS, outside time window, late sync). 9. I can add, correct, or delete a check-in (recorded as `admin` method). 10. When validating results, the finish check-in time is surfaced next to
the rider's submitted finish time.

## 6. Data model

Two new tables. Follows house conventions: UUID PKs, `TEXT + CHECK`
pseudo-enums, `update_updated_at_column()` trigger, RLS enabled with **no
anon access** (all reads/writes go through server actions using the
service-role client, same as the other token flows).

```sql
CREATE TABLE event_controls (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL,              -- display/sequence order
  name          TEXT NOT NULL,
  distance_km   NUMERIC(6,1) NOT NULL,         -- open/close computed from this, never stored
  lat           DOUBLE PRECISION,              -- nullable: no coords ⇒ GPS check-in unavailable,
  lng           DOUBLE PRECISION,              --   manual check-in only
  radius_m      INTEGER NOT NULL DEFAULT 500,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, position)
);

CREATE TABLE control_checkins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id      UUID NOT NULL REFERENCES event_controls(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  checked_in_at   TIMESTAMPTZ NOT NULL,        -- device clock at tap time
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),  -- server clock at ingest
  method          TEXT NOT NULL CHECK (method IN ('gps', 'manual', 'admin')),
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  accuracy_m      NUMERIC,
  distance_to_control_m NUMERIC,               -- computed server-side at ingest
  note            TEXT,                        -- rider or admin note
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registration_id, control_id)         -- one check-in per rider per control;
                                               -- also the idempotency key for offline retries
);
```

Design notes:

- **Open/close times are never stored.** They're computed on demand from
  `distance_km` + the event's date/start time via the existing
  `computeControlTimes()` / `createTorontoDate()` — the same single source
  of truth the printed cards use. No staleness when an event is
  rescheduled.
- **`UNIQUE (registration_id, control_id)` doubles as the idempotency
  key.** Offline retries of the same check-in hit the conflict and return
  the existing row — no separate client UUID needed.
- **Anomalies are derived, not stored**: out-of-radius
  (`distance_to_control_m > radius_m`), no-GPS (`method = 'manual'`),
  early/late (`checked_in_at` vs computed window), late sync
  (`received_at - checked_in_at` above a threshold, e.g. 10 min; never
  applied to `method = 'admin'` corrections, whose `received_at` is just
  when the admin typed them in). Computing
  flags at read time keeps ingest dumb and lets us tune thresholds later.
- Controls are **copied per event**, not attached to `routes`: events
  sometimes run routes reversed (`lib/controlPoints.ts`), organizers adjust
  controls per running, and permanents self-schedule.
- "Digital card enabled" = the event has controls **and** `event_type` is
  `brevet`, `populaire`, or `permanent`. Flèches are out of scope for now
  (team, free-route — unclear what a flèche card means).
- Default radius is a generous **500 m**: control coordinates come from
  RWGPS route data that hasn't been fully audited yet. Tighten per control
  (or lower the default) as coordinates are verified. Out-of-radius
  check-ins still succeed with a flag, so this only affects how often
  riders see the "check in anyway" path.

## 7. Rider-facing flow

### Route: `app/card/[token]/page.tsx`

- Token is the registration `management_token` (identical to the
  result-submission trick: one URL family per registration for its whole
  lifecycle). Lookup via service-role server action, 404 on unknown token,
  friendly message when the registration is cancelled or the event has no
  controls.
- Linked from: the registration-manage page (prominent on event day), the
  registration-confirmation email, and — since printed cards already carry
  a QR to `/registration/manage/[token]` — indirectly from the paper card.

### Page behaviour (client component fed by a server load)

- Header: event name, date, distance, rider name.
- Control list, ordered by `position`: name, km, open/close (computed
  server-side, displayed in local time), and per-control status:
  ✓ checked in at HH:MM · **next** (highlighted) · upcoming · queued
  (offline, waiting to sync).
- **Check in** button on any un-checked control (the next expected one is
  emphasized, but out-of-order check-ins are allowed and merely flagged —
  see Open question 3):
  1. Request geolocation (high accuracy, short timeout).
  2. Got a fix → send `{ token, controlId, checkedInAt, lat, lng, accuracy }`
     to the server action. Server validates the token, recomputes distance
     with `haversineMeters()`, inserts with `method='gps'`.
  3. No fix / denied / out of radius → offer "Check in anyway" which
     submits `method='manual'` (with coords if we have them). Recorded,
     flagged, never blocked. The UI says it will be reviewed by the
     organizer.
- **Timing rules**: check-in is allowed before open and after close — the
  device records reality; flags mark early/late and organizers adjudicate,
  exactly like a paper card with an odd time written on it. (Blocking would
  strand riders on edge cases and clock skew.)
- After the finish control is checked: "Submit your result →
  `/results/submit/[token]`" (token already shared between the two flows;
  if no result row exists yet the existing `createEarlyResult` path covers
  it via the manage page).

### Server actions: `lib/actions/brevet-card.ts` (`'use server'`)

- `getBrevetCardByToken(token)` — registration + event + controls +
  computed windows + this rider's check-ins (controls and check-ins fetched
  concurrently; the card page wraps it in React `cache()` so
  `generateMetadata` and the page share one fetch).
- `checkInAtControl(token, input)` — input validation
  (`Number.isFinite` coordinates/accuracy, accuracy capped), rate limit
  (`isRateLimited('checkin', token, 30, 15 min)`), **event-window check**:
  check-ins are rejected outside [event start − 2 h, event start + ACP time
  limit + 6 h] with a clear message (prevents accidental test check-ins
  from polluting real data). The **claimed tap time is bounded too**:
  `checked_in_at` may not be in the future (beyond clock skew) or before
  check-in opened — riders can't backdate outside the window. Then insert,
  `ON CONFLICT` → return existing check-in (idempotent). Transient failures
  (rate limit, DB errors) are marked `retryable: true` so the client outbox
  keeps them queued; only outright rejections are dropped client-side.
- Reads for admin/live views in `lib/actions/control-checkins.ts`.

## 8. Offline strategy (the honest version)

Phase 1 is **online-first with an offline outbox**, not a full PWA:

- The page loads all data it needs (controls, windows, existing check-ins)
  up front; no further reads are required to keep functioning.
- Every check-in attempt is recorded in an in-memory **outbox** (the
  source of truth for syncing) and mirrored to localStorage best-effort so
  it survives reloads — a blocked/full localStorage never stops a check-in
  from sending. Network failures and retryable server responses (rate
  limit, DB hiccups) stay queued; retries run on an interval, on `online`
  events, and on page load. Only outright server rejections are dropped
  (and surfaced to the rider). UI shows "queued — will sync
  automatically". `checked_in_at` is the tap time, so a late sync loses
  nothing but certainty (and is flagged as late-sync for the organizer).
- **Known limitation**: if the rider closes or reloads the tab while
  offline, the page itself won't load until they have signal (the outbox
  survives; it syncs next successful load). Mitigations: phones keep tabs
  alive for hours; Ontario controls are in towns with coverage; paper card
  is the backstop. Full service-worker app-shell caching + installability
  is **Phase 2**, once the flow has proven itself.

This avoids shipping (and debugging) a service worker + cache-invalidation
story in the MVP while still handling the actual failure mode that matters
mid-ride: no signal at the moment of tapping.

## 9. Admin flow

Implemented as a **single page**, `app/admin/events/[id]/brevet-card/`,
with controls management on top and the check-in grid below (one "Digital
Card" button on the event admin page instead of two).

### Manage controls (top section)

- "Import from RWGPS" button: uses `fetchRwgpsControlsWithCoords()` (the
  parser was extended to preserve each control's lat/lng; course points
  without coordinates interpolate from the nearest track point) seeded from
  the event's route; reversed permanents get order + distances flipped with
  coordinates kept. Results land in an editable table (name, km, lat/lng,
  radius, notes) — nothing is saved until the admin hits Save.
- Manual add/edit/delete rows; saving warns before deleting controls
  that already have check-ins (the delete cascades to those check-ins).
- Stretch (Phase 2): prefill the printed-card form from saved controls so
  controls are defined once (today the print flow re-fetches from RWGPS
  each time).

### Live grid (bottom section)

- Riders (rows) × controls (columns); cells show time + flag badges
  (out-of-radius, no-gps, early/late, late-sync). Server-loaded with a
  Refresh button; no websockets in Phase 1.
- Each rider's name links (external-link icon, opens in a new tab) to
  that rider's digital card at `/card/[management_token]`, so an
  organizer can see exactly what the rider sees.
- Click a cell to add / correct / delete a check-in (`method='admin'`,
  note required, audit-logged). Blocked once the event status is
  `submitted`, mirroring results.
- When correcting an existing check-in that has a GPS fix, the dialog shows
  a small map (plain Leaflet + OpenStreetMap tiles, no `react-leaflet`) with
  the rider's recorded point, the control's saved location and radius (when
  the control has coordinates), and a caption giving the distance between
  them (e.g. "GPS fix recorded 320 m from the control (±25 m accuracy)").
  If the control has no saved coordinates, the caption says so but the
  rider's point still shows. Check-ins with no GPS fix (manual/admin) show
  a one-line note instead of a map.
- Phase 2: the finish-control check-in time shown alongside submitted
  finish time in the existing event-results manager.

## 10. Security & abuse

- Same trust model as every other token flow: unguessable UUID capability
  URL, service-role access only from server actions, token columns already
  revoked from `anon`. New tables get RLS enabled with no anon grants.
- Rate limiting via existing `lib/rate-limit.ts` (per token; in-memory per
  server instance — no per-IP backstop, which is acceptable because tokens
  are unguessable UUIDs).
- Validation: coordinates finite and in range, accuracy finite and capped,
  claimed tap time bounded to the acceptance window (no backdating before
  check-in opens, no future times beyond clock skew), control belongs to
  the registration's event, registration status is `registered`.
- The site-wide `Permissions-Policy` header must allow `geolocation=(self)`
  (`next.config.ts`) — an empty allowlist silently blocks the browser
  Geolocation API and every check-in degrades to no-GPS.
- GPS spoofing is possible and **out of scope to prevent** — the paper
  equivalent (forged signatures) is too. The system's job is to make honest
  riding effortless and leave an audit trail (`received_at`, accuracy,
  distance, flags) for organizers.

## 11. Email

- **Temporarily hidden (July 2026):** the confirmation-email card link is
  suppressed while the feature is polished for public use. Flip
  `DIGITAL_CARD_EMAIL_LINK_ENABLED` in
  `lib/actions/registration/helpers.ts` (and update
  `tests/unit/lib/registration-helpers.test.ts`) to restore it. The rest of
  this section describes the intended behavior once re-enabled.
- The registration-confirmation email includes an "Open your brevet card"
  section for **all card-eligible event types**, whether or not the
  organizer has saved controls yet — most riders register before controls
  are configured, and the card page explains itself when digital check-in
  isn't set up. No new emails in Phase 1.
- The registration-manage page shows the card section only once controls
  actually exist (`hasDigitalCard`).

## 12. Testing & docs

- **Unit** (`tests/unit/`): window computation reuse, flag derivation
  (early/late/out-of-radius/late-sync), outbox reducer logic, zod/input
  validation of the check-in action.
- **Integration-real** (`tests/integration-real/`): this touches the DB
  schema + token flows, so per CLAUDE.md the real-DB suite is mandatory —
  token lookup, check-in insert, idempotent conflict behaviour, RLS/anon
  denial on both tables, cascade deletes.
- **E2E** (`tests/e2e/`): card page render + mocked-geolocation check-in
  happy path (Playwright supports `context.setGeolocation`).
- Screenshot policy: the card page is gated by seeded token state → falls
  under the documented screenshot exception; rely on e2e + note it.
- Docs: this file graduates to the feature doc; add an operational section
  for organizers (how to set up controls, read flags).

## 13. Implementation plan

**Phase 1 — MVP (order of work):**

1. Migrations for `event_controls` + `control_checkins` (+ RLS, triggers,
   grants) and regenerated `types/supabase.ts`.
2. `lib/actions/event-controls.ts` (admin CRUD + RWGPS import) and admin
   controls page.
3. `lib/actions/brevet-card.ts` (token read, check-in write) with flag
   derivation and window helpers in `lib/brevet-card.ts`.
4. Rider card page `app/card/[token]/` with outbox + check-in UX (style
   guide "Utility" mode: mobile-first, `h-12` targets, tabular numerals).
5. Admin check-ins grid + manual corrections.
6. Email template line, tests (unit, integration-real, e2e), docs.

Each step lands as its own commit; the branch stays shippable throughout.

**Phase 2 — after real-event feedback:**

- Service worker / installable PWA (offline page reload survival).
- Finish-time prefill into result submission from the finish check-in.
- Public spectator view of event-day progress (respecting
  `share_registration`).
- Printed-card generator reads saved `event_controls`.
- Code-word fallback, if organizers actually want it.

## 14. Review decisions (settled 2026-07-03)

1. **Route name**: `/card/[token]`.
2. **Manual check-in policy**: allow + flag — never block a rider.
3. **Ordering**: out-of-order check-ins allowed, flagged.
4. **Event-day window**: check-ins rejected far outside the event window
   ([start − 2 h, start + ACP limit + 6 h]) with a clear message.
5. **Radius default**: **500 m** — deliberately generous while RWGPS
   control coordinates remain unaudited; tighten later per control.
6. **Phase 1 event types**: `brevet`, `populaire`, and `permanent`.
   `fleche` excluded until a flèche card is defined.

## 15. Implementation map & operational notes

### File map (Phase 1, as shipped)

| Concern                | Location                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema                 | `supabase/migrations/20260703120000_add_digital_brevet_card.sql`                                                                                                                                       |
| Domain logic (pure)    | `lib/brevet-card.ts` — eligibility, event start, acceptance window, control windows, flag derivation                                                                                                   |
| Rider actions          | `lib/actions/brevet-card.ts` — `getBrevetCardByToken`, `checkInAtControl`                                                                                                                              |
| Admin controls actions | `lib/actions/event-controls.ts` — CRUD + RWGPS import                                                                                                                                                  |
| Admin check-in actions | `lib/actions/control-checkins.ts` — grid read, set/delete corrections                                                                                                                                  |
| RWGPS coordinates      | `lib/rwgps.ts` — `extractControlsWithCoords`, `fetchRwgpsControlsWithCoords`                                                                                                                           |
| Rider page             | `app/card/[token]/page.tsx` + `components/brevet-card-view.tsx` (outbox lives here)                                                                                                                    |
| Admin page             | `app/admin/events/[id]/brevet-card/page.tsx` + `components/admin/event-controls-manager.tsx` + `components/admin/event-checkins-grid.tsx` + `components/admin/checkin-map.tsx` (correction-dialog map) |
| Email                  | `lib/email/templates.ts` (`digitalCardUrl`), wired in `lib/actions/registration/finalize.ts`                                                                                                           |
| Tests                  | `tests/unit/lib/brevet-card.test.ts`, `tests/integration-real/brevet-card/checkin.test.ts`, `tests/e2e/brevet-card.spec.ts`                                                                            |

### Organizer how-to

1. Open the event in the admin and click **Digital Card**.
2. Click **Import from RWGPS** (or add rows manually), review names,
   distances, and coordinates, then **Save controls**. Controls without
   coordinates still work — riders just check in without GPS (flagged).
3. Riders reach their card from the registration-confirmation email or
   their registration-manage page; the URL is
   `/card/{management_token}` — same token family as result submission.
4. During the event, watch the check-in grid (Refresh button). Flag
   badges mean:
   - **radius** — GPS fix was farther from the control than its radius.
   - **no gps** — rider checked in without a location fix.
   - **early / late** — outside the ACP open/close window for that control.
   - **late sync** — recorded offline and uploaded more than 10 minutes
     after the tap (normal in dead zones; never shown on admin
     corrections).
     Flags are advisories for validation, not verdicts — treat them like an
     odd-looking time on a paper card.
5. Click any cell to add, correct, or delete a check-in; a note is
   required and every correction is audit-logged. Once the event is marked
   `submitted`, check-ins freeze — including control edits (`saveEventControls`
   refuses, since deleting a control would cascade-delete its check-ins).
6. Coordinates come from RWGPS and may sit a parking lot away from the
   actual control — the generous 500 m default radius absorbs that. As
   coordinates get audited, tighten `radius_m` per control.
