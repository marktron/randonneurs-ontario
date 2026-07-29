import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { devData } from '@/lib/dev-data'
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
import { AwardBadge, AwardBadgeList, AwardSummary, aggregateAwards } from '@/components/award-badge'

export const revalidate = 3600 // Revalidate every hour

interface RiderPageProps {
  params: Promise<{ slug: string }>
}

/**
 * Build a one-sentence, factual metadata description for a rider page from
 * data the page already fetches (no extra queries). Falls back to a generic
 * sentence when the rider has no finished results to summarize — e.g. a
 * newly-added rider, or one whose results are all DNF/DNS/OTL/DQ.
 */
export function buildRiderDescription(
  rider: { firstName: string; lastName: string },
  yearResults: RiderYearResults[]
): string {
  const fullName = `${rider.firstName} ${rider.lastName}`.trim()
  const completedResults = yearResults.flatMap((year) =>
    year.results.filter((result) => result.status === 'finished')
  )

  if (completedResults.length === 0) {
    return `View randonneuring results for ${fullName}.`
  }

  const totalCompleted = completedResults.length
  const distances = completedResults.map((result) => result.distanceKm)
  const minDistance = Math.min(...distances)
  const maxDistance = Math.max(...distances)
  const distanceRange =
    minDistance === maxDistance ? `${minDistance} km` : `${minDistance}–${maxDistance} km`

  const seasons = yearResults.map((year) => year.year)
  const firstSeason = Math.min(...seasons)
  const lastSeason = Math.max(...seasons)
  const seasonRange =
    firstSeason === lastSeason ? `in ${firstSeason}` : `from ${firstSeason} to ${lastSeason}`

  return `${fullName} has completed ${totalCompleted} randonneuring ride${totalCompleted !== 1 ? 's' : ''} (${distanceRange}) with Randonneurs Ontario ${seasonRange}.`
}

export async function generateMetadata({ params }: RiderPageProps) {
  const { slug } = await params
  const [rider, yearResults] = await Promise.all([getRiderBySlug(slug), getRiderResults(slug)])

  if (!rider) {
    return { title: 'Rider Not Found' }
  }

  return {
    title: `${rider.firstName} ${rider.lastName} - Results`,
    description: buildRiderDescription(rider, yearResults),
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
  if (result.teamName) {
    parts.push(`Team: ${result.teamName}`)
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
  const hasAwards = result.awards && result.awards.length > 0

  return (
    <div {...devData('results', result.id)} className="py-3 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {eventLink ? (
            <Link href={eventLink} className="font-medium hover:text-primary transition-colors">
              {result.eventName}
            </Link>
          ) : (
            <span className="font-medium">{result.eventName}</span>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatDate(result.date)} · {result.distanceKm} km
          </p>
          {displayNote && <p className="text-sm text-muted-foreground mt-1">{displayNote}</p>}
          {hasAwards && (
            <div className="mt-1.5">
              <AwardBadgeList awards={result.awards} />
            </div>
          )}
        </div>
        <span
          className={`font-mono text-sm shrink-0 ${
            result.status !== 'finished' ? 'text-muted-foreground' : ''
          }`}
        >
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
        <h2 className="font-serif text-3xl md:text-4xl tracking-tight">{yearData.year}</h2>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
          <p className="text-muted-foreground">
            {yearData.completedCount} completed ride{yearData.completedCount !== 1 ? 's' : ''}{' '}
            &middot; {yearData.totalDistanceKm.toLocaleString()} km
          </p>
          {yearData.seasonAwards && yearData.seasonAwards.length > 0 && (
            <AwardSummary awards={aggregateAwards(yearData.seasonAwards)} />
          )}
        </div>
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
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[130px]">Date</TableHead>
              <TableHead className="w-[40%]">Event</TableHead>
              <TableHead className="w-[100px]">Distance</TableHead>
              <TableHead className="w-[80px]">Time</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {yearData.results.map((result, index) => (
              <TableRow
                key={`${result.date}-${result.eventName}-${index}`}
                {...devData('results', result.id)}
              >
                <TableCell className="text-muted-foreground">{formatDate(result.date)}</TableCell>
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
                <TableCell>{result.distanceKm} km</TableCell>
                <TableCell
                  className={`font-mono ${
                    result.status !== 'finished' ? 'text-muted-foreground' : ''
                  }`}
                >
                  {formatTime(result.time, result.status ?? 'pending')}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {getDisplayNote(result) && (
                      <span className="text-muted-foreground">{getDisplayNote(result)}</span>
                    )}
                    {result.awards && result.awards.length > 0 && (
                      <AwardBadgeList awards={result.awards} />
                    )}
                  </div>
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

  const [rider, yearResults] = await Promise.all([getRiderBySlug(slug), getRiderResults(slug)])

  if (!rider) {
    notFound()
  }

  // Calculate totals across all years
  const totalCompletedRides = yearResults.reduce((sum, y) => sum + y.completedCount, 0)
  const totalDistanceKm = yearResults.reduce((sum, y) => sum + y.totalDistanceKm, 0)

  // Aggregate all awards across all results and season awards (excluding First Brevet from header)
  // Devil Week only counts once per year
  const devilWeekYears = new Set<number>()
  const allAwards = [
    ...yearResults.flatMap((year) =>
      year.results.flatMap((result) =>
        (result.awards ?? []).filter((award) => {
          if (award.title === 'Completed Devil Week') {
            if (devilWeekYears.has(year.year)) return false
            devilWeekYears.add(year.year)
          }
          return true
        })
      )
    ),
    ...yearResults.flatMap((yr) => yr.seasonAwards ?? []),
  ]
  const aggregatedAwards = aggregateAwards(allAwards).filter(
    (award) => award.title !== 'First Brevet'
  )

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
              {yearResults.length} season{yearResults.length !== 1 ? 's' : ''} &middot;{' '}
              {totalCompletedRides} completed ride{totalCompletedRides !== 1 ? 's' : ''} &middot;{' '}
              {totalDistanceKm.toLocaleString()} km total
            </p>
          )}
          {(rider.riderNumber || aggregatedAwards.length > 0) && (
            <AwardSummary
              awards={aggregatedAwards}
              className="mt-4"
              prepend={
                rider.riderNumber ? (
                  <AwardBadge
                    award={{
                      title: `Rider No. ${rider.riderNumber}`,
                      description: `Member No. ${rider.riderNumber}; a lower number reflects longer standing in the club.`,
                    }}
                  />
                ) : undefined
              }
            />
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
