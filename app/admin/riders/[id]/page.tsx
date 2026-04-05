import { requireAdmin } from '@/lib/auth/get-admin'
import { isFullAdmin } from '@/lib/auth/roles'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate, formatFinishTime } from '@/lib/utils'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Clock } from 'lucide-react'
import { RiderEditForm } from '@/components/admin/rider-edit-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { RiderDetail, RegistrationWithEvent, ResultWithEventForRider } from '@/types/queries'

async function getRiderDetails(riderId: string): Promise<RiderDetail | null> {
  const { data: rider } = await getSupabaseAdmin()
    .from('riders')
    .select('*')
    .eq('id', riderId)
    .single()

  return rider as RiderDetail | null
}

async function getRiderRegistrations(riderId: string): Promise<RegistrationWithEvent[]> {
  const { data } = await getSupabaseAdmin()
    .from('registrations')
    .select(
      `
      id,
      registered_at,
      status,
      events (id, name, event_date, distance_km)
    `
    )
    .eq('rider_id', riderId)
    .order('registered_at', { ascending: false })

  return (data as RegistrationWithEvent[]) ?? []
}

async function getRiderResults(riderId: string): Promise<ResultWithEventForRider[]> {
  const { data } = await getSupabaseAdmin()
    .from('results')
    .select(
      `
      id,
      finish_time,
      status,
      team_name,
      season,
      distance_km,
      events (id, name, event_date)
    `
    )
    .eq('rider_id', riderId)

  const results = (data as ResultWithEventForRider[]) ?? []
  results.sort((a, b) => {
    const dateA = a.events?.event_date ?? ''
    const dateB = b.events?.event_date ?? ''
    return dateB.localeCompare(dateA)
  })
  return results
}

async function getRiderMemberships(riderId: string): Promise<number[]> {
  const { data } = await getSupabaseAdmin()
    .from('rider_memberships')
    .select('season')
    .eq('rider_id', riderId)
    .order('season', { ascending: true })

  return (data ?? []).map((m) => m.season)
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'finished':
      return <Badge>Finished</Badge>
    case 'dnf':
      return <Badge variant="secondary">DNF</Badge>
    case 'dns':
      return <Badge variant="outline">DNS</Badge>
    case 'otl':
      return <Badge variant="secondary">OTL</Badge>
    case 'dq':
      return <Badge variant="destructive">DQ</Badge>
    case 'registered':
      return <Badge variant="secondary">Registered</Badge>
    case 'cancelled':
      return <Badge variant="destructive">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

interface RiderPageProps {
  params: Promise<{ id: string }>
}

export default async function RiderDetailPage({ params }: RiderPageProps) {
  const { id } = await params
  const admin = await requireAdmin()

  if (!isFullAdmin(admin.role)) {
    redirect('/admin')
  }

  const [rider, registrations, results, memberSeasons] = await Promise.all([
    getRiderDetails(id),
    getRiderRegistrations(id),
    getRiderResults(id),
    getRiderMemberships(id),
  ])

  if (!rider) {
    notFound()
  }

  // Calculate total distance from finished results
  const totalDistance = results
    .filter((r) => r.status === 'finished')
    .reduce((sum, r) => sum + r.distance_km, 0)

  return (
    <div className="space-y-6">
      <Link
        href="/admin/riders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Riders
      </Link>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h1 className="text-3xl font-bold">
          {rider.first_name} {rider.last_name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            Gender: <span className="font-medium text-foreground">{rider.gender || '—'}</span>
          </span>
          <span>
            Registrations:{' '}
            <span className="font-medium text-foreground">{registrations.length}</span>
          </span>
          <span>
            Results: <span className="font-medium text-foreground">{results.length}</span>
          </span>
          <span>
            Distance:{' '}
            <span className="font-medium text-foreground">{totalDistance.toLocaleString()} km</span>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <RiderEditForm
          rider={{
            id: rider.id,
            first_name: rider.first_name,
            last_name: rider.last_name,
            email: rider.email,
          }}
        />

        {/* Membership & Season History */}
        {(() => {
          const currentYear = new Date().getFullYear()
          const startYear = 2018
          const years = Array.from(
            { length: currentYear - startYear + 1 },
            (_, i) => currentYear - i
          )
          const seasonSet = new Set(memberSeasons)
          const seasonStats = new Map<number, { events: number; distance: number }>()
          for (const r of results) {
            if (r.status === 'finished' && r.season) {
              const s = seasonStats.get(r.season) ?? { events: 0, distance: 0 }
              s.events++
              s.distance += r.distance_km
              seasonStats.set(r.season, s)
            }
          }
          return (
            <Card className="lg:w-64">
              <CardHeader>
                <CardTitle>Season History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-[auto_1fr_1fr] gap-x-3 text-sm tabular-nums whitespace-nowrap">
                  <div className="col-span-3 grid grid-cols-subgrid text-xs text-muted-foreground pb-1 mb-1 border-b">
                    <span>Year</span>
                    <span className="text-right">Events</span>
                    <span className="text-right">Distance</span>
                  </div>
                  {years.map((year) => {
                    const isMember = seasonSet.has(year)
                    const stats = seasonStats.get(year)
                    const hasActivity = isMember || stats
                    return (
                      <div
                        key={year}
                        className={`col-span-3 grid grid-cols-subgrid items-center py-1 ${
                          hasActivity ? 'text-foreground' : 'text-muted-foreground/30'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {isMember && (
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-600 dark:bg-green-500" />
                          )}
                          {!isMember && <span className="inline-block h-1.5 w-1.5" />}
                          {year}
                        </span>
                        <span className="text-right text-muted-foreground">
                          {stats ? stats.events : ''}
                        </span>
                        <span className="text-right">
                          {stats ? `${stats.distance.toLocaleString()}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )
        })()}
      </div>

      {/* Registrations */}
      <Card>
        <CardHeader>
          <CardTitle>Registrations</CardTitle>
          <CardDescription>Event registrations for this rider</CardDescription>
        </CardHeader>
        <CardContent>
          {registrations.length === 0 ? (
            <p className="text-muted-foreground text-sm">No registrations found.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Event Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Distance</TableHead>
                    <TableHead className="hidden md:table-cell">Registered</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations
                    .filter((reg) => reg.events)
                    .map((reg) => (
                      <TableRow key={reg.id}>
                        <TableCell>
                          <Link
                            href={`/admin/events/${reg.events!.id}`}
                            className="font-medium hover:underline"
                          >
                            {reg.events!.name}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {parseLocalDate(reg.events!.event_date).toLocaleDateString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {reg.events!.distance_km} km
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {reg.registered_at
                            ? new Date(reg.registered_at).toLocaleDateString('en-CA', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell>{getStatusBadge(reg.status ?? 'registered')}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
          <CardDescription>Event results for this rider</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length === 0 ? (
            <p className="text-muted-foreground text-sm">No results recorded yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="hidden sm:table-cell">Distance</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results
                    .filter((result) => result.events)
                    .map((result) => (
                      <TableRow key={result.id}>
                        <TableCell>
                          <Link
                            href={`/admin/events/${result.events!.id}`}
                            className="font-medium hover:underline"
                          >
                            {result.events!.name}
                          </Link>
                          {result.team_name && (
                            <p className="text-sm text-muted-foreground">
                              Team: {result.team_name}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {parseLocalDate(result.events!.event_date).toLocaleDateString('en-CA', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {result.distance_km} km
                        </TableCell>
                        <TableCell>
                          {result.finish_time ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatFinishTime(result.finish_time)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(result.status ?? 'pending')}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
