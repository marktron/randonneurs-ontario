import { requireAdmin } from '@/lib/auth/get-admin'
import { supabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate } from '@/lib/utils'
import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, Clock } from 'lucide-react'

interface ResultWithDetails {
  id: string
  finish_time: string | null
  status: string
  team_name: string | null
  season: number
  distance_km: number
  created_at: string
  riders: {
    id: string
    first_name: string
    last_name: string
  }
  events: {
    id: string
    name: string
    event_date: string
    chapters: { name: string } | null
  }
}

async function getResults() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('results') as any)
    .select(`
      id,
      finish_time,
      status,
      team_name,
      season,
      distance_km,
      created_at,
      riders (id, first_name, last_name),
      events (id, name, event_date, chapters (name))
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  return (data as ResultWithDetails[]) ?? []
}

async function getSeasons() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabaseAdmin.from('results') as any)
    .select('season')
    .order('season', { ascending: false })

  if (!data) return []

  // Get unique seasons
  const seasons = [...new Set(data.map((r: { season: number }) => r.season))]
  return seasons as number[]
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
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

interface AdminResultsPageProps {
  searchParams: Promise<{ season?: string }>
}

export default async function AdminResultsPage({ searchParams }: AdminResultsPageProps) {
  await requireAdmin()

  const params = await searchParams
  const selectedSeason = params.season ? parseInt(params.season, 10) : null

  const [allResults, seasons] = await Promise.all([
    getResults(),
    getSeasons(),
  ])

  // Filter by season if selected
  const results = selectedSeason
    ? allResults.filter((r) => r.season === selectedSeason)
    : allResults

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="text-muted-foreground">
          View and manage event results across all chapters
        </p>
      </div>

      {/* Season filter */}
      {seasons.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by season:</span>
          <div className="flex flex-wrap gap-1">
            <Button
              variant={selectedSeason === null ? 'default' : 'outline'}
              size="sm"
              asChild
            >
              <Link href="/admin/results">All</Link>
            </Button>
            {seasons.map((season) => (
              <Button
                key={season}
                variant={selectedSeason === season ? 'default' : 'outline'}
                size="sm"
                asChild
              >
                <Link href={`/admin/results?season=${season}`}>{season}</Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No results found
                </TableCell>
              </TableRow>
            ) : (
              results.map((result) => (
                <TableRow key={result.id}>
                  <TableCell className="font-medium">
                    {result.riders.first_name} {result.riders.last_name}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{result.events.name}</p>
                      {result.team_name && (
                        <p className="text-sm text-muted-foreground">
                          Team: {result.team_name}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{result.events.chapters?.name || '—'}</TableCell>
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
                  <TableCell>
                    <Button variant="ghost" size="icon-sm" asChild>
                      <Link href={`/admin/events/${result.events.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {results.length} results. Click the eye icon to view and edit results on the event page.
      </p>
    </div>
  )
}
