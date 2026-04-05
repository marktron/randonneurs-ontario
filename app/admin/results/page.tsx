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
import { AdminPagination } from '@/components/admin/admin-pagination'
import type { ResultForAdminList, GetDistinctSeasonsResult, ChapterForAdmin } from '@/types/queries'

const PAGE_SIZE = 50

function buildPageUrl(page: number, season: number | null, chapterId: string | null): string {
  const params = new URLSearchParams()
  if (season !== null) params.set('season', String(season))
  if (chapterId) params.set('chapter', chapterId)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return `/admin/results${qs ? `?${qs}` : ''}`
}

async function getResults(
  season: number | null,
  chapterId: string | null,
  page: number = 1
): Promise<{ results: ResultForAdminList[]; totalCount: number }> {
  // Get total count with same filters
  let countQuery = getSupabaseAdmin()
    .from('results')
    .select('id, events!inner(chapter_id)', { count: 'exact', head: true })

  if (season !== null) {
    countQuery = countQuery.eq('season', season)
  }
  if (chapterId) {
    countQuery = countQuery.eq('events.chapter_id', chapterId)
  }

  const { count } = await countQuery
  const totalCount = count ?? 0

  // Get paginated data
  const offset = (page - 1) * PAGE_SIZE
  let query = getSupabaseAdmin().from('results').select(`
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
    .range(offset, offset + PAGE_SIZE - 1)

  return { results: (data as ResultForAdminList[]) ?? [], totalCount }
}

async function getSeasons(): Promise<number[]> {
  const { data } = await getSupabaseAdmin().rpc('get_distinct_seasons')

  if (!data) return []

  return (data as GetDistinctSeasonsResult[]).map((r) => r.season)
}

async function getChapters(): Promise<ChapterForAdmin[]> {
  const { data } = await getSupabaseAdmin()
    .from('chapters')
    .select('id, name, slug')
    .order('name', { ascending: true })

  return (data as ChapterForAdmin[]) ?? []
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
  searchParams: Promise<{ season?: string; chapter?: string; page?: string }>
}

export default async function AdminResultsPage({ searchParams }: AdminResultsPageProps) {
  await requireAdmin()

  const params = await searchParams
  const selectedSeason = params.season ? parseInt(params.season, 10) : null
  const selectedChapter = params.chapter || null
  const page = Math.max(1, parseInt(params.page || '1', 10))

  const [{ results, totalCount }, seasons, chapters] = await Promise.all([
    getResults(selectedSeason, selectedChapter, page),
    getSeasons(),
    getChapters(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Results</h1>
        <p className="text-muted-foreground">View and manage event results across all chapters</p>
      </div>

      <ResultsFilters seasons={seasons} chapters={chapters} />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rider</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="hidden md:table-cell">Chapter</TableHead>
              <TableHead className="hidden lg:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Distance</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[50px]">Actions</TableHead>
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
                        <p className="text-sm text-muted-foreground">Team: {result.team_name}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {result.events.chapters?.name || '—'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {parseLocalDate(result.events.event_date).toLocaleDateString('en-CA', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{result.distance_km} km</TableCell>
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

      {totalCount > 0 && (
        <AdminPagination
          page={page}
          pageSize={PAGE_SIZE}
          totalCount={totalCount}
          buildPageUrl={(p) => buildPageUrl(p, selectedSeason, selectedChapter)}
          label="results"
        />
      )}
    </div>
  )
}
