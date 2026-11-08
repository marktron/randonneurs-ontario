# Randonneurs Ontario — Implicit State Machines Audit

Date: 2026-11-07. Method: five parallel read-only agents, one per domain (events, registrations/memberships, results/brevet card/check-ins, awards/riders/admin, client UI). Every "fix now" finding below was re-verified by hand in the main session. Baseline at audit time: 176 test files / 2706 tests passing, typecheck clean.

An **implicit state machine** here means any of:

1. A status column whose legal transitions are enforced only by scattered `if` checks, or not at all.
2. A cluster of booleans / nullable timestamps that jointly encode a lifecycle, where invalid combinations are representable.
3. A derived phase ("is open", "is finished", "is active") computed independently in several places.
4. A side effect (email, Slack, cache bust, ERW sync) that must fire exactly once on a transition but is gated ad hoc.
5. A token or send-once column whose "claimed" and "done" states share one field.

---

## Executive summary

The codebase has four real lifecycles (event, registration, result, award) and none of them has a transition table. Each has been patched one edge at a time; the git log shows the same shape repeatedly: a bug at one transition, a guard added at that call site, the next transition left open. The most consequential gap is that **nothing refuses leaving `events.status = 'submitted'`**, so a VP can cancel an event already filed with the ACP and silently delete its results.

Two findings are not state machines at all but fell out of the careful read and are cheap, confirmed bugs: the audit-log CHECK constraint rejects `award` and `registration` entity types (so those actions are never audited in prod), and the public rider-match search returns hidden riders.

The client side is in better shape than expected. The GPS check-in flow is the textbook implicit machine, but ten rounds of fixes have closed every observed bug and 87 tests pin them. Two smaller rider-facing flows have unguarded failure paths.

**Verdict on the exercise:** worth doing. Six confirmed defects plus three structural fixes that would retire a recurring class of bug. See "Making this recurring" at the end.

---

## Fix now (confirmed, small, rider- or homologation-facing)

**Status (2026-11-07):** F1 to F6 fixed on branch `fix/implicit-state-machines`; plan in `docs/superpowers/plans/2026-11-07-implicit-state-machines-fixes.md` (local, gitignored). Two migrations ship with it (audit-log CHECK, event status trigger). Event lifecycle now lives in `lib/events/status.ts`.

### F1. `updateEventStatus` has no from-state table; `submitted` can be exited

- **Location:** `lib/actions/events.ts:513-521` (only two guards, both about `draft`); `components/admin/event-status-select.tsx:100` hides the control for submitted events but the server action does not check.
- **What happens:** `submitted -> cancelled` passes and runs the results delete at `:527-537`. `completed -> scheduled` reopens an event with results and sent emails intact. `cancelled -> completed` skips result creation because `:575` requires from = `scheduled`.
- **Related:** `updateEvent` (`:216`) never reads status, so editing date or distance on a submitted event rotates the slug and rewrites results via `trg_events_propagate_distance`. Admin result CRUD (`lib/actions/results.ts:40,336,579,628`) ignores the `submitted` freeze that rider paths, check-ins, controls and the card all enforce (eight call sites).
- **Fix:** `transitionEvent(id, from, to)` with an explicit allowed-pairs map, used by `updateEventStatus`, the cron and `submitEventResults`; a `BEFORE UPDATE` trigger refusing changes when `OLD.status = 'submitted'` and refusing `NEW.status = 'draft'` from any other state; `assertEventMutable` in `updateEvent` and the admin result writes. Tests for every refused pair. ~1 day.

### F2. `submitEventResults` sends the ACP email before flipping status

- **Location:** `lib/actions/events.ts:960-988`.
- **What happens:** email goes out, then an unconditional `.update({status:'submitted'})`. If the update fails the event stays `completed` and the retry re-sends. Two concurrent clicks both send. No `submitted_at` marker exists.
- **Fix:** flip with `.eq('status','completed').select()` first, bail on zero rows, then send. ~1 hour. Can land inside F1.

### F3. Result submission form: upload slot stuck forever on network failure

- **Location:** `components/result-submission-form.tsx:119-212`.
- **What happens:** only the compression step is in `try/catch`. Steps 1-3 (`createResultUploadUrl`, `uploadToSignedUrl`, `confirmResultUpload`) reject on network failure, leaving `uploading: true`. The file input and Remove/Replace buttons are all disabled on that flag, so the slot is dead until reload. Submit (`:659`) disables only on `isPending`, so a rider can submit mid-upload and land a result with no photo.
- **Fix:** wrap the pipeline in `try/finally` (mirror `components/admin/image-upload.tsx:62-120`), disable Submit while any slot is uploading, two tests. ~30 min.

### F4. Public control-card form: RWGPS import race

- **Location:** `components/control-card-form.tsx:182-245`.
- **What happens:** the effect at `:209` calls `importFromRwgps()` on every route change with no request id. Pick A then B quickly: if A resolves second, A's controls overwrite B's. `rwgpsLoadedId` is never cleared when the URL input changes. Wrong controls end up on printed cards.
- **Fix:** request-counter ref (pattern exists in `brevet-card-view.tsx:924-939`), clear `rwgpsLoadedId` on input change. ~30 min.

### F5. Audit-log CHECK rejects `award` and `registration`

- **Location:** `lib/audit-log.ts:4-14` allows them; DB CHECK (`supabase/migrations/20260224120000_audit_logs_add_navigation_entity_type.sql:4`) does not. Callers: `lib/actions/awards.ts:161,263`, `lib/actions/results.ts:489,569`.
- **What happens:** every manual award assignment and registration cancel/restore audit write fails the constraint and is swallowed by the fire-and-forget at `lib/audit-log.ts:40`. No test touches the real constraint.
- **Fix:** one migration adding the two values; a real-DB test that inserts every `AuditEntityType` value; consider a dev-only loud failure. ~30 min. Not a state machine, listed because it is confirmed and cheap.

### F6. Rider-match search returns hidden riders

- **Location:** `lib/actions/rider-match.ts:87-99`, public unauthenticated action, service role, no `hidden` filter.
- **What happens:** a hidden rider's name and obfuscated email appear in the registration match picker. `docs/hidden-riders.md` promises "never on any public surface".
- **Fix:** `.eq('hidden', false)` plus a case in `tests/integration-real/hidden-rider.test.ts`. ~15 min. Not a state machine, same reason as F5.

---

## Worth fixing (structural, schedule when the area is next touched)

### S1. Registration status transitions (six writers, no shared guard)

- **Location:** `lib/actions/registration/finalize.ts:46-94`, `lib/actions/results.ts:210-286, 453-462, 753-767`, `lib/actions/manage-registration.ts:213-228`, `lib/actions/riders.ts:318-321`.
- **Divergences:** rider revive overwrites notes/team/card type and emails; admin revive preserves them and does not email. `revalidateMembership` busts only the `registrations` tag while every other transition also busts `events`, `event-{slug}` and `/register/{slug}`, so public start lists go stale after an organizer fixes a membership. Cancel does not clear `pre_ride_date/time`, `card_reminder_sent_at` or `control_checkins`; revive does not reset them, so a revived rider keeps a stale pre-ride and never gets the card reminder. `cancelled_at` is NULL on some cancelled rows in prod and `permanent-event.ts:66-89` codes around it.
- **History:** `9a26c10`, `0cc5482`/`f4f0f65`, `f824081`, `5402820`, `8e07698`, `af5a8c5`.
- **Fix:** `transitionRegistration(row, to, {by})` owning the status-filtered UPDATE, `cancelled_at`, token regen, pre-ride reset, and a single `revalidateRegistrationCaches(slug, eventId)`. ~1 day. Start with the cache bust and the revive reset.

### S2. Email send-once claims: "claimed" and "sent" share one column

- **Location:** `lib/events/complete-event.ts:190-218`, `lib/events/finish-result.ts:184-199`; `lib/email/send-result-flow-email.ts:30-33` returns `{sent:false}` with no `error` when SES is unconfigured.
- **What happens:** both callers stamp the claim first and check only `error`, so the claim is burned with `emailsSent: 0` and no error recorded. `send-card-reminders.ts:129-131, 253-266` already fixed both halves and is the template. This is the "silent-claim hole" noted in session memory.
- **Fix:** preflight `isEmailConfigured()` in both callers, record `!sent` as an error, red/green tests with `{sent:false}`. ~1 hour. Low prod blast radius (SES is configured) but this email carries the result submission link.

### S3. `results.status = 'finished'` with NULL `finish_time`

- **Location:** admin UI permits it (`components/admin/event-results-manager.tsx:337`); no CHECK ties the two.
- **What happens:** such a row earns awards (triggers test `status = 'finished'` only) and counts in rider stats, but is silently dropped from the ACP spreadsheet (`lib/actions/events.ts:871`) and route records (`lib/data/routes.ts:169`). "Finished" is derived three different ways across nine call sites.
- **Fix:** audit prod for existing rows, then `CHECK (status <> 'finished' OR finish_time IS NOT NULL)` plus UI validation. ~2 hours. Bulk import (`results.ts:645`) can also write `dnf` + `finish_time`; same CHECK family.

### S4. `result_awards` cannot represent "removed by a human"

- **Location:** `rider_awards.auto_assigned` exists; `result_awards` has no flag. Reconcilers for First Brevet, Devil Week, PBP, Granite Anvil use `ON CONFLICT DO NOTHING` and re-insert anything a human deleted on the next `results` change. `docs/awards.md:278-280, 563-566` admit this. No revoke action exists in the app.
- **Fix:** add `auto_assigned` and `revoked_at` (or a suppression row) to `result_awards`, make the four reconcilers respect it, one test per reconciler. Do not attempt a general award state machine. ~half a day.

### S5. Pre-fill/revert never busts results caches; admin check-in edits don't sync finish

- **Location:** `lib/events/finish-result.ts` and `lib/actions/brevet-card.ts:566,1252` only `revalidatePath('/card/...')`, never `revalidateResultsTags`, despite the pre-fill inserting a `finished` row that fires award triggers. `adminSetCheckin`/`adminDeleteCheckin` (`lib/actions/control-checkins.ts:279-444`) and `saveEventControls` reordering the final control leave `finished + prefilled_at` rows behind.
- **Fix:** the cache bust is one import (~15 min). The admin asymmetry should be documented, not automated.

### S6. Admin result row autosave can double-insert

- **Location:** `components/admin/event-results-manager.tsx:297-370`. Two quick status changes on a rider with no result row both call `createResult` before the first resolves. There is no unique constraint on `results(event_id, rider_id)` (verified).
- **Fix:** per-row in-flight guard (~30 min). Consider the unique constraint after auditing prod for duplicates.

---

## Watch (document the invariant; fix only when the area changes next)

- **Event phase derivation.** "Upcoming/past/needs results" computed in seven places with two shapes (`publicEventStatuses + gte(event_date)` vs `neq draft`); the cron is the only place "finished" means start + closing hours. `registration_opens_at` / `registration_closes_at` are never read anywhere; drop them. Registration is open iff `status = 'scheduled'`, with no time cutoff, so riders can register after the start until the completion cron runs.
- **"Active registration" set.** `registered` only (public, cron, trial check) vs `registered + incomplete` (admin counts, permanent occupancy). Intentional and documented in `lib/data/event-rider-counts.ts:4-13`, but a new reader already picked wrong once (`af5a8c5`). Export `ACTIVE_STATUSES` / `CONFIRMED_STATUSES` constants. 30 min.
- **Rider merge.** Seven sequential service-role writes with no transaction (`lib/actions/riders.ts:313-455`); `rider_awards` cascade-delete on the source and are never moved; `awards`/`records` tags not revalidated; `hidden` not carried over. Merges are rare and admin-only. A plpgsql function would fix all of it at moderate cost.
- **GPS check-in flow** (`components/brevet-card-view.tsx:240-311`). Eleven state variables plus seven refs, hundreds of representable states, roughly ten intended. Every observed bug is closed with a targeted guard and 87 tests pin them. A `useReducer` with a discriminated union would make it auditable but costs 1-2 days of re-verification. Only do it before the next GPS feature.
- **Banquet name-only awards** (`rider_id` nullable since `20261016120000`) never match the `riders!inner` join in `announce-awards.ts:98,105`, so they sit permanently un-announced. Harmless today.
- **Open season in TS.** `is_open_season()` exists only in SQL; preview and preflight scripts use `getFullYear()`, so January previews miss the grace window.

## Not worth it

Membership season gating (one writer, UNIQUE, well tested). Management and submission tokens (permanent capabilities by design). Check-in row shape (DB CHECKs from PR #119). Pre-ride pair (CHECK exists). ERW/cache side-effect scatter (documented, retryable). News/pages/images/admin-user lifecycles (two states or none). Add-rider typeahead staleness. Five "current season" definitions (each documented as intentional).

---

## Making this recurring

The search paid for itself, but a full five-agent sweep costs roughly 600k tokens and should not be the recurring mechanism. The value came from two things: a per-domain read deep enough to hold the whole lifecycle in view, and a short, concrete checklist of what to look for. Those are what to institutionalise.

1. **Registry, not re-audit.** Add `docs/state-machines.md`: one section per lifecycle (event, registration, result, award, email claims) with the state list, the allowed transition pairs, the side effects of each transition, and the file:line where each is enforced. Reviews then check a diff against a table instead of re-deriving it. This document is the seed; the registry is its normalised form.
2. **A `lifecycle-auditor` agent** modelled on the existing `~/.claude/agents/a11y-auditor.md`: scoped to uncommitted changes, triggered when the diff touches a file that writes a lifecycle column, a `*_sent_at` / `*_at` claim column, a DB trigger, or adds three or more `useState` booleans in one component. It reads `docs/state-machines.md`, checks every transition in the diff against the table, and looks for the five patterns at the top of this file. Wire it in via a CLAUDE.md rule under "Feature Work Requirements" so it runs without being asked.
3. **Mechanical backstop once the helpers exist.** After F1 and S1 land, add a unit test that greps `lib/actions/**` and `app/api/**` for `status:` inside `.update(` / `.insert(` on `events` and `registrations` outside the transition modules, and fails on any hit. Same spirit as the existing "no suite may be excluded from CI" test: a rule that lives in the test suite cannot rot.
4. **Schema-level invariants where the data is the blast radius.** The `submitted` freeze (F1) and `finished` requires `finish_time` (S3) belong in triggers and CHECKs, not only in TypeScript, because the awards triggers and ACP export read the table directly.

Skip: a custom ESLint rule (cannot see cross-file transition sets), XState or similar (overkill for four lifecycles), and a scheduled full re-audit (do one only after a major new lifecycle, such as rider accounts, lands).
