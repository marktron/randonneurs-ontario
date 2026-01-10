import { requireAdmin } from '@/lib/auth/get-admin'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { parseLocalDate, formatFinishTime } from '@/lib/utils'
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
import { ResultsFilters } from '@/components/admin/results-filters'

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

async function getResults(season: number | null, chapterId: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (getSupabaseAdmin().from('results') as any)
    .select(`
      id,
      finish_time,
      status,
      team_name,
      season,
      distance_km,
      created_at,
      riders (id, first_name, last_name),
      events!inner (id, name, event_date, chapter_id, chapters (name))
    `)

  if (season !== null) {
    query = query.eq('season', season)
  }

  if (chapterId) {
    query = query.eq('events.chapter_id', chapterId)
  }

  const { data } = await query
    .order('events(event_date)', { ascending: false })
    .limit(500)

  return (data as ResultWithDetails[]) ?? []
}

async function getSeasons() {
  // Use RPC function to efficiently get distinct seasons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (getSupabaseAdmin() as any).rpc('get_distinct_seasons')

  if (!data) return []

  return (data as { season: number }[]).map(r => r.season)
}

interface Chapter {
  id: string
  name: string
  slug: string
}

async function getChapters(): Promise<Chapter[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (getSupabaseAdmin().from('chapters') as any)
    .select('id, name, slug')
    .order('name', { ascending: true })

  return (data as Chapter[]) ?? []
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
  searchParams: Promise<{ season?: string; chapter?: string }>
}

export default async function AdminResultsPage({ searchParams }: AdminResultsPageProps) {
  await requireAdmin()

  const params = await searchParams
  const selectedSeason = params.season ? parseInt(params.season, 10) : null
  const selectedChapter = params.chapter || null

  const [results, seasons, chapters] = await Promise.all([
    getResults(selectedSeason, selectedChapter),
    getSeasons(),
    getChapters(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="text-muted-foreground">
          View and manage event results across all chapters
        </p>
      </div>

      {/* Filters */}
      <ResultsFilters seasons={seasons} chapters={chapters} />

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
                        {formatFinishTime(result.finish_time)}
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
