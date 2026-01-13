import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import {
  getRiderBySlug,
  getRiderResults,
  type RiderYearResults,
  type RiderEventResult,
} from '@/lib/data/results'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export const revalidate = 3600 // Revalidate every hour

interface RiderPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: RiderPageProps) {
  const { slug } = await params
  const rider = await getRiderBySlug(slug)

  if (!rider) {
    return { title: 'Rider Not Found' }
  }

  return {
    title: `${rider.firstName} ${rider.lastName} - Results`,
    description: `View randonneuring results for ${rider.firstName} ${rider.lastName}.`,
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(time: string | null, status: string): string {
  if (status === 'finished' && time) {
    return time
  }
  // Show status for non-finished rides
  const statusMap: Record<string, string> = {
    dnf: 'DNF',
    dns: 'DNS',
    otl: 'OTL',
    dq: 'DQ',
    pending: '—',
  }
  return statusMap[status] || status.toUpperCase()
}

function getDisplayNote(result: RiderEventResult): string | null {
  const parts: string[] = []
  if (result.eventType === 'permanent') {
    parts.push('Permanent')
  }
  if (result.note) {
    parts.push(result.note)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

function ResultCard({ result, year }: { result: RiderEventResult; year: number }) {
  const eventLink = result.chapterSlug
    ? `/results/${year}/${result.chapterSlug}#event-${result.date}`
    : null
  const displayNote = getDisplayNote(result)

  return (
    <div className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eventLink ? (
            <Link
              href={eventLink}
              className="font-medium hover:text-primary transition-colors"
            >
              {result.eventName}
            </Link>
          ) : (
            <span className="font-medium">{result.eventName}</span>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(result.date)} · {result.distanceKm} km
          </p>
          {displayNote && (
            <p className="text-sm text-muted-foreground mt-1">{displayNote}</p>
          )}
        </div>
        <span className={`font-mono text-sm shrink-0 ${
          result.status !== 'finished' ? 'text-muted-foreground' : ''
        }`}>
          {formatTime(result.time, result.status ?? 'pending')}
        </span>
      </div>
    </div>
  )
}

function YearSection({ yearData }: { yearData: RiderYearResults }) {
  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight">
          {yearData.year}
        </h2>
        <p className="text-muted-foreground mt-1">
          {yearData.completedCount} completed ride{yearData.completedCount !== 1 ? 's' : ''}
          {' '}&middot;{' '}
          {yearData.totalDistanceKm.toLocaleString()} km
        </p>
      </header>

      {/* Mobile: Stacked cards */}
      <div className="md:hidden">
        {yearData.results.map((result, index) => (
          <ResultCard
            key={`${result.date}-${result.eventName}-${index}`}
            result={result}
            year={yearData.year}
          />
        ))}
      </div>

      {/* Desktop: Table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Date</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="w-[100px]">Distance</TableHead>
              <TableHead className="w-[80px]">Time</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yearData.results.map((result, index) => (
              <TableRow key={`${result.date}-${result.eventName}-${index}`}>
                <TableCell className="text-muted-foreground">
                  {formatDate(result.date)}
                </TableCell>
                <TableCell className="font-medium">
                  {result.chapterSlug ? (
                    <Link
                      href={`/results/${yearData.year}/${result.chapterSlug}#event-${result.date}`}
                      className="hover:text-primary transition-colors"
                    >
                      {result.eventName}
                    </Link>
                  ) : (
                    result.eventName
                  )}
                </TableCell>
                <TableCell>
                  {result.distanceKm} km
                </TableCell>
                <TableCell className={`font-mono ${
                  result.status !== 'finished' ? 'text-muted-foreground' : ''
                }`}>
                  {formatTime(result.time, result.status ?? 'pending')}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {getDisplayNote(result) || ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

export default async function RiderPage({ params }: RiderPageProps) {
  const { slug } = await params

  const [rider, yearResults] = await Promise.all([
    getRiderBySlug(slug),
    getRiderResults(slug),
  ])

  if (!rider) {
    notFound()
  }

  // Calculate totals across all years
  const totalCompletedRides = yearResults.reduce((sum, y) => sum + y.completedCount, 0)
  const totalDistanceKm = yearResults.reduce((sum, y) => sum + y.totalDistanceKm, 0)

  return (
    <PageShell>
      {/* Header */}
      <div className="border-b border-border">
        <div className="content-container py-12 md:py-16">
          <p className="eyebrow text-muted-foreground">Rider Results</p>
          <h1 className="font-serif text-4xl md:text-5xl tracking-tight mt-2">
            {rider.firstName} {rider.lastName}
          </h1>
          {yearResults.length > 0 && (
            <p className="text-muted-foreground mt-3 text-lg">
              {yearResults.length} season{yearResults.length !== 1 ? 's' : ''}
              {' '}&middot;{' '}
              {totalCompletedRides} completed ride{totalCompletedRides !== 1 ? 's' : ''}
              {' '}&middot;{' '}
              {totalDistanceKm.toLocaleString()} km total
            </p>
          )}
        </div>
      </div>

      {/* Results by Year */}
      <div className="content-container py-12 md:py-16">
        {yearResults.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No results found for this rider.
          </p>
        ) : (
          <div className="space-y-16">
            {yearResults.map((yearData) => (
              <YearSection key={yearData.year} yearData={yearData} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
