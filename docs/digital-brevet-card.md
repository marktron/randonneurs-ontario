# Digital Brevet Card — Feature Spec (DRAFT for review)

> Status: **draft** — not yet implemented. This spec adapts the standalone
> [CTRL prototype](https://github.com/marktron/ctrl) into the Randonneurs
> Ontario site. Review the "Decisions & departures from CTRL" and "Open
> questions" sections first.

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

| CTRL mechanism | Decision here | Why |
| --- | --- | --- |
| Event Access Code + local rider profile + generated rider token | **Drop.** Card URL is derived from the registration's `management_token`. | We know who's registered. A capability URL is stronger than a shared event code and matches `/results/submit/[token]`. |
| SHA-256 hash chain on check-ins | **Drop.** Store device timestamp + server `received_at` + geo + accuracy instead. | A hash chain computed entirely on the rider's device can be regenerated wholesale by that device — it detects accidental corruption, not tampering. Server receive-timestamps on append-only rows are better evidence, and the trust model is the same as paper (signatures are forgeable too). |
| Object-storage mirror (one JSON file per check-in) + CSV export endpoints | **Drop.** Check-ins are Postgres rows; admin views/exports come from normal queries. | The site has a database; the blob layout existed because CTRL refused to have one. |
| `club-config.json` | **Drop.** Defaults live in code; per-control radius is a column. | One club, one deployment. |
| IndexedDB as the canonical store, service-worker background sync | **Adapt.** Server is canonical; the device keeps a small **outbox** of unsent check-ins and retries. Full PWA installability/service worker is Phase 2. | See §8 Offline strategy. |
| BRM time math (`brmTimes.ts`), haversine radius check, "next control" UX, sign-in sheet | **Keep.** The site already has better-tested versions of the first two (`lib/brmTimes.ts`, `lib/geo.ts`); reuse them. | |
| Code-word check-in fallback | **Defer** (Phase 2, if ever). | Requires organizers to plant/maintain secrets per control. GPS + flagged manual check-in covers the MVP; paper card is the true fallback. |

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

**Organizer / admin**
7. On the event's admin page I import controls from the route's RWGPS data
   (name, km, lat/lng), tweak them, set radii, and save.
8. During the event I see a rider × control grid with check-in times and
   flags (out of radius, no GPS, outside time window, late sync).
9. I can add, correct, or delete a check-in (recorded as `admin` method).
10. When validating results, the finish check-in time is surfaced next to
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
  radius_m      INTEGER NOT NULL DEFAULT 150,
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
  (`received_at - checked_in_at` above a threshold, e.g. 10 min). Computing
  flags at read time keeps ingest dumb and lets us tune thresholds later.
- Controls are **copied per event**, not attached to `routes`: events
  sometimes run routes reversed (`lib/controlPoints.ts`), organizers adjust
  controls per running, and permanents self-schedule.
- "Digital card enabled" = the event has controls. No new flag on `events`.

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

- `getBrevetCard(token)` — registration + event + controls + computed
  windows + this rider's check-ins.
- `checkInAtControl(token, input)` — zod-style validation, rate limit
  (`isRateLimited('checkin', token, 30, 15 min)`), event-day sanity check
  (reject if event is not within ~a day of now — see Open question 4),
  insert, `ON CONFLICT` → return existing check-in (idempotent).
- Reads for admin/live views in `lib/data/brevet-card.ts`.

## 8. Offline strategy (the honest version)

Phase 1 is **online-first with an offline outbox**, not a full PWA:

- The page loads all data it needs (controls, windows, existing check-ins)
  up front; no further reads are required to keep functioning.
- Every check-in attempt is written to a small IndexedDB/localStorage
  **outbox** first, then sent. On failure it stays queued; retries run on
  an interval, on `online` events, and on page load. UI shows "queued —
  will sync automatically". `checked_in_at` is the tap time, so a late sync
  loses nothing but certainty (and is flagged as late-sync for the
  organizer).
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

### `app/admin/events/[id]/controls/` — manage controls

- "Import from RWGPS" button: reuses `fetchRwgpsControls()` (already parses
  `course_points`/POIs with km + lat/lng) seeded from the event's route;
  respects `reverseControls()` for reversed permanents. Results land in an
  editable table (name, km, lat/lng, radius, notes) — same UX skeleton as
  the existing control-cards admin form, but this one **saves to the DB**.
- Manual add/edit/delete rows; re-import warns before replacing controls
  that already have check-ins.
- Stretch: prefill the printed-card form from saved controls so controls
  are defined once (today the print flow re-fetches from RWGPS each time).

### `app/admin/events/[id]/checkins/` — live grid

- Riders (rows) × controls (columns); cells show time + flag icons
  (out-of-radius, manual, early/late, late-sync). Server component with a
  refresh; no websockets in Phase 1.
- Add / correct / delete a check-in (`method='admin'`, note required).
  Blocked once the event status is `submitted`, mirroring results.
- Result validation: the finish-control check-in time shown alongside
  submitted finish time in the existing event-results manager.

## 10. Security & abuse

- Same trust model as every other token flow: unguessable UUID capability
  URL, service-role access only from server actions, token columns already
  revoked from `anon`. New tables get RLS enabled with no anon grants.
- Rate limiting via existing `lib/rate-limit.ts` (per token, and a
  per-IP backstop on the action).
- Validation: coordinates in range, accuracy sane, control belongs to the
  registration's event, registration status is `registered`.
- GPS spoofing is possible and **out of scope to prevent** — the paper
  equivalent (forged signatures) is too. The system's job is to make honest
  riding effortless and leave an audit trail (`received_at`, accuracy,
  distance, flags) for organizers.

## 11. Email

- Add one line + link to the existing registration-confirmation template
  ("Your digital brevet card: …/card/[token]") — only when the event has
  controls at send time; otherwise unchanged. No new emails in Phase 1.

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
3. `lib/actions/brevet-card.ts` + `lib/data/brevet-card.ts` (token read,
   check-in write, flag derivation helpers in `lib/brevet-card/`).
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

## 14. Open questions (need your call)

1. **Route name**: `/card/[token]` vs `/brevet-card/[token]` vs hanging it
   off `/registration/manage/[token]` as a sub-view. Spec assumes
   `/card/[token]` (short enough to type on a phone).
2. **Manual check-in policy**: spec says always allow + flag (never block a
   rider). Alternative: require GPS within radius, hard-stop otherwise.
   Recommend allow+flag.
3. **Ordering**: allow out-of-order check-ins (flagged) vs enforce
   sequential. Out-and-back routes make pure geo-inference ambiguous;
   recommend allow+flag.
4. **Event-day window**: reject check-ins when `now` is far outside the
   event window (start − 2 h → start + time limit + a few hours)? Recommend
   yes, with a clear message — it prevents accidental test check-ins from
   polluting real data.
5. **Radius default**: CTRL used 100 m; spec says 150 m (GPS in a jersey
   pocket next to a gas station is noisy, and out-of-radius still succeeds
   with a flag). Either is fine — pick one.
6. **Scope of Phase 1 events**: all event types, or brevets/populaires
   first and leave flèches (team, free-route) out until we decide what a
   flèche card even means? Recommend excluding `fleche` in Phase 1.
