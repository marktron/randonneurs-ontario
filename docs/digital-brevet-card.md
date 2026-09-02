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
  lat           DOUBLE PRECISION,              -- nullable: rider GPS is still recorded, but
  lng           DOUBLE PRECISION,              --   radius/distance checks are unavailable
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
  location_failure_reason TEXT,                 -- bounded no-GPS diagnostic (never raw browser text)
  location_failure_stage TEXT,                  -- preflight / quick / high_accuracy
  location_failure_elapsed_ms INTEGER,          -- bounded client-observed duration
  location_failure_context TEXT,                -- browser / standalone / embedded
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
  the existing row — no separate client UUID needed. One narrow enrichment
  is allowed: a GPS retry carries the server-issued `received_at` identity
  of the manual row the rider saw. Within the rider undo window it may
  atomically upgrade only that exact row to `gps`, retaining its original
  `checked_in_at`. Upgrade requests are update-only, so a delayed retry can
  never recreate a row removed with Undo or modify a replacement row.
- **Location-failure diagnostics are bounded and privacy-conscious.** A
  coordinate-less rider check-in stores a reason, acquisition stage, elapsed
  milliseconds, and broad browsing context. Raw browser error messages and
  user-agent strings are never stored. The schema enforces all-or-none
  diagnostics and paired coordinates. Complete coordinate pairs on legacy
  `manual` rows are retained as organizer evidence; current rider writes
  derive `gps` whenever coordinates are present.
- **Anomalies are derived, not stored**: out-of-radius
  (`distance_to_control_m > radius_m`), no-GPS (`method = 'manual'`),
  early/late (`checked_in_at` vs computed window), late sync
  (`received_at - checked_in_at` above a threshold, e.g. 10 min; never
  applied to `method = 'admin'` corrections, whose `received_at` is just
  when the admin typed them in). Computing
  flags at read time keeps ingest dumb and lets us tune thresholds later.
- **First-control check-ins before the start are recorded at the start,
  not the tap** (`resolveRecordedCheckinTime` in `lib/brevet-card.ts`,
  applied server-side in `checkInAtControl` and mirrored client-side —
  see "Early-window confirm" in §7): riders gather at the start control
  before the gun, and that tap is their official start. The clamp is
  scoped to the event's first control (`event_controls.position === 1`,
  renormalized 1-based on every save) and never moves a time
  _backward_ — a pre-open tap at any later control keeps the claimed
  tap time and still reads back with the `early` flag at that control's
  own window. Because the clamp can put `checked_in_at` ahead of "now",
  a GPS retry (§7) — which echoes the stored time back — is exempt from
  the future-tap guard; the value it carries is server-issued, and the
  upgrade never rewrites `checked_in_at`.
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
- Control list, ordered by `position`: name, route km shown as
  "since previous" and "this route" on separate lines (`42.3 km from last` / `207 km this route`; the first control of
  the event or of a collection leg shows the total only, since the rider's
  per-day GPS file restarts there — route km are per-leg for collection
  events; the printed card keeps a single distance for space), a second
  `N km this event` line with the cumulative event distance on legs-2+
  collection controls (offset by `cumulativeLegDistanceKm`; leg 1's would
  be identical to the route km), open/close (computed server-side,
  displayed in local time; omitted for leg-tagged collection controls,
  whose stored per-leg distances restart at 0 — the overall event limit
  governs, see docs/control-cards.md), and per-control status:
  ✓ checked in at HH:MM · **next** (highlighted) · upcoming · queued
  (offline, waiting to sync).
- **Check in** button on any un-checked control (the next expected one is
  emphasized, but out-of-order check-ins are allowed and merely flagged —
  see Open question 3):
  1. Try a quick cached/balanced location request (5 seconds), then continue
     with a longer high-accuracy request (up to 45 seconds) while retaining
     the best usable fix.
     Permission denial stops immediately; timeout/position-unavailable errors
     continue until the overall acquisition deadline.
  2. Got a fix → send `{ token, controlId, checkedInAt, lat, lng, accuracy }`
     to the server action. Server validates the token, recomputes distance
     with `haversineMeters()`, inserts with `method='gps'`.
  3. No fix / denied → offer "Check in without GPS". The coordinate-less
     check-in is stored as `method='manual'`, together with the bounded final
     failure reason/stage/timing/context for organizer review.
  4. A fix outside the tapped control's radius can still be recorded with
     GPS after confirmation; it is flagged out-of-radius, not converted to a
     manual check-in. If the control itself has no saved coordinates, the
     rider's GPS fix is still stored, but distance/radius cannot be derived.

  Only one location acquisition runs at a time — while one control is
  acquiring, every other row's **Check in** and **Retry GPS** button is
  disabled, because a second tap would cancel the first control's fix.

- **Wrong-control detection (GPS check-ins)**: after a fix is obtained but
  before recording, if the fix falls _outside_ the tapped control's radius
  but _inside_ another control's radius, the rider is warned before anything
  is saved (they may have tapped the wrong row — e.g. standing at "Exeter"
  but tapping "Ilderton"):
  - If the tapped control is satisfied (fix within its radius) the check-in
    proceeds silently — this also covers out-and-back routes where two
    controls share a location.
  - Nearest matching other control that isn't already checked in → a confirm
    sheet offers **Check in at ⟨that control⟩** (redirects the check-in),
    **Check in at ⟨tapped⟩ anyway**, or Cancel.
  - Matching control already checked in → proceed/cancel only (no redirect).
  - Fix outside every radius → recorded as-is and flagged out-of-radius by
    the server (unchanged).
- **Early-window confirm (all methods, incl. no-GPS)**: if the rider checks
  in at a control before it opens (`checked_in_at < opensAt`), a single
  confirm ("⟨name⟩ doesn't open until ⟨time⟩. Check in anyway?") appears
  first. Evaluated against the _final_ target control, so a redirect
  re-checks. Within/after the window, one-tap stays one-tap. At the
  event's **first control specifically**, a pre-start tap gets its own
  dialog copy — title "Before the start", body "You're checking in
  before the start. Your check-in will be recorded at the official
  start time (⟨time⟩)." — since the recorded time is the start, not the
  tap (see §6, `resolveRecordedCheckinTime`). The client runs the same
  rule only to pick that copy — it **sends the tap time** and lets the
  server apply the clamp. Sending the clamped time would be a check-in
  claiming to be from the future, which `checkInAtControl` rejects
  outright once the start is more than `MAX_CLOCK_SKEW_MS` away.
- **Timing rules**: check-in is allowed before open and after close — the
  device records reality; flags mark early/late and organizers adjudicate,
  exactly like a paper card with an odd time written on it. (Blocking would
  strand riders on edge cases and clock skew.)
- **Check-in stamp effect**: Checked-in controls are marked with a faded
  green club-logo stamp (`public/stamp-green.svg`), overlapping the row text
  like ink (multiply-blended in light mode, screen in dark), tilted and
  nudged a few degrees/pixels per control — both seeded deterministically
  from the control id so the server render and the hydrated client agree —
  like a hand-stamped paper card. Fresh check-ins
  "thunk" in with a 300 ms scale/fade (suppressed under
  `prefers-reduced-motion`); queued offline check-ins are stamped
  immediately, before the server confirms. The stamp is decorative
  (`aria-hidden`) — the checkmark + time remain the accessible record.
- **Rider-side undo**: for `RIDER_UNDO_WINDOW_MS` (15 minutes) after a
  check-in is recorded, a small **Undo** control appears on that row so a
  rider can remove a mistaken check-in themselves. The window is measured
  from `received_at` (so a late offline sync still gets the full window).
  Undo is hidden for `method='admin'` check-ins and once the event is
  submitted. Pending (not-yet-synced) check-ins undo by dropping the outbox
  entry locally (works offline), with a best-effort server undo in case a
  retry already landed. When a synced check-in also has a queued GPS
  upgrade (Retry GPS succeeded but the send is still queued), the queued
  upgrade payload is dropped only after the server confirms the undo — a
  refused or offline undo keeps both the row and the rider's fix, so it can
  still repair the evidence on a later flush. The outbox never sends an
  entry for a control whose undo is in flight, so a background flush cannot
  race the delete. **After the window, admins remain the only correction
  path** (edit/delete in the check-in grid).
- **Retry GPS after a manual check-in:** during that same window, the rider
  can retry location acquisition. A successful retry upgrades the existing
  row from `manual` to `gps`, clears the failure diagnostic, and keeps the
  original check-in time. The request includes that row's server receipt
  timestamp as an optimistic-lock identity and is never allowed to insert a
  replacement. This repairs the evidence without changing when the rider
  first checked in, racing Undo, or creating a second row. The upgrade is
  accepted only when the new fix lands inside the target control's radius:
  a fix outside it would erase an honest "no GPS" diagnostic in exchange
  for a row the organizer would see flagged as out of radius anyway, so the
  manual row and its diagnostic are left untouched and the rider is told
  how far away the fix put them. The client checks this first, to show that
  message; the server enforces it independently, because a stale upgrade
  queued in `localStorage` by an older build can survive a deploy and
  arrive from far away.
- After the finish control is checked: "Submit your result →
  `/results/submit/[token]`" (token already shared between the two flows;
  if no result row exists yet the existing `createEarlyResult` path covers
  it via the manage page). See "Finish flow: result pre-fill & track
  follow-up" below for what happens to the result row and email at that
  moment.
- Beneath the check-ins (and any finish banner), the card shows one merged
  box containing a **Ride Organizer** section (name, and phone/email as
  `tel:`/`mailto:` links) and, below it, a labeled **Route** section with
  the event's RWGPS route link (`https://ridewithgps.com/routes/<rwgps_id>`,
  opens in a new tab). Each section renders only when its own data exists
  (an organizer contact, or a linked RWGPS id, respectively), and the box
  itself renders when either section has data. See §9 for where the
  organizer contact is set, and "Regulations fine print" below for the
  static block shown under it.

### Location permission help

Riders get the card link days before the event (the confirmation email and
the registration-manage page), so a blocked location permission can usually
be fixed at home rather than at the start line with the organizer's help.

- **Tap-time.** The staged acquisition classifies each failure and retains
  the final bounded reason/stage/timing/context for a manual check-in. Code 1
  (`PERMISSION_DENIED`) opens a "Location is blocked" dialog with
  platform-specific fix steps (`lib/location-help.ts`:
  iOS Safari, iOS Chrome, embedded iOS (with an Open in Safari handoff),
  Android, or a generic fallback for anything else,
  chosen from the user agent by `detectPlatform`), a **Try again** action
  (re-runs the same check-in attempt) and a **Check in without GPS** action
  (records `method='manual'`, the same outcome as the ordinary manual
  dialog). It also syncs the proactive surface — setting `locationStatus`
  to `denied` and resetting `locationTest` to `idle` — so a permission
  revoked at the OS level without a `change` event firing (no live
  `PermissionStatus` update) doesn't leave a stale "Location works on this
  phone" note showing under the blocked dialog; this mirrors what
  `handleLocationTest`'s own code-1 branch already does. Codes 2/3
  (`POSITION_UNAVAILABLE` / `TIMEOUT`) do not abort the first acquisition
  stage; the longer high-accuracy stage can still succeed before the overall
  deadline. A reading whose accuracy exceeds the usable bound (100 km) is
  also treated as `position_unavailable` — location worked and simply could
  not place the rider — not `request_error`. If it does not succeed before
  the deadline, the ordinary no-GPS dialog explains that the organizer will
  review the check-in.
- **Proactive.** On mount, in secure contexts only, the card queries
  `navigator.permissions` for `geolocation`. `denied` renders a blocked
  banner above the control list with the same fix steps and a "Try again"
  button (`handleLocationTest`); `granted` renders nothing (until a test
  succeeds — see below). `prompt` — or a browser whose Permissions API is
  missing or rejects the query (older Safari) — shows a "Test your
  location" affordance instead of the blocked banner: OS-level "Never"
  (e.g. iOS Location Services switched off entirely, not just for one app)
  often still reports `prompt`, so a live `getCurrentPosition` call is the
  only reliable way to catch that case. A successful test
  (`handleLocationTest`) flips `locationStatus` to `granted` — hiding the
  affordance — and shows a separate "Location works on this phone" note. A
  `change` listener on the underlying `PermissionStatus` keeps the banner
  live in both directions: fixed mid-session (`denied` → `prompt`/`granted`)
  or revoked (`granted` → `prompt`/`denied`) — and resets any earlier test
  result back to idle whenever the state stops being `granted`, so "works"
  and "blocked" are never shown together. The "Test your location"
  affordance also hides once the rider already has GPS evidence — a synced
  GPS check-in or a queued GPS outbox entry — since location has
  demonstrably already worked.

### Finish flow: result pre-fill & track follow-up

Checking in at the **final control** (`lib/events/finish-result.ts`,
`handleFinishIfFinalControl`) does two things beyond recording the
check-in, so the rider never has to separately "start" their result. Both
the check-in action and the undo action decide "was this the final
control?" themselves (see "Server actions" below) and pass the answer in
as `isFinalControl` — `finish-result.ts` never queries `event_controls`.

- **Pre-fills the result row, marked with `prefilled_at`.** `status =
'finished'` and `finish_time` computed from the official event start to
  the final check-in's `checked_in_at` (`computeElapsedHm` in
  `lib/brevet-card.ts`, which delegates its H:MM formatting to
  `formatElapsedForSubmission`). Every pre-fill write — the initial insert
  and any later re-fill — also stamps `results.prefilled_at` with the
  current time. That column is the provenance marker that answers "did the
  card write this row, or did a human?":
  - If no `results` row exists yet, one is created (`submission_token` set
    to the registration's `management_token`, same as the completion cron;
    `prefilled_at` set).
  - If a row already exists (unique-violation path), it's inspected first
    (`submission_token, submitted_at, status, prefilled_at`) before being
    touched. A row is re-fillable when it has no `submitted_at` **and**
    either `status = 'pending'`, or `status = 'finished'` with
    `prefilled_at` already set — that second case is the card's own
    earlier pre-fill, re-entered rather than rejected. It exists for a
    **retried check-in**: if the process crashes between the pre-fill
    insert and the email claim below, a client retry hits the same unique
    violation, sees its own prior write (`finished` + `prefilled_at`), and
    carries the flow forward to the email claim instead of bailing out —
    the `finish_email_sent_at` single-send guard makes that retry safe even
    if the email already went out. An admin-entered row
    (`finished`/`dnf`/`otd` with `prefilled_at` NULL, because a human
    created it) or a row the rider already submitted is left completely
    alone: no update, no email claim. The re-fill update re-asserts the
    exact state just observed as its filters — `status = 'pending'`, or
    `status = 'finished'` **and** `prefilled_at IS NOT NULL`, plus
    `submitted_at IS NULL` in both cases (closing the race the initial
    select can't fully rule out) — and backfills `submission_token` **only
    when it's NULL** — a cron-issued or admin-default token that may
    already have been emailed is never clobbered.
  - `submitted_at` is never touched by pre-fill; admin `updateResult` and
    rider `submitRiderResult` both clear `prefilled_at` on save, so an
    organizer or rider correction immediately becomes "not a card row"
    and is safe from a later undo (see below).
- **Sends a one-time "add your ride track" email** (`sendRideCompleteEmail`,
  `lib/email/send-ride-complete-email.ts`) asking the rider to add their
  Strava link or GPX file once their device syncs, linking to
  `/results/submit/[token]`. Guarded by the `results.finish_email_sent_at`
  column: claimed atomically (update-where-null, also requiring
  `submitted_at IS NULL`) so concurrent writers, a rider who submitted in
  the interim, or a later re-check-in never send it twice. The claim update
  returns the row's own `submission_token`, and **that's the token the
  email links** — not always the check-in's `management_token`. An
  admin-created pending row can carry its own `gen_random_uuid()` default
  token (never clobbered by the backfill-only-when-NULL rule above), so
  emailing the management token there would be a dead link; the management
  token is used only as a fallback for the vanishingly unlikely case the
  claimed row's token is itself NULL. Both re-fill branches above always
  fall through to this claim — including the retried-check-in case — so a
  crash-and-retry recovers the email rather than losing it permanently.
  The email is **skipped** when the event is already `status = 'completed'`
  (the event-close flow already asked for results — see below) or when the
  rider has no email on file. Email failures are logged, never surfaced to
  the rider mid-check-in — the admin "Send Reminders" flow is the backstop
  (see below).
- **Undoing the final check-in** (`revertFinishIfFinalControl`, invoked
  from `undoCheckin`) reverts the pre-fill — `status` back to `pending`,
  `finish_time` cleared, `prefilled_at` cleared — but the update filters
  require both `submitted_at IS NULL` **and** `prefilled_at IS NOT NULL`.
  The `prefilled_at` filter is what makes undo safe: it means undo can only
  ever roll back a row the card itself wrote. An admin-created row
  (`prefilled_at` NULL from the start) or a row an admin/rider has since
  corrected (`prefilled_at` cleared by that save) is never touched by an
  undo, even if its `status` happens to be `finished`. `finish_email_sent_at`
  is deliberately **not** cleared by undo, so a later re-check-in can't
  double-send the email.
- The event-close flow (`createPendingResultsAndSendEmails` in
  `lib/events/complete-event.ts`) only ever considers riders still awaiting
  their own submission: a finished/dnf/otd/submitted row is never touched,
  so a card finisher never gets a "submit your results" ask on top of
  their ride-complete email. It also **emails registered riders whose
  results row already exists but is still a pending, un-submitted
  placeholder** (e.g. a rider undid a mistaken final check-in before the
  event closed) — those rows are otherwise invisible to the "create
  pending results" loop, which only handles riders with no row at all. It
  reuses the row's own `submission_token`, backfilling it first (same
  NULL-only rule as the card pre-fill, filtered to a row that's still
  `pending` with no `submitted_at` so a concurrently-finalized row can
  never be stamped or emailed) when the row has none.
  Every send — from the new-row loop and the existing-pending-row loop
  alike — goes through an atomic single-send claim on
  **`results.submission_email_sent_at`** (a column distinct from
  `finish_email_sent_at`, which guards the finish-flow email above): the
  update stamps that column only while it's still NULL, and zero rows back
  means another run already claimed it, so the send is skipped without
  error. That makes re-running this function (a cron retry, or an admin
  re-completing an event) safe: it never double-emails a rider. The admin
  "Send Reminders" flow below deliberately **ignores**
  `submission_email_sent_at` — re-sending to a still-pending rider is the
  whole point of that flow.
- The results form (`components/result-submission-form.tsx`) shows an
  "Almost done — add your ride track" banner instead of the generic
  "Previously Submitted" one only when the loaded result is `finished`,
  has neither a `gpx_url` nor a `gpx_file_path`, **and** `submittedAt` is
  unset. A rider who has explicitly submitted always sees "Previously
  Submitted" (with its overwrite warning) — the submitted confirmation
  takes precedence over the track nudge, never the other way around.
- That same form also hides the "Control Card Photos" upload section for
  any rider who used the digital brevet card — they have no paper card to
  photograph. `getResultByToken` (`lib/actions/rider-results.ts`) derives
  `usedDigitalCard` by looking up the rider's registration for the event
  and checking for at least one `control_checkins` row against it (same
  signal as the track-reminder check in
  `lib/events/send-result-reminders.ts`). No registration row or a lookup
  error both default to `false`, so the section simply stays visible
  rather than the action failing.
- The admin "Send Reminders" flow (`lib/events/send-result-reminders.ts`)
  skips any rider whose result already has `submitted_at` set, for either
  the pending-submission reminder or the track-only reminder — a rider who
  submitted is never re-nagged. The run is **all-or-nothing**: the
  `control_checkins` fetch (needed to know who actually finished via the
  card, for the track reminder) is retried once on error; if the retry
  also fails, the whole run returns `{ emailsSent: 0 }` with the error
  recorded and sends **nothing at all** — it does not fall back to sending
  the pending-submission reminders alone. This flow has no per-rider
  send-marker, so a partial send followed by an admin re-run would
  double-email every pending rider; failing the whole run closed avoids
  that.

### Regulations fine print

Below the ride organizer block, the card renders the same regulations text
that appears on the printed control card: the `REGULATIONS_TEXT` /
`EVENT_INFO_TEXT` constants (`types/control-card.ts`), rendered through the
shared `BoldLabelText` helper (`components/bold-label-text.tsx`) that the
printed card also uses. It's sourced from one place so the two can't drift,
and there's no per-event override — unlike the organizer contact, this block
never changes between events.

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
  check-in opened — riders can't backdate outside the window. Normal writes
  insert, with a unique conflict returning the existing check-in
  (idempotent). GPS enrichment requests take a separate update-only path:
  they match registration, control, `method='manual'`, undo window, and the
  expected `received_at` identity before upgrading atomically to `gps` and
  clearing the location-failure diagnostic. A missing target is terminal,
  never an insert. Transient failures
  (rate limit, DB errors) are marked `retryable: true` so the client outbox
  keeps them queued; only outright rejections are dropped client-side.
  While verifying the tapped control belongs to the event, it also fetches
  the event's highest control position in the same `Promise.all` (rather
  than a second, sequential query after the check-in is recorded) and
  computes `isFinalControl` itself, passed straight into
  `handleFinishIfFinalControl` — see "Finish flow" above. A failed
  max-position lookup is logged and treated as not-final, same as the code
  it replaced.
- `undoCheckin(token, { controlId })` — rider-side undo. Same token
  validation and per-token rate limit as `checkInAtControl`; rejects with a
  clear message when the check-in isn't found, was recorded by an organizer
  (`method='admin'`), the event is frozen (submitted/cancelled), or more than
  `RIDER_UNDO_WINDOW_MS` has elapsed since `received_at`. On success it
  deletes the row and revalidates `/card/{token}`. The undone control's own
  position and the event's highest control position are both fetched in the
  same `Promise.all` as the delete (not sequentially afterward), and the
  resulting `isFinalControl` is passed into `revertFinishIfFinalControl`.
- Wrong-control detection (`detectWrongControl`) and the undo window
  (`RIDER_UNDO_WINDOW_MS`) live in the pure `lib/brevet-card.ts` module so
  they're client-safe and unit-testable without React.
- Reads for admin/live views in `lib/actions/control-checkins.ts`.

## 7a. Rider's card preference at registration

Registration forms for digital-card event types (brevets, populaires,
permanents — not flèches) ask which brevet card the rider wants:

- **Paper brevet card** (default) — a printed card is waiting at the start.
- **Digital brevet card** — the rider checks in with their phone's GPS and
  is told they will not receive a paper card at the start.

The answer is stored on the registration as `registrations.brevet_card_type`
(`TEXT NOT NULL DEFAULT 'paper' CHECK (IN ('paper','digital'))`, migration
`20260828120000_add_brevet_card_type.sql`) and remembered in the rider's
localStorage record (`lib/registration-storage.ts`) so future forms pre-fill it.

This is a **preference for the organizer**, not a gate: the digital card page
still works for every registered rider on an eligible event, and paper remains
the fallback. Organizers see a "Digital card" badge on the admin registrant
list so they know how many paper cards to print. The choice can be changed by
cancelling and re-registering; re-registration (revived cancelled/incomplete
rows) overwrites the stored value.

Server side, `normalizeBrevetCardType` (`lib/brevet-card.ts`) coerces any
unrecognised value to `paper`, so the column is never trusted to the client.

The admin control-cards flow reads this preference too: digital riders are
shown muted with a `(digital card)` label, default to unchecked when an admin
chooses individual riders to print, and are excluded from an Everyone-mode
print run unless explicitly selected — see `docs/control-cards.md` →
"Digital-card riders".

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
- **POI notes.** A control POI's RWGPS `description` field is imported into
  the control's `notes` (trimmed; blank descriptions and course-point controls
  import as no note). Notes render on the rider's digital card under each
  control but are intentionally omitted from the printed control card.
- **Auto-load when empty.** When the event has no saved controls yet and its
  route has an `rwgps_id`, the manager runs that same RWGPS import
  automatically on mount, so the table is prefilled for review instead of
  showing the empty state. This is unsaved — the admin still reviews and hits
  Save (it never auto-saves, unlike the printed-card form). A run-once ref
  guard keeps strict-mode's double-invoked mount effect from importing twice.
- Manual add/edit/delete rows; saving warns before deleting controls
  that already have check-ins (the delete cascades to those check-ins).
- **Shared with the printed control card.** The saved `event_controls`
  rows are the single source of truth for control points. The printed
  control-cards form (`app/admin/events/[id]/control-cards`) prefills from
  them, so controls are defined once. See §16.

### Ride organizer

- Below the controls table, a **Ride organizer** panel (Name / Phone / Email
  - Save) sets the contact riders see on their digital card. Persisted on
    the event itself: nullable `organizer_name`, `organizer_phone`,
    `organizer_email` columns on `events` (migration
    `20260710120000_add_event_organizer.sql`).
- `saveEventOrganizer(eventId, organizer)`
  (`lib/actions/event-organizer.ts`) requires an admin session, trims each
  field (empty → `NULL`), writes the three columns, and audit-logs the
  update.
- **Prefill.** If the event already has a stored organizer, the form loads
  it. Otherwise `getChapterOrganizerDefaults(chapterId)` seeds it from the
  chapter's earliest `chapter_admin` row (in practice, the chapter VP) —
  empty strings if the chapter has none. Prefill is only a starting point:
  saving writes the event's own record, so a later change to the chapter
  admin roster doesn't retroactively change an already-set event.
- Shown on the rider card beneath the check-ins (see §7). The **printed**
  control card is unaffected — it still takes the organizer name typed in
  by the logged-in admin at print time, not this stored field (the digital
  card has no admin session to draw that from).

### Check-in evidence in the results table

On the admin event page, riders with at least one digital check-in show a
stamp icon in the results table's **Evidence** column — including riders
with no result row yet (e.g. an abandon with no DNF entered). Clicking it
opens a read-only summary: one row per control with the check-in time
(Toronto), method badge for manual/admin entries, warning badges (early,
late, radius, no gps, late sync), GPS distance to the control, and any
note. For a no-GPS row with diagnostics, it also shows a concise cause,
acquisition stage, elapsed time, and browsing context. Corrections are not
made here — the dialog links to the Digital Cards grid, which owns editing.

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
- Correcting an existing row preserves its original coordinates and bounded
  location-failure diagnostic as evidence; the correction changes only the
  adjudicated time, method, and note.
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
- No-GPS diagnostics use fixed enums and a bounded elapsed duration. Raw
  user-agent strings and browser-provided error messages are deliberately not
  accepted or persisted.
- GPS spoofing is possible and **out of scope to prevent** — the paper
  equivalent (forged signatures) is too. The system's job is to make honest
  riding effortless and leave an audit trail (`received_at`, accuracy,
  distance, flags) for organizers.

## 11. Email

- The registration-confirmation email includes an "Open your brevet card"
  section for **every rider on a card-eligible event type** — regardless of
  the paper/digital preference they gave at registration (§7a), and whether
  or not the organizer has saved controls yet. Most riders register before
  controls are configured, and the card page explains itself when digital
  check-in isn't set up. (The link was hidden behind a kill switch from July
  to August 2026 while the feature was polished; enabled 2026-08-29.) No new
  emails in Phase 1.
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
- **E2E** (`tests/e2e/`): card page render in desktop Chromium and an iPhone
  8 Plus-sized WebKit project. WebKit exercises both the proactive location
  test and a real mocked-GPS check-in followed by reload. The mutation runs
  in a dependent project against a dedicated WebKit registration; Chromium
  uses a separate registration, preventing browser projects from checking in
  against the same rider/control concurrently.
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

| Concern                 | Location                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema                  | `supabase/migrations/20260703120000_add_digital_brevet_card.sql`; rider preference column in `20260828120000_add_brevet_card_type.sql` (§7a)                                                                                                                                                                                                                                                                                                                                                                                               |
| Check-in stamp effect   | `public/stamp-green.svg` — stamp artwork; `stampRotation` in `lib/brevet-card.ts` — deterministic tilt; rendering in `components/brevet-card-view.tsx`; animation keyframes in `app/globals.css`                                                                                                                                                                                                                                                                                                                                           |
| Domain logic (pure)     | `lib/brevet-card.ts` — eligibility, event start, acceptance window, control windows, flag derivation                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Rider actions           | `lib/actions/brevet-card.ts` — `getBrevetCardByToken`, `checkInAtControl`, `undoCheckin` (both also decide `isFinalControl` for the finish flow, folded into an existing query)                                                                                                                                                                                                                                                                                                                                                            |
| Finish pre-fill & email | `lib/events/finish-result.ts` — `handleFinishIfFinalControl`, `revertFinishIfFinalControl`; `lib/email/send-ride-complete-email.ts` + `lib/email/send-result-submission-email.ts` (share send scaffolding via `lib/email/send-result-flow-email.ts`) + `buildRideCompleteEmail` template; `results.finish_email_sent_at` (migration `20260705120000_add_finish_email_sent_at.sql`) and `results.prefilled_at` (migration `20260705130000_add_prefilled_at.sql`) columns                                                                    |
| Admin controls actions  | `lib/actions/event-controls.ts` — CRUD + RWGPS import                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ride organizer          | `lib/actions/event-organizer.ts` — `getChapterOrganizerDefaults`, `saveEventOrganizer`; `events.organizer_name/phone/email` columns (migration `20260710120000_add_event_organizer.sql`); admin panel in `components/admin/event-controls-manager.tsx`. See §9, §7.                                                                                                                                                                                                                                                                        |
| Shared controls (print) | `components/admin/control-cards-form.tsx` prefills/saves back `event_controls`; matching + drift helpers in `lib/controlPoints.ts` (`matchImportedControls`, `controlsInSync`). See §16.                                                                                                                                                                                                                                                                                                                                                   |
| Admin check-in actions  | `lib/actions/control-checkins.ts` — grid read, set/delete corrections                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Check-in evidence modal | `lib/checkin-evidence.ts` — shared check-in labels and evidence join helper; `components/admin/checkin-evidence-dialog.tsx` — read-only evidence dialog on admin event page. See §9.                                                                                                                                                                                                                                                                                                                                                       |
| RWGPS coordinates       | `lib/rwgps.ts` — `extractControlsWithCoords`, `fetchRwgpsControlsWithCoords`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Rider page              | `app/card/[token]/page.tsx` + `components/brevet-card-view.tsx` (outbox lives here); staged acquisition and bounded diagnostic types in `lib/geolocation.ts` / `lib/location-diagnostics.ts`; permission help in `lib/location-help.ts` — see "Location permission help" above                                                                                                                                                                                                                                                             |
| Admin page              | `app/admin/events/[id]/brevet-card/page.tsx` + `components/admin/event-controls-manager.tsx` + `components/admin/event-checkins-grid.tsx` + `components/admin/checkin-map.tsx` (correction-dialog map)                                                                                                                                                                                                                                                                                                                                     |
| Email                   | `lib/email/templates.ts` (`digitalCardUrl`), wired in `lib/actions/registration/finalize.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Tests                   | `tests/unit/lib/brevet-card.test.ts`, `tests/unit/lib/brevet-card-actions.test.ts`, `tests/unit/components/brevet-card-view.test.tsx`, `tests/unit/lib/location-help.test.ts`, `tests/integration-real/brevet-card/checkin.test.ts`, `tests/integration-real/brevet-card/undo.test.ts`, `tests/e2e/brevet-card.spec.ts`, `tests/unit/events/finish-result.test.ts`, `tests/integration-real/brevet-card/finish-result.test.ts`, `tests/unit/events/send-result-reminders.test.ts`, `tests/unit/components/result-submission-form.test.tsx` |

### Organizer how-to

1. Open the event in the admin and click **Digital Cards**.
2. Click **Import from RWGPS** (or add rows manually), review names,
   distances, and coordinates, then **Save controls**. Controls without
   coordinates still accept and store the rider's GPS fix; only the
   distance/radius comparison is unavailable.
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
     The results-table Evidence dialog gives the bounded failure cause,
     acquisition stage, elapsed time, and browser context when available;
     older manual rows simply have no diagnostic detail.
5. Click any cell to add, correct, or delete a check-in; a note is
   required and every correction is audit-logged. Once the event is marked
   `submitted`, check-ins freeze — including control edits (`saveEventControls`
   refuses, since deleting a control would cascade-delete its check-ins).
6. Coordinates come from RWGPS and may sit a parking lot away from the
   actual control — the generous 500 m default radius absorbs that. As
   coordinates get audited, tighten `radius_m` per control.
7. The event's **Send Reminders** button (on `/admin/events/[id]` once the
   event is completed) also covers digital-card finishers who checked in
   at the final control but haven't added a Strava link or GPX file yet —
   they get a track-only reminder instead of the full submission reminder.
   Riders with no check-ins at all (paper-card only) are never nagged for
   a track. See `lib/events/send-result-reminders.ts`.

## 16. Shared controls with the printed control card

The saved `event_controls` rows are the **single source of truth** for an
event's control points, shared between the digital brevet card and the
printed control card.

- **Prefill.** The printed control-cards form
  (`components/admin/control-cards-form.tsx`) seeds its rows from the saved
  controls when any exist, in saved order, and **skips** the on-mount RWGPS
  auto-import. With no saved controls it behaves as before (default
  Start/Finish rows + auto-import when the route has an `rwgps_id`).
- **Unified import.** Both forms import via the same
  `importEventControlsFromRwgps(eventId)` server action, so coordinates and
  reversed-event handling are computed identically server-side. (The print
  form previously computed reversal client-side using
  `max(route distance, event distance)`; it now uses the event distance like
  the digital importer.) A re-import matches imported rows back to saved rows
  (`matchImportedControls` in `lib/controlPoints.ts`) to preserve each saved
  row's id, radius, and notes.
- **Save-back affordances** (hidden once the event is `submitted`):
  - _No saved controls yet_ → **Save controls to this event** button, which
    makes the current rows the digital card's controls.
  - _Rows drift from saved_ → an amber note with **Update saved controls**
    (writes back, preserving saved ids so check-ins survive) and **Reset to
    saved** (restores rows from the saved snapshot).
  - _In sync_ → a muted "In sync with the digital brevet card controls." line.
  - Drift is detected by `controlsInSync` comparing the ordered
    (trimmed name, numeric distance) sequence.
- **Coordinates never travel through the print URL** — only `{name, distance}`
  is encoded. Rows added by hand in the print form carry no coordinates until
  an admin sets them in the digital brevet card manager; such controls still
  store rider GPS evidence, but cannot calculate distance or an out-of-radius
  flag until the control location is configured.

## 17. Pre-rides

Organizers occasionally approve a **pre-ride**: a rider scouts the course ahead of the
scheduled event with their own start date and time. Approval happens out-of-band
(email/phone); recording it in the system _is_ the approval — there is no request/approve
state machine.

### Model

Two nullable columns on `registrations` (migration `20260708120000_add_pre_ride_start.sql`):

- `pre_ride_date DATE`
- `pre_ride_start_time TIME`

A CHECK constraint (`registrations_pre_ride_both_or_neither`) requires both set or both
null. The pure resolver `resolveRiderStart(event, registration)` (`lib/brevet-card.ts`)
returns the pre-ride start when set, otherwise the event start. It replaces direct
`computeEventStart(event...)` calls at the three per-rider call sites:

1. `getBrevetCardByToken` — card display and control windows.
2. `checkInAtControl` — acceptance window, backdate floor, finish elapsed time.
3. `getEventCheckinsForAdmin` — early/late flags are computed per registration, so a
   pre-rider's on-schedule check-ins are not flagged "early" against the event start.

Everything downstream (flags, undo windows, finish pre-fill) takes the computed start as
input and needed no changes. There is deliberately **no policy validation** on the chosen
datetime — admins are trusted on how far ahead the pre-ride runs.

### Admin UI

The "Pre-Rides" section on the Digital Brevet Card admin page
(`/admin/events/[id]/brevet-card`, `components/admin/pre-ride-manager.tsx`) sets or clears
the override via `setPreRideStart` (`lib/actions/pre-ride.ts`), which audit-logs every
change. Guards: registration must be `registered`, event type card-capable, event still
`scheduled`. The check-in grid's column headers still show the _event-level_ windows; the
per-cell flags are per-rider.

### What pre-riders see

- Their card header shows their own start time plus a "Pre-ride" badge; control open/close
  times and the pre-event banner all follow the pre-ride start.
- `/registration/manage/[token]` shows the pre-ride date/time with a "Pre-ride" badge.

### Emails and results

- The finish email is check-in-driven (`handleFinishIfFinalControl`) and fires when the
  pre-rider checks in at the final control — with an elapsed time computed from the
  pre-ride start.
- The completion cron (`/api/cron/complete-events`) still fires at the _event's_ closing
  time, but `createPendingResultsAndSendEmails` skips riders with an existing result row —
  a pre-rider who finished on the card gets no redundant email. A pre-rider who never
  records a finish gets their "submit your results" email when the main event closes
  (accepted trade-off; `/registration/manage/[token]` gates early submission on the
  event's _scheduled_ start, not the pre-ride start, so they can submit once the
  scheduled event has started, or an organizer can enter the result for them).
- Results/season stay keyed to the event's `event_date` — pre-rides are days ahead, never
  a different season.
- The manual result-submission form (`/results/submit/[token]`) **does** anchor to the
  pre-ride start: `getResultByToken` (`lib/actions/rider-results.ts`) fetches the
  registration's `pre_ride_date`/`pre_ride_start_time` and the form picks between the
  pre-ride start and the event start with the same "pre-ride wins if set" rule as
  `resolveRiderStart`, before computing day options and elapsed time. See §18.

### Printed control cards

No changes: `/control-cards` (and the admin variant) already accepts an arbitrary
`eventDate`/`startTime`, so a pre-ride's paper card is just a different query string.

## 18. Result submission for long (>1300 km) and pre-ride events

Two gaps in the original result-submission form (`components/result-submission-form.tsx`,
action `getResultByToken` in `lib/actions/rider-results.ts`) blocked riders on 1400+ km
events and pre-riders from recording their real finish:

- **LRM overall limit beyond 1300 km.** `getNominalDistance` clamps anything over 1200 km
  to the 1300 km band, so `FINISH_LIMITS_MIN[1300]` (108h20m) was being used as the ACP
  limit for every longer distance too. Per the LRM rules, randonnées of 1400 km and up are
  limited to a straight 12 km/h overall average instead (2000 km → 166h40m). `getAcpTimeLimitMinutes`
  in `lib/events/finish-time.ts` now branches on `distanceKm > 1300` to compute
  `distanceKm / 12` hours directly, rather than reading the banded table. This limit feeds
  both the result form's day picker/OTL warning and `calculateClosingTime` in
  `/api/cron/complete-events`, which previously auto-completed 1400+ km events using
  `closeHours()` (only defined through 1300 km) and closed a 2000 km event ~17 hours early.
  The printed control card's finish clamp is untouched — see the note in
  `docs/control-cards.md` under "Finish clamping".
- **Day picker stops exactly at the strict cutoff.** `getFinishDayOptions` now always adds
  one buffer day past the computed cutoff window, because the form already accepts (and
  flags, in amber) a finish time past the ACP/LRM limit — riders who actually take longer
  than the limit still need a day option to select. This shifts every day-count by one
  (e.g. an early-morning 200 km now offers 2 day buttons instead of 1) but never removes
  the elapsed-time fallback for events with no recorded start time.
- **Pre-ride anchoring.** `getResultByToken` now also selects the registration's
  `pre_ride_date`/`pre_ride_start_time` and returns them on `ResultSubmissionData`. The
  form computes an effective `startDate`/`startTime` — the pre-ride start when set,
  otherwise the event's — and uses it everywhere the event date/start time previously fed
  `getFinishDayOptions`, `decodeInitialFinish`, and `FinishClockTimeFields`, mirroring
  `resolveRiderStart` in `lib/brevet-card.ts`. A registration lookup failure or a missing
  registration row (e.g. an admin-created result for an unregistered rider) leaves both
  fields `null`, falling back to the event's own start exactly as before.
