import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getChapters } from '@/lib/actions/admin-users'
import { getCurrentSeasonLabel } from '@/lib/season'
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

interface MembershipStats {
  total_members: number
  new_members: number
  returning_members: number
  prior_year_members: number
}

interface ParticipationStats {
  unique_riders: number
  total_finishes: number
  total_dnf: number
  total_dns: number
  total_otl: number
  total_km: number
}

interface EventStatRow {
  distance_bucket: string
  event_count: number
  total_riders: number
}

interface TopRiderRow {
  rider_id: string
  first_name: string
  last_name: string
  events_finished: number
  total_km: number
}

interface YoyRow {
  season: number
  members: number
  events: number
  riders: number
  total_km: number
}

interface NonRenewedRiderRow {
  rider_id: string
  first_name: string
  last_name: string
}

const currentSeason = getCurrentSeasonLabel()

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
  return (
    data?.[0] ?? { total_members: 0, new_members: 0, returning_members: 0, prior_year_members: 0 }
  )
}

async function getParticipationStats(season: number, chapterId: string | null) {
  const { data } = await getSupabaseAdmin().rpc('get_report_participation_stats', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return (
    data?.[0] ?? {
      unique_riders: 0,
      total_finishes: 0,
      total_dnf: 0,
      total_dns: 0,
      total_otl: 0,
      total_km: 0,
    }
  )
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
  const { data } = await getSupabaseAdmin().rpc('get_report_non_renewed_riders', {
    p_season: season,
    ...(chapterId ? { p_chapter_id: chapterId } : {}),
  })
  return (data ?? []).map((r: NonRenewedRiderRow) => ({
    id: r.rider_id,
    first_name: r.first_name,
    last_name: r.last_name,
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
  const chapterId = params.chapter === 'all' ? null : (params.chapter ?? admin.chapter_id ?? null)

  const [membership, participation, eventStats, topRiders, yoy, nonRenewed] = await Promise.all([
    getMembershipStats(seasonNum, chapterId),
    getParticipationStats(seasonNum, chapterId),
    getEventStats(seasonNum, chapterId),
    getTopRiders(seasonNum, chapterId),
    getYoySummary(seasonNum, chapterId),
    getNonRenewedRiders(seasonNum, chapterId),
  ])

  const retentionRate =
    membership.prior_year_members > 0
      ? Math.round(
          (Number(membership.returning_members) / Number(membership.prior_year_members)) * 100
        )
      : null

  const completionRate =
    Number(participation.total_finishes) +
      Number(participation.total_dnf) +
      Number(participation.total_dns) +
      Number(participation.total_otl) >
    0
      ? Math.round(
          (Number(participation.total_finishes) /
            (Number(participation.total_finishes) +
              Number(participation.total_dnf) +
              Number(participation.total_dns) +
              Number(participation.total_otl))) *
            100
        )
      : null

  const totalEvents = eventStats.reduce(
    (sum: number, e: EventStatRow) => sum + Number(e.event_count),
    0
  )
  const totalEventRiders = eventStats.reduce(
    (sum: number, e: EventStatRow) => sum + Number(e.total_riders),
    0
  )
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
        <Card className="gap-0">
          <CardHeader>
            <CardDescription>Members</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {Number(membership.total_members).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {Number(membership.new_members)} new, {Number(membership.returning_members)} returning
            </p>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader>
            <CardDescription>Retention</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {retentionRate !== null ? `${retentionRate}%` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              of {Number(membership.prior_year_members)} members from {seasonNum - 1}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader>
            <CardDescription>Unique Riders</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {Number(participation.unique_riders).toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {Number(participation.total_finishes).toLocaleString()} finishes
              {completionRate !== null ? `, ${completionRate}% completion` : ''}
            </p>
          </CardContent>
        </Card>

        <Card className="gap-0">
          <CardHeader>
            <CardDescription>Total Distance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {Number(participation.total_km).toLocaleString()} km
            </p>
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
                    {eventStats.map((row: EventStatRow) => (
                      <TableRow key={row.distance_bucket}>
                        <TableCell className="font-medium">{row.distance_bucket}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(row.event_count)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(row.total_riders)}
                        </TableCell>
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
                    <TableCell className="text-right tabular-nums">
                      {Number(participation.total_finishes).toLocaleString()}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">DNF</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(participation.total_dnf)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">DNS</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(participation.total_dns)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">OTL</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(participation.total_otl)}
                    </TableCell>
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
            <CardDescription>
              By total distance this season{' '}
              {chapterId ? `for ${chapters.find((c) => c.id === chapterId)?.name} events` : ''}
            </CardDescription>
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
                    {topRiders.map((rider: TopRiderRow) => (
                      <TableRow key={rider.rider_id}>
                        <TableCell>
                          <Link
                            href={`/admin/riders/${rider.rider_id}`}
                            className="font-medium hover:underline"
                          >
                            {rider.first_name} {rider.last_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(rider.events_finished)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {Number(rider.total_km).toLocaleString()} km
                        </TableCell>
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
                  {yoy.map((row: YoyRow) => (
                    <TableRow
                      key={row.season}
                      className={row.season === seasonNum ? 'font-medium' : ''}
                    >
                      <TableCell className="tabular-nums">{row.season}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.members).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.events)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.riders).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row.total_km).toLocaleString()}
                      </TableCell>
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
              {nonRenewed.length} rider{nonRenewed.length !== 1 ? 's' : ''} with results this season
              but no {season} membership on file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {nonRenewed.map((rider: { id: string; first_name: string; last_name: string }) => (
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
