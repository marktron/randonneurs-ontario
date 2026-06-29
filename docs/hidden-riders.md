# Hidden Riders

## Overview

A rider can be flagged **hidden** so their name and slug never appear on any
public-facing surface — the riders directory, results, awards, records and
leaderboards, and the public registered-rider lists. A hidden rider still:

- Appears normally throughout the **admin** site.
- Sees their **own** upcoming registrations in the homepage "My Rides" section
  (see [my-rides.md](my-rides.md)), because that lookup runs server-side with
  the service role.

This supports privacy requests where someone participates in club events but
must not be discoverable on the website.

## How it works

The flag is a single column, `riders.hidden` (boolean, default `false`).
Suppression is enforced at the **database** layer so it can't be bypassed by a
public client crafting raw PostgREST queries.

### 1. RLS is the boundary

The public site reads riders through the `anon` role — directly, via the
`security_invoker` views `public_riders` / `public_results`, and via PostgREST
embeds on `public_registrations`. The SELECT policy on `riders` restricts what
`anon` can see:

```sql
CREATE POLICY "riders_select_public" ON riders
  FOR SELECT USING (hidden IS NOT TRUE OR is_admin());
```

Because every public read funnels through `anon`, this one policy hides the
rider from the base table, both public views, the sitemap (which goes through
`public_riders`), and the fleche/team registration embeds — with **no grant of
the `hidden` column to `anon`**, so the flag itself never leaks.

Admin tooling and the My Rides lookup use the **service-role** client
(`getSupabaseAdmin()`), which bypasses RLS, so both keep seeing hidden riders.

### 2. SECURITY DEFINER RPCs are patched explicitly

The record/award helper functions (`get_rider_completion_counts`,
`get_award_recipients`, the streak/season/PBP/Granite-Anvil functions, etc.) are
`SECURITY DEFINER` and bypass RLS, so each one that returns a rider name/slug
carries an explicit `AND ... hidden IS NOT TRUE`. See the migration
`supabase/migrations/20260628120000_add_rider_hidden_flag.sql`.

### 3. Registered lists keep the rider but force "Anonymous"

A hidden rider is **not removed** from a public registered-rider list — they
stay counted, but are always shown as "Anonymous" (never named), even if they
opted to share their registration:

- The `get_registered_riders` RPC nulls the name and returns
  `share_registration AND NOT hidden`, so `lib/data/events.ts` renders
  "Anonymous".
- The fleche/team path embeds `riders(...)` under `anon`; RLS nulls that embed,
  and the existing app code already renders a null rider as "Anonymous".

### 4. Nameless aggregates still count them

Aggregates that show **no** names — route popularity
(`get_route_participant_counts`, `get_route_frequency_counts`) and per-event
participant counts — are intentionally left unchanged, so a hidden rider still
contributes to those totals.

## Setting the flag

Admins toggle **"Hidden from public site"** on the rider detail page
(`/admin/riders/[id]`). The admin riders list shows a **Hidden** badge next to
flagged riders.

Toggling runs through `updateRider` (`lib/actions/riders.ts`). When a
public-visible field changes — the visibility flag **or** the rider's name (but
not an email-only edit, since email is never public) — it revalidates the
`riders`, `results`, `records`, `awards`, and `registrations` cache tags, plus
the rider's own `rider-<slug>` tag, so every cached public surface (directory,
profile, results, leaderboards, awards, registered lists, sitemap) drops the
rider promptly instead of waiting out the hourly ISR window.

## Files

| File                                                           | Purpose                                            |
| -------------------------------------------------------------- | -------------------------------------------------- |
| `supabase/migrations/20260628120000_add_rider_hidden_flag.sql` | Column, RLS policy, and all RPC redefinitions      |
| `lib/actions/riders.ts`                                        | `updateRider` accepts `hidden`; cache revalidation |
| `components/admin/rider-edit-form.tsx`                         | The hidden toggle                                  |
| `components/admin/riders-table.tsx`                            | The "Hidden" badge                                 |
| `tests/integration-real/hidden-rider.test.ts`                  | End-to-end suppression coverage (real DB + RLS)    |

## Testing

Because suppression depends on RLS and the RPCs, it is covered by the real-DB
suite, not the mock-based one:

```bash
npm run test:integration-real -- tests/integration-real/hidden-rider.test.ts
```
