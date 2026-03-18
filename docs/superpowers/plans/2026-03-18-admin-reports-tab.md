# Admin Reports Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reports" tab to the admin sidebar showing chapter-wide season statistics — membership, events, participation, distance, and top riders — with season/chapter filters matching the existing admin patterns.

**Architecture:** Server-side data fetching in an async page component, matching the Events page pattern. A shared `ReportFilters` client component handles season/chapter URL params. Report data is computed via Supabase queries (some new RPC functions, some direct queries). The page renders a dashboard of cards and small tables. No client-side state beyond filter navigation.

**Tech Stack:** Next.js App Router (server component), Supabase (RPC + direct queries), shadcn/ui (Card, Table, Badge, Select), Tailwind CSS, Lucide icons.

---

## File Structure

| Action | Path                                                         | Responsibility                                                |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Create | `app/admin/reports/page.tsx`                                 | Main reports page — data fetching + rendering                 |
| Create | `components/admin/report-filters.tsx`                        | Season + chapter filter selects (reuses EventFilters pattern) |
| Create | `supabase/migrations/TIMESTAMP_add_report_rpc_functions.sql` | RPC functions for report aggregations                         |
| Modify | `components/admin/sidebar.tsx`                               | Add "Reports" nav item                                        |
| Create | `tests/integration/data/report-stats.test.ts`                | Tests for the report RPC functions                            |
| Create | `docs/reports.md`                                            | Documentation for the reports feature                         |

---

### Task 1: Add RPC Functions for Report Data

These aggregate queries are expensive to do client-side and benefit from being close to the data.

**Files:**

- Create: `supabase/migrations/TIMESTAMP_add_report_rpc_functions.sql`

- [ ] **Step 1: Write the migration with report RPC functions**

We need five functions. All accept `p_season INT` and `p_chapter_id UUID` (nullable — NULL means all chapters).

```sql
-- 1. Membership stats for a season/chapter
CREATE OR REPLACE FUNCTION get_report_membership_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  total_members BIGINT,
  new_members BIGINT,
  returning_members BIGINT,
  prior_year_members BIGINT
)
LANGUAGE sql STABLE AS $$
  WITH current AS (
    SELECT DISTINCT rider_id
    FROM rider_memberships
    WHERE season = p_season
      AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id)
  ),
  prior AS (
    SELECT DISTINCT rider_id
    FROM rider_memberships
    WHERE season = p_season - 1
      AND (p_chapter_id IS NULL OR chapter_id = p_chapter_id)
  )
  SELECT
    (SELECT count(*) FROM current) AS total_members,
    (SELECT count(*) FROM current WHERE rider_id NOT IN (SELECT rider_id FROM prior)) AS new_members,
    (SELECT count(*) FROM current WHERE rider_id IN (SELECT rider_id FROM prior)) AS returning_members,
    (SELECT count(*) FROM prior) AS prior_year_members;
$$;

-- 2. Event stats for a season/chapter — grouped by distance bucket
CREATE OR REPLACE FUNCTION get_report_event_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  distance_bucket TEXT,
  event_count BIGINT,
  total_riders BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    CASE
      WHEN e.distance_km < 200 THEN 'Populaire'
      WHEN e.distance_km = 200 THEN '200'
      WHEN e.distance_km = 300 THEN '300'
      WHEN e.distance_km = 400 THEN '400'
      WHEN e.distance_km = 600 THEN '600'
      WHEN e.distance_km >= 1000 THEN '1000+'
      ELSE 'Other'
    END AS distance_bucket,
    count(DISTINCT e.id) AS event_count,
    count(DISTINCT r.rider_id) AS total_riders
  FROM events e
  LEFT JOIN results r ON r.event_id = e.id AND r.status = 'finished'
  WHERE e.season = p_season
    AND e.status IN ('completed', 'submitted')
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
  GROUP BY distance_bucket
  ORDER BY
    CASE
      WHEN distance_bucket = 'Populaire' THEN 1
      WHEN distance_bucket = '200' THEN 2
      WHEN distance_bucket = '300' THEN 3
      WHEN distance_bucket = '400' THEN 4
      WHEN distance_bucket = '600' THEN 5
      WHEN distance_bucket = '1000+' THEN 6
      ELSE 7
    END;
$$;

-- 3. Participation stats (finishes, DNF, DNS, etc.)
CREATE OR REPLACE FUNCTION get_report_participation_stats(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  unique_riders BIGINT,
  total_finishes BIGINT,
  total_dnf BIGINT,
  total_dns BIGINT,
  total_otl BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    count(DISTINCT CASE WHEN r.status = 'finished' THEN r.rider_id END) AS unique_riders,
    count(*) FILTER (WHERE r.status = 'finished') AS total_finishes,
    count(*) FILTER (WHERE r.status = 'dnf') AS total_dnf,
    count(*) FILTER (WHERE r.status = 'dns') AS total_dns,
    count(*) FILTER (WHERE r.status = 'otl') AS total_otl,
    coalesce(sum(r.distance_km) FILTER (WHERE r.status = 'finished'), 0) AS total_km
  FROM results r
  JOIN events e ON e.id = r.event_id
  WHERE r.season = p_season
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id);
$$;

-- 4. Top riders by events completed and distance for a season/chapter
CREATE OR REPLACE FUNCTION get_report_top_riders(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  rider_id UUID,
  first_name TEXT,
  last_name TEXT,
  events_finished BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    rd.id AS rider_id,
    rd.first_name,
    rd.last_name,
    count(*) AS events_finished,
    sum(r.distance_km) AS total_km
  FROM results r
  JOIN events e ON e.id = r.event_id
  JOIN riders rd ON rd.id = r.rider_id
  WHERE r.season = p_season
    AND r.status = 'finished'
    AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
  GROUP BY rd.id, rd.first_name, rd.last_name
  ORDER BY total_km DESC, events_finished DESC
  LIMIT p_limit;
$$;

-- 5. Year-over-year summary (last 5 seasons)
CREATE OR REPLACE FUNCTION get_report_yoy_summary(
  p_season INT,
  p_chapter_id UUID DEFAULT NULL
)
RETURNS TABLE(
  season INT,
  members BIGINT,
  events BIGINT,
  riders BIGINT,
  total_km BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT
    s.season,
    (SELECT count(DISTINCT rm.rider_id)
     FROM rider_memberships rm
     WHERE rm.season = s.season
       AND (p_chapter_id IS NULL OR rm.chapter_id = p_chapter_id)
    ) AS members,
    (SELECT count(DISTINCT e.id)
     FROM events e
     WHERE e.season = s.season
       AND e.status IN ('completed', 'submitted')
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS events,
    (SELECT count(DISTINCT r.rider_id)
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.season = s.season
       AND r.status = 'finished'
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS riders,
    (SELECT coalesce(sum(r.distance_km), 0)
     FROM results r
     JOIN events e ON e.id = r.event_id
     WHERE r.season = s.season
       AND r.status = 'finished'
       AND (p_chapter_id IS NULL OR e.chapter_id = p_chapter_id)
    ) AS total_km
  FROM generate_series(p_season - 4, p_season) AS s(season)
  ORDER BY s.season DESC;
$$;
```

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase migration up`
Expected: Migration applies without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/*_add_report_rpc_functions.sql
git commit -m "feat: add RPC functions for admin reports"
```

---

### Task 2: Add Reports Nav Item to Sidebar

**Files:**

- Modify: `components/admin/sidebar.tsx:19-33` (imports), `components/admin/sidebar.tsx:42-79` (mainNavItems)

- [ ] **Step 1: Add BarChart3 to lucide imports**

In `components/admin/sidebar.tsx`, add `BarChart3` to the lucide-react import.

- [ ] **Step 2: Add Reports entry to mainNavItems**

Add after the "News" entry:

```typescript
{
  title: 'Reports',
  href: '/admin/reports',
  icon: BarChart3,
  testId: 'nav-reports',
},
```

- [ ] **Step 3: Verify sidebar renders the new item**

Navigate to any admin page and confirm "Reports" appears in the sidebar between "News" and the Management section.

- [ ] **Step 4: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat: add Reports nav item to admin sidebar"
```

---

### Task 3: Create Report Filters Component

**Files:**

- Create: `components/admin/report-filters.tsx`

This is a simplified version of `components/admin/event-filters.tsx`, adapted for the reports page URL structure.

- [ ] **Step 1: Create the report filters component**

```typescript
'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectLabel,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Chapter {
  id: string
  name: string
}

interface ReportFiltersProps {
  season: string
  chapterId: string | null
  chapters: Chapter[]
  seasons: string[]
}

const CHAPTER_ORDER = ['Huron', 'Ottawa', 'Simcoe-Muskoka', 'Toronto']
const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'

function buildFilterUrl(season: string, chapterId: string | null, explicitAll: boolean = false) {
  const params = new URLSearchParams()
  if (season !== currentSeason) params.set('season', season)
  if (chapterId) {
    params.set('chapter', chapterId)
  } else if (explicitAll) {
    params.set('chapter', 'all')
  }
  const qs = params.toString()
  return `/admin/reports${qs ? `?${qs}` : ''}`
}

export function ReportFilters({ season, chapterId, chapters, seasons }: ReportFiltersProps) {
  const router = useRouter()

  const mainChapters = CHAPTER_ORDER.map((name) => chapters.find((c) => c.name === name)).filter(
    (c): c is Chapter => c !== undefined
  )
  const otherChapters = chapters
    .filter((c) => !CHAPTER_ORDER.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const handleSeasonChange = (value: string) => {
    router.push(buildFilterUrl(value, chapterId))
  }

  const handleChapterChange = (value: string) => {
    const isAll = value === 'all'
    router.push(buildFilterUrl(season, isAll ? null : value, isAll))
  }

  const currentChapterName = chapterId
    ? chapters.find((c) => c.id === chapterId)?.name || 'Unknown'
    : 'All Chapters'

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Season:</span>
        <Select value={season} onValueChange={handleSeasonChange}>
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {seasons.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Chapter:</span>
        <Select value={chapterId || 'all'} onValueChange={handleChapterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue>{currentChapterName}</SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            <SelectItem value="all">All Chapters</SelectItem>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Chapters</SelectLabel>
              {mainChapters.map((chapter) => (
                <SelectItem key={chapter.id} value={chapter.id}>
                  {chapter.name}
                </SelectItem>
              ))}
            </SelectGroup>
            {otherChapters.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Other</SelectLabel>
                  {otherChapters.map((chapter) => (
                    <SelectItem key={chapter.id} value={chapter.id}>
                      {chapter.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/report-filters.tsx
git commit -m "feat: add ReportFilters component for reports page"
```

---

### Task 4: Create the Reports Page

**Files:**

- Create: `app/admin/reports/page.tsx`

This is the main deliverable. It fetches all report data server-side and renders a dashboard layout.

- [ ] **Step 1: Write the integration tests for RPC functions**

Create `tests/integration/data/report-stats.test.ts` (these will pass once the migration from Task 1 has been applied):

```typescript
import { describe, it, expect } from 'vitest'
import { getSupabaseAdmin } from '@/lib/supabase-server'

describe('Report RPC functions', () => {
  const supabase = getSupabaseAdmin()
  const testSeason = 2025

  it('get_report_membership_stats returns expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_membership_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty('total_members')
    expect(data![0]).toHaveProperty('new_members')
    expect(data![0]).toHaveProperty('returning_members')
    expect(data![0]).toHaveProperty('prior_year_members')
  })

  it('get_report_participation_stats returns expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_participation_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty('unique_riders')
    expect(data![0]).toHaveProperty('total_finishes')
    expect(data![0]).toHaveProperty('total_km')
  })

  it('get_report_event_stats returns rows with expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_event_stats', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('distance_bucket')
      expect(data![0]).toHaveProperty('event_count')
      expect(data![0]).toHaveProperty('total_riders')
    }
  })

  it('get_report_top_riders returns rows with expected shape', async () => {
    const { data, error } = await supabase.rpc('get_report_top_riders', {
      p_season: testSeason,
      p_limit: 5,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if (data!.length > 0) {
      expect(data![0]).toHaveProperty('rider_id')
      expect(data![0]).toHaveProperty('first_name')
      expect(data![0]).toHaveProperty('events_finished')
      expect(data![0]).toHaveProperty('total_km')
    }
  })

  it('get_report_yoy_summary returns 5 seasons', async () => {
    const { data, error } = await supabase.rpc('get_report_yoy_summary', {
      p_season: testSeason,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(5)
    expect(data![0]).toHaveProperty('season')
    expect(data![0]).toHaveProperty('members')
    expect(data![0]).toHaveProperty('events')
    expect(data![0]).toHaveProperty('riders')
    expect(data![0]).toHaveProperty('total_km')
  })

  it('filters by chapter when p_chapter_id is provided', async () => {
    // Get a real chapter ID
    const { data: chapters } = await supabase.from('chapters').select('id').limit(1).single()

    if (!chapters) return // Skip if no chapters

    const { data, error } = await supabase.rpc('get_report_participation_stats', {
      p_season: testSeason,
      p_chapter_id: chapters.id,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/integration/data/report-stats.test.ts`
Expected: All tests PASS (migration was applied in Task 1).

- [ ] **Step 3: Create the reports page**

Create `app/admin/reports/page.tsx`. This follows the same pattern as `app/admin/events/page.tsx`:

```typescript
import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getChapters } from '@/lib/actions/admin-users'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReportFilters } from '@/components/admin/report-filters'

const currentSeason = process.env.NEXT_PUBLIC_CURRENT_SEASON || '2026'

async function getAvailableSeasons(): Promise<string[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_event_seasons')
  if (!data || data.length === 0) return [currentSeason]
  return data.map((row: { season: number }) => row.season.toString())
}

async function getMembershipStats(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_membership_stats', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return data?.[0] ?? { total_members: 0, new_members: 0, returning_members: 0, prior_year_members: 0 }
}

async function getParticipationStats(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_participation_stats', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return data?.[0] ?? { unique_riders: 0, total_finishes: 0, total_dnf: 0, total_dns: 0, total_otl: 0, total_km: 0 }
}

async function getEventStats(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_event_stats', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return data ?? []
}

async function getTopRiders(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_top_riders', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
    p_limit: 10,
  })
  return data ?? []
}

async function getYoySummary(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_yoy_summary', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return data ?? []
}

async function getNonRenewedRiders(season: number, chapterId: string | null) {
  // Riders who have results this season but no membership
  const supabase = getSupabaseAdmin()

  let query = supabase
    .from('results')
    .select(`
      rider_id,
      riders!inner (id, first_name, last_name),
      events!inner (chapter_id)
    `)
    .eq('season', season)
    .eq('status', 'finished')

  if (chapterId) {
    query = query.eq('events.chapter_id', chapterId)
  }

  const { data: ridersWithResults } = await query

  if (!ridersWithResults || ridersWithResults.length === 0) return []

  // Get unique rider IDs
  const riderIds = [...new Set(ridersWithResults.map((r: any) => r.rider_id))]

  // Find which of these have memberships
  const { data: memberships } = await supabase
    .from('rider_memberships')
    .select('rider_id')
    .eq('season', season)
    .in('rider_id', riderIds)

  const memberSet = new Set((memberships ?? []).map((m: any) => m.rider_id))

  // Return riders without membership, deduplicated
  const seen = new Set<string>()
  return ridersWithResults
    .filter((r: any) => {
      if (memberSet.has(r.rider_id) || seen.has(r.rider_id)) return false
      seen.add(r.rider_id)
      return true
    })
    .map((r: any) => ({
      id: r.riders.id,
      first_name: r.riders.first_name,
      last_name: r.riders.last_name,
    }))
}

interface ReportsPageProps {
  searchParams: Promise<{ season?: string; chapter?: string }>
}

export default async function AdminReportsPage({ searchParams }: ReportsPageProps) {
  const [admin, params, chapters, seasons] = await Promise.all([
    requireAdmin(),
    searchParams,
    getChapters(),
    getAvailableSeasons(),
  ])

  const season = params.season || currentSeason
  const seasonNum = parseInt(season)
  // Chapter admins always see their own chapter; full admins can pick or see all
  const chapterId = params.chapter === 'all'
    ? null
    : (params.chapter ?? admin.chapter_id ?? null)

  const [membership, participation, eventStats, topRiders, yoy, nonRenewed] = await Promise.all([
    getMembershipStats(seasonNum, chapterId),
    getParticipationStats(seasonNum, chapterId),
    getEventStats(seasonNum, chapterId),
    getTopRiders(seasonNum, chapterId),
    getYoySummary(seasonNum, chapterId),
    getNonRenewedRiders(seasonNum, chapterId),
  ])

  const retentionRate = membership.prior_year_members > 0
    ? Math.round((Number(membership.returning_members) / Number(membership.prior_year_members)) * 100)
    : null

  const completionRate = (Number(participation.total_finishes) + Number(participation.total_dnf) + Number(participation.total_dns) + Number(participation.total_otl)) > 0
    ? Math.round(
        (Number(participation.total_finishes) /
          (Number(participation.total_finishes) + Number(participation.total_dnf) + Number(participation.total_dns) + Number(participation.total_otl))) *
          100
      )
    : null

  const totalEvents = eventStats.reduce((sum: number, e: any) => sum + Number(e.event_count), 0)
  const totalEventRiders = eventStats.reduce((sum: number, e: any) => sum + Number(e.total_riders), 0)
  const avgParticipation = totalEvents > 0 ? Math.round(totalEventRiders / totalEvents) : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Season overview and chapter statistics</p>
      </div>

      <ReportFilters season={season} chapterId={chapterId} chapters={chapters} seasons={seasons} />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Members</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{Number(membership.total_members).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {Number(membership.new_members)} new, {Number(membership.returning_members)} returning
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Retention</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{retentionRate !== null ? `${retentionRate}%` : '—'}</p>
            <p className="text-xs text-muted-foreground">
              of {Number(membership.prior_year_members)} members from {seasonNum - 1}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique Riders</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{Number(participation.unique_riders).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {Number(participation.total_finishes).toLocaleString()} finishes, {completionRate !== null ? `${completionRate}% completion` : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Distance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{Number(participation.total_km).toLocaleString()} km</p>
            <p className="text-xs text-muted-foreground">
              across {totalEvents} events, avg {avgParticipation} riders/event
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Events by Distance */}
        <Card>
          <CardHeader>
            <CardTitle>Events by Distance</CardTitle>
          </CardHeader>
          <CardContent>
            {eventStats.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed events this season.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Distance</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Riders</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eventStats.map((row: any) => (
                      <TableRow key={row.distance_bucket}>
                        <TableCell className="font-medium">{row.distance_bucket}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(row.event_count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(row.total_riders)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Participation Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Participation Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Finished</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(participation.total_finishes).toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">DNF</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(participation.total_dnf)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">DNS</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(participation.total_dns)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">OTL</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(participation.total_otl)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top Riders */}
        <Card>
          <CardHeader>
            <CardTitle>Top Riders</CardTitle>
            <CardDescription>By total distance this season</CardDescription>
          </CardHeader>
          <CardContent>
            {topRiders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No results this season.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rider</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topRiders.map((rider: any) => (
                      <TableRow key={rider.rider_id}>
                        <TableCell>
                          <Link
                            href={`/admin/riders/${rider.rider_id}`}
                            className="font-medium hover:underline"
                          >
                            {rider.first_name} {rider.last_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{Number(rider.events_finished)}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(rider.total_km).toLocaleString()} km</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Year-over-Year */}
        <Card>
          <CardHeader>
            <CardTitle>Year over Year</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Season</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Riders</TableHead>
                    <TableHead className="text-right">Distance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yoy.map((row: any) => (
                    <TableRow key={row.season} className={row.season === seasonNum ? 'font-medium' : ''}>
                      <TableCell className="tabular-nums">{row.season}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.members).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.events)}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.riders).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(row.total_km).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Non-renewed riders */}
      {nonRenewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Rode Without Membership</CardTitle>
            <CardDescription>
              {nonRenewed.length} rider{nonRenewed.length !== 1 ? 's' : ''} with results this season but no {season} membership on file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {nonRenewed.map((rider: any) => (
                <Link
                  key={rider.id}
                  href={`/admin/riders/${rider.id}`}
                  className="hover:underline text-muted-foreground hover:text-foreground"
                >
                  {rider.first_name} {rider.last_name}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they still pass**

Run: `npx vitest run tests/integration/data/report-stats.test.ts`
Expected: All 6 tests PASS.

- [ ] **Step 5: Verify visually**

Navigate to `http://localhost:3000/admin/reports` and confirm:

- Filters work (season, chapter)
- All cards and tables render with data
- Links to rider detail pages work
- Non-renewed riders section appears when applicable

- [ ] **Step 6: Commit**

```bash
git add app/admin/reports/page.tsx tests/integration/data/report-stats.test.ts
git commit -m "feat: add admin reports page with season/chapter statistics"
```

---

### Task 5: Documentation

**Files:**

- Create: `docs/reports.md`

- [ ] **Step 1: Write documentation**

Document:

- What the reports page shows and why
- How filters work (season/chapter URL params, admin default chapter)
- What each section displays (membership, events, participation, top riders, YoY, non-renewed)
- How to add new report sections (create RPC function, add fetch function, render in page)

- [ ] **Step 2: Commit**

```bash
git add docs/reports.md
git commit -m "docs: add reports feature documentation"
```
