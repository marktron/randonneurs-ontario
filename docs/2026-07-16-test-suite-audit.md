# Test Suite Audit — 2026-07-16

Stack (verified from the repo, not assumed): **Vitest 4** (unit + two integration tiers),
**Playwright 1.57** (e2e), **@testing-library/react 16** on **happy-dom 20** for
component tests, **MSW 2** available, **@vitest/coverage-v8** for coverage,
**Supabase (Postgres)** via a hand-rolled mock (mock tier) and a real local stack
(real-DB tier). Next.js 16 App Router + React 19. CI is GitHub Actions
(`.github/workflows/ci.yml`).

This audit supersedes the situational parts of `docs/test-suite-audit.md`
(2026-03-13) and complements the codebase audit in `docs/2026-04-29-audit.md`.
Where those remediation items have since shipped, that is noted.

---

## Commands run & results

| Command                                    | Result                                                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                   | clean install (6 moderate npm-audit advisories, pre-existing)                                                                                                                                                                 |
| `npx vitest run` (= CI `verify` test step) | **115 files, 1606 tests, all pass**, ~39s                                                                                                                                                                                     |
| `npm run test:coverage`                    | **FAILS out of the box** — `Cannot find dependency '@vitest/coverage-v8'`. The provider is configured in `vitest.config.mts:25` but is **not in `package.json`**. Installed it locally (`--no-save`) to obtain numbers below. |
| `npm run test:integration-real`            | **Not run** — requires a local Postgres/Supabase stack not available in this environment. Real-DB files were read, not executed.                                                                                              |
| `npm run test:e2e`                         | **Not run** — requires a dev server + seeded Supabase. E2E specs were read, not executed.                                                                                                                                     |
| `npm run typecheck` / `npm run lint`       | Not re-run for this audit (docs-only change); the suite is green per above.                                                                                                                                                   |

**Coverage (mock unit+integration tiers only; real-DB & e2e not measured):**
`lib/` overall **78% statements (3331/4284)**. 58 files in the coverage `include`
sit at 0% — most are Server/Client components exercised only by the real-DB or
e2e tiers (which coverage does not measure), so the number understates real
protection. Logic-bearing `lib/` files that are genuinely thin:
`lib/actions/registration/finalize.ts` **5%**, `lib/memberships/service.ts` 29%
(covered instead by the real-DB tier), `lib/actions/register.ts` 39%,
`lib/actions/erw-sync.ts` **0%**, `lib/actions/pre-ride.ts` 0% (real-DB only),
`lib/data/first-time-riders.ts` **0%**, `lib/rate-limit.ts` — see P0 below.

**Test distribution (approx. `it`/`test` counts):** unit ~1158 · mock-integration
~436 · real-DB ~185 · e2e 69. The "~1,600" in the brief is the CI `verify`
count (unit + mock-integration). Real-DB (185) also runs in CI; **e2e (69) runs
nowhere**.

---

## A. Executive summary

**Overall: a genuinely strong, mature suite with a few sharp, mostly
security-shaped holes.** This is not a suite padded for coverage. The pure-logic
unit tests and the real-DB integration tier are excellent — exact assertions,
computed-value checks, idempotent cleanup by natural key, deliberate anti-vacuity
design (paired "visible IS present / hidden is NOT" assertions). The team has
already acted on two prior audits (dead `components/example.tsx`, the `openai`
dep, and the March "membership exports exist" tautology are all gone; real-DB CI
gating shipped). Confidence is **high for anything the real-DB tier touches** and
**low for anything deferred "to E2E."**

**Major strengths**

- Real-DB tier (`tests/integration-real/`) is the real safety net: exact row/state
  assertions, SQLSTATE checks, RLS anon-vs-service-role pairing, rate-limiter
  reset between tests. `hidden-rider`, all `brevet-card/*`, the `registration/*`
  and trigger/records files are model tests.
- Pure-function coverage is deep and correct: `brmTimes`, `brevet-card`,
  `fuzzy-match`, `rwgps`, `controlPoints`, `records`, `email-typo`,
  `results-spreadsheet` (round-trips real XLSX).
- The strongest component tests assert real interaction **payloads**
  (`brevet-card-view`, `event-checkins-grid`, `control-cards-*`,
  `event-results-manager`, `award-assign-form`, `user-form`).
- API route auth is properly tested (cron `complete-events` and `revalidate`
  both assert 401 missing/wrong bearer and 500-unconfigured).

**Major risks**

1. **Authorization is universally stubbed and chapter-scoping is untested.** 14+
   integration files `vi.mock('@/lib/auth/get-admin')` so `requireAdmin()` always
   resolves. No test asserts a non-admin is blocked at the action layer, and
   **no test asserts a chapter_admin cannot mutate another chapter's data** — the
   exact gap that lets the confirmed authz vulnerability (April audit #1) ship
   silently.
2. **The capability-token security test can pass vacuously.**
   `token-column-security.test.ts` never seeds a token row, so on an empty DB its
   negative assertions pass whether or not the columns are protected.
3. **E2E runs in no CI job** (confirmed: not in `ci.yml`, not in `.husky/`), yet
   ~20 comments across mock-integration and component tests defer real behavior
   "to E2E tests." That behavior is protected **nowhere**. The e2e suite itself
   carries **46 `test.skip` gates** and ~10 tautological assertions.
4. **Test-local reimplementation of private production logic** in 4 files
   (proven vacuous by mutation in 2): a mutation that turns the admin
   open-redirect guard into `return redirect` leaves all its tests green.
5. **`lib/rate-limit.ts` — login/registration/check-in brute-force protection —
   has zero tests.**

**Five highest-value actions**

1. Add action-layer **authorization tests** (non-admin denied; chapter_admin
   cross-chapter denied) — after adding the missing `isChapterAdmin` enforcement.
   **P0, security.**
2. **Fix `token-column-security.test.ts`** to seed a known token and assert anon
   cannot read that value (+ assert the view omits the columns). **P0/High.**
3. **Add `@vitest/coverage-v8` to `devDependencies`** so `test:coverage` works,
   and **wire the e2e suite into CI** (or stop citing it as coverage). **P1.**
4. **Delete/rewrite the 4 reimplementation test files** to import & exercise the
   real symbols (export `getSafeRedirectUrl`, `aggregateAwards` already exported).
   **P1, removes false confidence.**
5. **Unit-test `lib/rate-limit.ts`.** **P0/P1.**

**Estimated composition** (estimates, of ~1,850 cases across all tiers):

| Bucket                          | Est. share | Basis                                                                                                                         |
| ------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Valuable as written             | ~75%       | unit-lib pure logic, strong components, real-DB tier, strong mock-integration & api                                           |
| Valuable but need strengthening | ~13%       | `success:true`-only paths, `toBeDefined`/`toBeTruthy` error checks, conditional-guarded asserts, "covered by E2E" gaps        |
| Duplicative                     | ~3%        | reimplementation copies; some mock⇄real-DB overlap for same actions                                                           |
| Obsolete                        | ~0%        | none confirmed; `legacy-redirects` deletable after 2026 season                                                                |
| Ineffective / vacuous           | ~4–5%      | reimplementation clusters, markdown-editor no-assert tests, token-security vacuity, guard-skip real-DB files, e2e tautologies |
| Not executed in CI              | ~4%        | 69 e2e cases (+46 in-suite skip gates)                                                                                        |

---

## B. Test-suite map

| Area                     | Source files                                                                                                   | Test files                                                                                                      | Level                 | CI status            | Notes                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| Pure logic / utils       | `lib/brmTimes,brevet-card,fuzzy-match,rwgps,controlPoints,geo,email-typo,validation,season,legacy-redirects,…` | `tests/unit/lib/*`                                                                                              | unit                  | `verify` ✓           | Strongest tier. Exact algorithmic assertions.                                                      |
| Domain services          | `lib/memberships/service`, `lib/events/*`, `lib/email/*`                                                       | `tests/unit/{events,email}/*`, real-DB `memberships/`                                                           | unit + real-DB        | ✓ both jobs          | Membership gate now real-DB tested (13 cases).                                                     |
| Server actions (write)   | `lib/actions/*`                                                                                                | `tests/integration/actions/*` (mock) + `tests/integration-real/*` (real)                                        | integration           | ✓ both jobs          | Mock tier = input/call-shape; real tier = behavior.                                                |
| Data fetching (read)     | `lib/data/*`                                                                                                   | `tests/integration/data/*`                                                                                      | integration (mock)    | `verify` ✓           | Query-arg + transform assertions; some `toEqual([])` weak paths.                                   |
| API / route handlers     | `app/api/*/route.ts`, `app/api/calendar/[chapter]`                                                             | `tests/integration/api/*`                                                                                       | integration (mock)    | `verify` ✓           | Auth well tested. `event/[...path]`, `schedule/[schedId]` handlers untested.                       |
| React components         | `components/**`                                                                                                | `tests/unit/components/*`                                                                                       | component (happy-dom) | `verify` ✓           | Strong where payloads asserted; several defer to e2e.                                              |
| Auth / roles             | `lib/auth/get-admin`, `lib/auth/roles`, `proxy.ts`, `lib/supabase-middleware`                                  | `tests/integration/auth/get-admin.test.ts`                                                                      | integration (mock)    | `verify` ✓           | Only `getAdmin`/`requireAdmin` shape tested; **no enforcement/scoping test**; middleware untested. |
| Triggers / RLS / records | DB migrations, RPCs                                                                                            | `tests/integration-real/{devil-week,first-brevet,records-*,hidden-rider,*-bucket-policy,token-column-security}` | real-DB               | `integration-real` ✓ | Model tests, except `token-column-security` (vacuous) + guard-skip files.                          |
| Digital brevet card      | `lib/brevet-card`, `lib/actions/{brevet-card,control-checkins,pre-ride}`                                       | unit + real-DB `brevet-card/*` + component                                                                      | all                   | ✓ (e2e not)          | Excellent multi-tier coverage.                                                                     |
| Critical user journeys   | registration, result submission, admin workflows                                                               | `tests/e2e/*`                                                                                                   | e2e                   | **none**             | 69 cases, 46 skip gates, ~10 tautologies.                                                          |
| Rate limiting            | `lib/rate-limit.ts`                                                                                            | —                                                                                                               | —                     | —                    | **No test.**                                                                                       |

---

## C. Coverage gaps (prioritized)

| Priority | Behavior at risk                                                                                          | Evidence                                                                                                                                                                                                                                              | Existing coverage                                               | Recommended test                                                                                                       | Level            |
| -------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **P0**   | chapter_admin can mutate another chapter's events/routes/results/news/pages — unenforced **and** untested | `lib/auth/get-admin.ts` `requireAdmin()` returns ANY admin; `lib/auth/roles.ts` has `isSuperAdmin`/`isFullAdmin` but **no chapter helper**; 15 action files call `requireAdmin()` with no `chapter_id` check; grep for chapter denial in tests → none | none                                                            | Per mutating action: chapter_admin(A) → mutate chapter-B resource → assert denial. **Fix code first, then red/green.** | integration-real |
| **P0**   | Non-admin / unauthenticated blocked from admin actions                                                    | Auth universally stubbed (`vi.mock('@/lib/auth/get-admin', … requireAdmin: vi.fn().mockResolvedValue(...))` in 14 files); the planned `tests/integration/auth/authorization.test.ts` (March Phase 3.4) **was never created**                          | partial: `admin-users.test.ts` role-gates; `images.test.ts:170` | Call each admin action with `requireAdmin` un-stubbed + no user → assert `Unauthorized`                                | integration      |
| **P0**   | `lib/rate-limit.ts` sliding-window logic (login/registration/check-in brute-force)                        | No test imports `isRateLimited`; only `resetRateLimitStores` is called in real-DB setup                                                                                                                                                               | none                                                            | allow≤max, block on max+1, window-expiry frees slot, store isolation, reset clears                                     | unit             |
| **High** | Capability-token column protection can't fail on empty DB                                                 | `token-column-security.test.ts:26-29,37-40` derive `hasToken` from `data?.some(...)`; no row seeded → `data=[]` → passes regardless. View tests (L55-73) never assert token columns absent                                                            | exists but vacuous                                              | Seed a known token row; assert anon read errors/omits that value; assert view lacks the columns                        | real-DB          |
| **P1**   | ACP homologation email mis-routed to one Toronto address for every chapter                                | `lib/actions/events.ts:709` `const toAddress = 'leissp@mac.com'`; `:713` hardcodes `vp-toronto`; `lib/email/vp-emails.ts:getVpEmail()` exists but is not used here; `events.test.ts:354` asserts attachment/body only, never `to`/`cc`                | none for recipients                                             | After routing fix, assert `to`/`cc` per chapter                                                                        | integration      |
| **P1**   | `proxy.ts` / `updateSession` admin-route redirect for unauthenticated users                               | `proxy.ts:4-12` matcher `/admin/:path*`; no test imports `lib/supabase-middleware`                                                                                                                                                                    | none                                                            | unauth → redirect to login; auth → pass                                                                                | integration      |
| **P2**   | `lib/actions/erw-sync.ts` (`syncEventToErw`) admin-gated external sync                                    | 0% coverage; no test references it                                                                                                                                                                                                                    | none                                                            | mocked ERW client: success + non-admin denial                                                                          | integration      |
| **P2**   | `lib/data/first-time-riders.ts` (feeds admin event + control-card pages)                                  | 0% coverage; no test imports it                                                                                                                                                                                                                       | none                                                            | first-time detection over seeded results                                                                               | real-DB          |
| **P2**   | Legacy redirect **route handlers** (`app/event/[...path]`, `app/schedule/[schedId]`)                      | Only the pure map is unit-tested; handlers (301/302, params await) untested                                                                                                                                                                           | indirect                                                        | known id → 301; unknown → 302 `/calendar`                                                                              | integration      |
| **P2**   | `lib/actions/registration/finalize.ts` (5% stmts) — upsert incomplete→registered upgrade                  | March deferred item #1; no test covers status upgrade                                                                                                                                                                                                 | none                                                            | re-register incomplete rider w/ valid membership → status upgrades                                                     | real-DB          |
| **P3**   | `lib/auth/roles.ts` predicates; `lib/hero-images.ts`                                                      | no direct test                                                                                                                                                                                                                                        | transitive                                                      | cheap truth-table / fs unit tests                                                                                      | unit             |

---

## D. Dead-code & obsolete-test candidates

**No confirmed dead-source-with-tests exists.** Every prior lead traces to live
usage (the team already removed the April cleanup items). Reported for completeness:

| Confidence           | Source                                                                           | Tests                      | Evidence                                                                                                                                                                                                | Action                                                                        |
| -------------------- | -------------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Confirmed (resolved) | `components/example.tsx`, `openai` dep                                           | —                          | Both already deleted since April audit                                                                                                                                                                  | none                                                                          |
| Confirmed (live)     | `lib/legacy-redirects.ts`                                                        | `legacy-redirects.test.ts` | Imported by `app/event/[...path]/route.ts:2`, `app/schedule/[schedId]/route.ts:2`; the April "placeholder/XXX" note is **stale** (entries are real 2026 data). Header says deletable after 2026 season. | Keep; delete module + 2 handlers + test **together** post-season (~Oct 2026). |
| Confirmed (live)     | `lib/dev-data.ts`, `lib/hero-images.ts`, `lib/og/*`, `lib/utils/rider-search.ts` | mixed                      | All imported in prod render paths (traced)                                                                                                                                                              | Keep.                                                                         |
| N/A                  | `scripts/*.ts` (7, incl. one-off 2026 artifacts)                                 | none                       | No tests target them → not "dead-code-with-tests"                                                                                                                                                       | Out of scope; optional archival.                                              |

No `TODO`/`DEPRECATED`/`XXX` dead branches in `lib/` or `app/` (only a doc comment
in `validation.ts:33`). No feature-flag-gated dead code. **Do not delete any test
in isolation** — the only future removal (legacy redirects) must remove source +
handlers + test as one change.

---

## E. Ineffective / vacuous test findings

| Severity     | Test (file : name)                                                                                                              | Problem                                                                                                                                                                                                                                                                                         | Evidence                                                       | Action                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **High**     | `tests/unit/lib/security.test.ts` : "Admin login redirect validation" (5 tests)                                                 | Reimplements `getSafeRedirectUrl` locally; the real one (`app/admin/login/page.tsx:13`) is **not exported** so it can't be imported. **Proven by mutation:** rewriting the real fn to `return redirect` (open redirect) left all 15 tests green                                                 | test L1749-1753; source `page.tsx:13` (private)                | Export `getSafeRedirectUrl` to a lib module; import in page + test; delete local copy                            |
| **High**     | `tests/unit/components/award-badge.test.ts` : whole file                                                                        | Copies `getColorClasses`, `colorClassesMap`, and `aggregateAwards` (the last is **exported** at `award-badge.tsx:160`) into the test and asserts the copy; never renders/imports the component                                                                                                  | test L12-57 "Extracted from …"; 0% component coverage confirms | Import `aggregateAwards`; render `AwardBadge`/`AwardSummary`, assert emitted DOM                                 |
| **High**     | `tests/unit/components/rider-directory.test.ts` : whole file                                                                    | Same anti-pattern: `groupRidersByLastName`/`filterRiders` (both private) reimplemented; never renders `RiderDirectory`                                                                                                                                                                          | test L20-39; 0% component coverage                             | Render `RiderDirectory`, drive the search box, assert grouped/filtered DOM                                       |
| **High**     | `tests/integration/data/event-rider-counts.test.ts` : all 9 tests                                                               | Tests a `mergeRiderCounts` **reimplemented inside the test file** (L24-50), not the real `app/admin/events/page.tsx` logic                                                                                                                                                                      | comment L11-14 "replicate the exact merge algorithm"           | Extract the real merge fn to `lib/`, import it, or move to a real-DB page test                                   |
| **High**     | `tests/integration-real/token-column-security.test.ts` : 2 anon tests                                                           | Pass vacuously on empty DB (no token row seeded → `hasToken=false`); view tests never assert columns absent                                                                                                                                                                                     | L26-29, L37-40, L55-73                                         | Seed a known token; assert anon cannot read that value + view omits columns                                      |
| **Med-High** | `tests/unit/components/markdown-editor.test.tsx` : 8 of 11                                                                      | 3 tests have **no `expect`** (comments only); "rejects invalid type/size" assert only `mockUploadFile).not.toHaveBeenCalled()` — a **dead mock** of a removed `uploadFile` action (component now uses `createImageUploadUrl`). **Proven by mutation:** breaking `isImageType` left all 11 green | test L12-13 "Kept so existing … compile", L118-210             | Delete assertion-free tests; drive `handleDrop`/upload, assert `onChange` payload; remove `mockUploadFile`       |
| **Med**      | `tests/integration-real/riders-by-latest-chapter.test.ts` : whole file                                                          | Every test early-`return`s when ambient data absent (`if (!membership?.chapters) return`, `if (fullCount<2) return`), seeds nothing → green while asserting nothing on a clean DB                                                                                                               | L15/44/63/74/92/118                                            | Seed the memberships it needs; drop the guards                                                                   |
| **Med**      | `tests/integration-real/report-stats.test.ts`                                                                                   | Shape-only `toHaveProperty` under `if (data.length>0)` guards + `if (!chapters) return`; real invariants limited to a couple `toHaveLength`                                                                                                                                                     | L37/51/78/88                                                   | Seed rows; assert computed stat values                                                                           |
| **Med**      | `tests/integration/actions/routes.test.ts` : RWGPS-ID extraction (3) + "route not found" (2)                                    | ID-extraction tests assert only `error).not.toBe('Route name is required')` (never check extracted `rwgps_id` in payload); not-found tests assert `toBeDefined()`                                                                                                                               | L206/219/231; L284/368                                         | Assert `rwgps_id` in insert payload; assert the specific error string                                            |
| **Med**      | `tests/integration/actions/admin-users.test.ts` : "rolls back auth user when admin record creation fails"                       | Names rollback; asserts only `success:false`+`error).toBeDefined()`; **never asserts `deleteUser` was called**                                                                                                                                                                                  | L294-308                                                       | Assert `auth.admin.deleteUser` called with the created id                                                        |
| **Med**      | `tests/unit/lib/security.test.ts` : "escapes HTML in route URL attribute"                                                       | Payload `javascript:alert(1)` has no HTML metachars → `escapeHtml` is a no-op → passes with or without escaping; the escaping claim is a bare comment                                                                                                                                           | L1678-1688                                                     | Use a payload with `"><` and assert entity-encoded output                                                        |
| **Med**      | `tests/integration/actions/rider-match.test.ts` : "handles trimmed input"                                                       | Comment promises "query with trimmed values"; asserts only `candidates).toEqual([])`, never the query args                                                                                                                                                                                      | L145                                                           | Assert the `.or()`/`ilike` filter received trimmed values                                                        |
| **Low**      | `tests/unit/lib/riders-data.test.ts` : "handles null values in data"                                                            | Only `expect(Array.isArray(riders)).toBe(true)`; comment admits module cache may serve stale data so the re-mock may not apply                                                                                                                                                                  | L850-864                                                       | `vi.resetModules()`, assert coalesced row values                                                                 |
| **Low**      | `error-handling.test.ts` (4), `data/*` "returns empty/handles error → toEqual([])" (many), `records.test.ts` conditional guards | `toBeDefined()`-only error checks (L51/68/209/283); `toEqual([])` passes on the default mock regardless of table/filter; two `records` tests wrap asserts in `if (result.length>0)`                                                                                                             | as cited                                                       | Assert exact messages; drop the `if` guards (mock guarantees non-empty)                                          |
| **Low**      | Mock-integration `success:true`-only happy paths                                                                                | `admin-users` L261/366/426/489, `auth` L77/161/212, `images` L195-270, `news` L190/229, `navigation` L57-71, `pages` L91, `results` L576                                                                                                                                                        | assert only `success:true`                                     | Add one payload/side-effect assertion each (or accept as smoke, deferring behavior to the real-DB tier, not e2e) |

---

## F. Duplication & consolidation

Duplication is **low and mostly healthy defense-in-depth**. Groups:

1. **Registration behavior — mock (`register.test.ts`) vs real-DB
   (`register-for-event/-permanent`, `complete-registration`).** _Keep both._
   The mock tier guards honeypot/BotID/Sentry/rate-limit input handling without a
   DB; the real-DB tier guards the 13-step write path. Genuinely independent
   confidence.
2. **Reimplementation copies duplicate production logic into tests**
   (`award-badge`, `rider-directory`, `event-rider-counts`, `security`
   getSafeRedirectUrl). This is _bad_ duplication — a second copy that drifts
   silently. Resolve by importing the real symbol (see §E); no confidence lost,
   confidence **gained**.
3. **Membership gate — mock `register.test.ts` branches vs real-DB
   `membership-service` + registration tests.** Slight overlap on
   valid/trial-used/none branches. Keep the real-DB set as source of truth; the
   mock branches are cheap and test the action's branching, not the gate — no
   consolidation needed.
4. **`isCompletedDevilWeek` appears in `data/results.test.ts`,
   `data/routes.test.ts`, and real-DB `records-devil-week-counts`.** The two mock
   copies assert the same derived flag on canned data. Could merge the mock copies;
   low priority, low payoff.

No e2e test currently duplicates a lower tier meaningfully (they mostly skip). No
unit test re-tests a third-party library.

---

## G. Maintainability findings (ranked)

1. **Universal auth stubbing hides an enforcement boundary.** 14 files stub
   `requireAdmin` to always resolve. This is fine for testing _business_ logic but
   means the authz boundary is a permanent blind spot. Introduce one un-stubbed
   authorization suite rather than un-stubbing everywhere.
2. **"Covered by E2E" is a broken promise.** ~20 comments
   (`register.test.ts:169`, `events.test.ts:14`, `result-submission-form.test.tsx:135,212,217,242`,
   `event-form.test.tsx:111,151,177,197`, `permanent-registration-form.test.tsx:196,202`,
   `user-form.test.tsx:61`, `data/results.test.ts:265`, `data/routes.test.ts:254`, …)
   defer to a suite that runs in no CI job. The correct pattern already exists:
   `register.test.ts:232` defers to **integration-real**, which _does_ gate CI.
3. **Coverage is silently broken** — `@vitest/coverage-v8` missing from
   `package.json`. Anyone running `test:coverage` hits a hard error; the 60/50
   thresholds in `vitest.config.mts:33-38` therefore gate nothing.
4. **E2E design guarantees invisibility.** `global-setup.ts` _warns and returns_
   when Supabase env vars are absent (never throws), so `.e2e-data.json` is never
   written and every seed-dependent test self-skips. Combined with no CI job, the
   strongest e2e tests (brevet-card check-in, result-upload, admin news CRUD)
   protect nothing today.
5. **Reimplementation anti-pattern** (§E) — private production functions copied
   into tests. Fix by exporting the real function.
6. **Weak default-mock assertions** — the mock query builder ignores
   table/columns/filters, so `toEqual([])`/`toBeDefined()` tests pass on structure
   alone. These are cheap but low-signal; the real-DB tier is where filter
   correctness is actually proven (correctly).
7. **Fixtures/dates** — the March "no hardcoded dates" rule is being followed
   (`daysFromNow`/`isoDaysFromNow` helpers in e2e setup and fixtures). Good.

---

## H. Recommended remediation plan

**Phase 1 — Safe cleanup (low regression risk).**

- Scope: fix 4 reimplementation test files (export the real symbols; delete
  copies); delete the 3 assertion-free markdown-editor tests + dead `mockUploadFile`;
  add `@vitest/coverage-v8` to devDependencies.
- Benefit: removes proven false confidence; restores coverage tooling.
- Risk: minimal (tests only + one dev dep). Validation: `npx vitest run` green;
  `npm run test:coverage` now runs.
- Files: ~6. **One PR.**

**Phase 2 — Strengthen high-risk existing tests.**

- Scope: seed a real token in `token-column-security.test.ts` and assert the leak
  path; deseed-guard-remove `riders-by-latest-chapter` / `report-stats`; convert
  the highest-value `success:true`/`toBeDefined` weak asserts (routes RWGPS-ID,
  admin-users rollback, rider-match trimmed) to payload/side-effect assertions.
- Benefit: closes the security-test vacuity; converts guard-skip files to real
  protection.
- Risk: low-med (real-DB, needs local Postgres to validate). Validation:
  `npm run test:integration-real` **twice** (idempotency).
- Files: ~5. **Separate PR** (needs DB to review).

**Phase 3 — Add missing high-value coverage.**

- Scope: `rate-limit.ts` unit tests (P0); authorization suite — non-admin denied +
  **chapter_admin cross-chapter denied** (P0, pairs with the code fix from April
  audit #1); `proxy.ts`/`updateSession` redirect test; ACP email routing test
  (after the `getVpEmail` fix).
- Benefit: closes the security-shaped gaps that both prior audits flagged.
- Risk: the chapter-scoping test requires a **source fix first**
  (add `isChapterAdmin` + per-action checks) — coordinate as one change.
- Files: ~6 tests + the enforcement code. **Split: rate-limit PR; authz PR;
  email-routing PR.**

**Phase 4 — Test-infrastructure refactor.**

- Scope: decide e2e's fate — either add a CI `e2e` job with seeded Supabase +
  dev server (and make `global-setup` **throw** on missing env so it can't silently
  no-op), or downgrade the "covered by E2E" comments to reflect reality and move
  that coverage to integration-real. Reduce the 46 skip gates and ~10 tautologies.
- Benefit: makes the deferral comments honest.
- Risk: med (CI runtime, flakiness). Validation: e2e green in CI twice.
- Files: `ci.yml`, `global-setup.ts`, 6 e2e specs. **Its own PR.**

**Phase 5 — Ongoing controls.**

- A lint/CI check that fails on `expect(true).toBe(true)`, assertion-free `it`
  blocks, and new "covered by E2E" comments while e2e is out of CI. Consider
  targeted **mutation testing** (§ below) on `lib/rate-limit`, `lib/brmTimes`,
  `lib/memberships/service`, and the new authorization helper once it exists.

**Mutation-testing candidates (selective, not repo-wide):** `lib/auth` (once
`isChapterAdmin` lands), `lib/rate-limit.ts`, `lib/brmTimes.ts`,
`lib/memberships/service.ts`, `lib/events/finish-time.ts`. These are
logic-dense authorization/billing-adjacent/date modules where surviving mutants
would be genuinely informative.

---

## I. Candidate patches (initial reviewable PR — NOT YET APPLIED)

A single low-risk PR, ~6 files, all tests-or-tooling, each with proof of safety.
**Not applied** pending your go-ahead.

1. **`package.json`** — add `"@vitest/coverage-v8": "^4.0.16"` to `devDependencies`.
   _Proof:_ `npm run test:coverage` fails without it; passes with it (verified locally).
2. **`app/admin/login/page.tsx` + new `lib/admin/redirect.ts`** — export
   `getSafeRedirectUrl` from lib, import it in the page. **`tests/unit/lib/security.test.ts`**
   — delete the local copy, import the real fn. _Proof:_ mutation (`return redirect`)
   currently keeps tests green; after the change it will fail — I can demonstrate red/green.
3. **`tests/unit/components/award-badge.test.ts`** — import the exported
   `aggregateAwards` (`award-badge.tsx:160`) instead of the copy; add one render
   assertion for `AwardBadge`. _Proof:_ component coverage currently 0%.
4. **`tests/unit/components/rider-directory.test.ts`** — render `RiderDirectory`
   and drive the search box; drop the private-fn copies. _Proof:_ component coverage 0%.
5. **`tests/unit/components/markdown-editor.test.tsx`** — delete the 3
   assertion-free tests and the dead `mockUploadFile` scaffolding; keep the real ones.
   _Proof:_ mutation of `isImageType` keeps all 11 green today.
6. **`tests/integration/actions/routes.test.ts`** — strengthen the 3 RWGPS-ID
   tests to assert `rwgps_id` in the insert payload (the extraction is the point).
   _Proof:_ current asserts only `error).not.toBe('Route name is required')`.

Deliberately **excluded** from the first PR (higher risk / need a DB or a source
fix, belong to Phases 2–3): `token-column-security` reseed, the authorization
suite, `rate-limit` tests, the ACP-email routing fix.

---

## Limitations

- **Coverage** reflects only the mock unit+integration tiers; the real-DB and e2e
  tiers are not instrumented, so component/action files they exercise read as 0%.
- **Real-DB and e2e suites were read, not executed** (no local Postgres / dev
  server in this environment). Vacuity findings there (`token-column-security`,
  `riders-by-latest-chapter`) are from code reading; the `security.test.ts`,
  `award-badge`, and `markdown-editor` vacuity claims **were proven by mutation**
  in the runnable tier (mutations reverted; `git status` clean).
- Next.js framework-discovered files (route handlers, `proxy.ts`,
  `opengraph-image.tsx`, `instrumentation*.ts`) were traced by convention, not by
  import graph, before any "untested" claim.
