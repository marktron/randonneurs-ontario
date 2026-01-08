import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Clock } from 'lucide-react'
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

interface RiderDetail {
  id: string
  slug: string
  first_name: string
  last_name: string
  email: string | null
  gender: string | null
  created_at: string
}

interface Registration {
  id: string
  registered_at: string
  status: string
  events: {
    id: string
    name: string
    event_date: string
    distance_km: number
  }
}

interface Result {
  id: string
  finish_time: string | null
  status: string
  team_name: string | null
  season: number
  distance_km: number
  events: {
    id: string
    name: string
    event_date: string
  }
}

async function getRiderDetails(riderId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rider } = await (supabaseAdmin.from('riders') as any)
    .select('*')
    .eq('id', riderId)
    .single()

  return rider as RiderDetail | null
}

async function getRiderRegistrations(riderId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('registrations') as any)
    .select(`
      id,
      registered_at,
      status,
      events (id, name, event_date, distance_km)
    `)
    .eq('rider_id', riderId)
    .order('registered_at', { ascending: false })

  return (data as Registration[]) ?? []
}

async function getRiderResults(riderId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('results') as any)
    .select(`
      id,
      finish_time,
      status,
      team_name,
      season,
      distance_km,
      events (id, name, event_date)
    `)
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })

  return (data as Result[]) ?? []
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

  if (admin.role !== 'admin') {
    redirect('/admin')
  }

  const [rider, registrations, results] = await Promise.all([
    getRiderDetails(id),
    getRiderRegistrations(id),
    getRiderResults(id),
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

      <div>
        <h1 className="text-3xl font-bold">
          {rider.first_name} {rider.last_name}
        </h1>
        <p className="text-muted-foreground">{rider.email || 'No email on file'}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gender</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{rider.gender || '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Registrations</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{registrations.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Results</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{results.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Distance</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{totalDistance.toLocaleString()} km</p>
          </CardContent>
        </Card>
      </div>

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
                    <TableHead>Distance</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={result.id}>
                      <TableCell>
                        <Link
                          href={`/admin/events/${result.events.id}`}
                          className="font-medium hover:underline"
                        >
                          {result.events.name}
                        </Link>
                        {result.team_name && (
                          <p className="text-sm text-muted-foreground">
                            Team: {result.team_name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {parseLocalDate(result.events.event_date).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>{result.distance_km} km</TableCell>
                      <TableCell>
                        {result.finish_time ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {result.finish_time}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(result.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
                    <TableHead>Distance</TableHead>
                    <TableHead>Registered</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registrations.map((reg) => (
                    <TableRow key={reg.id}>
                      <TableCell>
                        <Link
                          href={`/admin/events/${reg.events.id}`}
                          className="font-medium hover:underline"
                        >
                          {reg.events.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {parseLocalDate(reg.events.event_date).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>{reg.events.distance_km} km</TableCell>
                      <TableCell>
                        {new Date(reg.registered_at).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </TableCell>
                      <TableCell>{getStatusBadge(reg.status)}</TableCell>
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
