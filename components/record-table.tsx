import Link from 'next/link'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  RiderRecord,
  RiderTimeRecord,
  SeasonRiderRecord,
  ClubSeasonRecord,
  RouteRecord,
  StreakRecord,
} from '@/types/records'

interface RecordTableContainerProps {
  title: string
  children?: React.ReactNode
  emptyMessage?: string
  isEmpty?: boolean
}

function RecordTableContainer({
  title,
  children,
  emptyMessage = 'No records found',
  isEmpty = false,
}: RecordTableContainerProps) {
  const titleId = `record-table-${title.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <div>
      <h3 id={titleId} className="font-medium text-lg mb-4">
        {title}
      </h3>
      {isEmpty ? <p className="text-muted-foreground text-sm py-4">{emptyMessage}</p> : children}
    </div>
  )
}

// Mobile card component for responsive display
function MobileRecordCard({
  rank,
  primary,
  primaryHref,
  secondary,
  value,
  valueLabel,
  highlight = false,
}: {
  rank: number
  primary: string
  primaryHref?: string
  secondary?: string
  value: string | number
  valueLabel: string
  highlight?: boolean
}) {
  const nameClass = highlight ? 'font-semibold hover:underline' : 'font-medium hover:underline'
  const nameClassNoLink = highlight ? 'font-semibold' : 'font-medium'

  return (
    <div className="flex items-start gap-4 py-4 border-b border-border last:border-b-0">
      <span className="text-2xl font-serif text-muted-foreground tabular-nums w-8 shrink-0">
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        {primaryHref ? (
          <Link href={primaryHref} className={nameClass}>
            {primary}
          </Link>
        ) : (
          <span className={nameClassNoLink}>{primary}</span>
        )}
        {secondary && <p className="text-sm text-muted-foreground mt-0.5">{secondary}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className="font-medium tabular-nums">{value}</span>
        <p className="text-xs text-muted-foreground">{valueLabel}</p>
      </div>
    </div>
  )
}

// Rider Records (most completed, highest distance, etc.)
interface RiderRecordTableProps {
  title: string
  records: RiderRecord[]
  valueLabel: string
  formatValue?: (value: number) => string
}

export function RiderRecordTable({
  title,
  records,
  valueLabel,
  formatValue = (v) => v.toLocaleString(),
}: RiderRecordTableProps) {
  if (records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={`${record.riderSlug}-${record.rank}`}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell className={record.rank === 1 ? 'font-semibold' : ''}>
                  {record.riderSlug ? (
                    <Link href={`/riders/${record.riderSlug}`} className="hover:underline">
                      {record.riderName}
                    </Link>
                  ) : (
                    record.riderName
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatValue(record.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={`${record.riderSlug}-${record.rank}`}
            rank={record.rank}
            primary={record.riderName}
            primaryHref={record.riderSlug ? `/riders/${record.riderSlug}` : undefined}
            value={formatValue(record.value)}
            valueLabel={valueLabel}
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}

// Rider Time Records (fastest times for PBP/Granite Anvil)
interface RiderTimeRecordTableProps {
  title: string
  records: RiderTimeRecord[]
}

export function RiderTimeRecordTable({ title, records }: RiderTimeRecordTableProps) {
  if (records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-right">Year</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={`${record.riderSlug}-${record.rank}`}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell className={record.rank === 1 ? 'font-semibold' : ''}>
                  {record.riderSlug ? (
                    <Link href={`/riders/${record.riderSlug}`} className="hover:underline">
                      {record.riderName}
                    </Link>
                  ) : (
                    record.riderName
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{record.time}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {record.eventDate ? new Date(record.eventDate).getFullYear() : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={`${record.riderSlug}-${record.rank}`}
            rank={record.rank}
            primary={record.riderName}
            primaryHref={record.riderSlug ? `/riders/${record.riderSlug}` : undefined}
            secondary={
              record.eventDate ? new Date(record.eventDate).getFullYear().toString() : undefined
            }
            value={record.time}
            valueLabel="Time"
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}

// Season Rider Records (best season for a rider)
interface SeasonRiderRecordTableProps {
  title: string
  records: SeasonRiderRecord[]
  valueLabel: string
  formatValue?: (value: number) => string
}

export function SeasonRiderRecordTable({
  title,
  records,
  valueLabel,
  formatValue = (v) => v.toLocaleString(),
}: SeasonRiderRecordTableProps) {
  if (records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">Season</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={`${record.riderSlug}-${record.season}-${record.rank}`}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell className={record.rank === 1 ? 'font-semibold' : ''}>
                  {record.riderSlug ? (
                    <Link href={`/riders/${record.riderSlug}`} className="hover:underline">
                      {record.riderName}
                    </Link>
                  ) : (
                    record.riderName
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{record.season}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatValue(record.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={`${record.riderSlug}-${record.season}-${record.rank}`}
            rank={record.rank}
            primary={record.riderName}
            primaryHref={record.riderSlug ? `/riders/${record.riderSlug}` : undefined}
            secondary={`Season ${record.season}`}
            value={formatValue(record.value)}
            valueLabel={valueLabel}
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}

// Club Season Records (season rankings)
interface ClubSeasonRecordTableProps {
  title: string
  records: ClubSeasonRecord[]
  valueLabel: string
  formatValue?: (value: number) => string
}

export function ClubSeasonRecordTable({
  title,
  records,
  valueLabel,
  formatValue = (v) => v.toLocaleString(),
}: ClubSeasonRecordTableProps) {
  if (records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Season</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.season}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell
                  className={record.rank === 1 ? 'font-semibold tabular-nums' : 'tabular-nums'}
                >
                  {record.season}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatValue(record.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={record.season}
            rank={record.rank}
            primary={record.season.toString()}
            value={formatValue(record.value)}
            valueLabel={valueLabel}
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}

// Route Records (popular routes)
interface RouteRecordTableProps {
  title: string
  records: RouteRecord[]
  valueLabel: string
}

export function RouteRecordTable({ title, records, valueLabel }: RouteRecordTableProps) {
  if (records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Distance</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={record.routeSlug}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell className={record.rank === 1 ? 'font-semibold' : ''}>
                  <Link href={`/routes/${record.routeSlug}`} className="hover:underline">
                    {record.routeName}
                  </Link>
                  {record.chapterName && (
                    <span className="text-muted-foreground text-sm ml-2 font-normal">
                      ({record.chapterName})
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{record.distanceKm} km</TableCell>
                <TableCell className="text-right tabular-nums">
                  {record.value.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={record.routeSlug}
            rank={record.rank}
            primary={record.routeName}
            primaryHref={`/routes/${record.routeSlug}`}
            secondary={`${record.distanceKm} km${record.chapterName ? ` - ${record.chapterName}` : ''}`}
            value={record.value.toLocaleString()}
            valueLabel={valueLabel}
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}

// Streak Records (longest consecutive seasons)
interface StreakRecordTableProps {
  title: string
  records: StreakRecord[]
  currentSeason: number
  valueLabel: string
}

export function StreakRecordTable({
  title,
  records,
  currentSeason,
  valueLabel,
}: StreakRecordTableProps) {
  if (!records || records.length === 0) {
    return <RecordTableContainer title={title} isEmpty />
  }

  const titleId = `record-table-${title.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <RecordTableContainer title={title}>
      {/* Desktop table */}
      <div className="hidden md:block">
        <Table aria-labelledby={titleId}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">#</TableHead>
              <TableHead>Rider</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => (
              <TableRow key={`${record.riderSlug}-${record.rank}`}>
                <TableCell className="font-serif text-muted-foreground tabular-nums">
                  {record.rank}
                </TableCell>
                <TableCell className={record.rank === 1 ? 'font-semibold' : ''}>
                  {record.riderSlug ? (
                    <Link href={`/riders/${record.riderSlug}`} className="hover:underline">
                      {record.riderName}
                    </Link>
                  ) : (
                    record.riderName
                  )}
                  {record.streakEndSeason < currentSeason ? (
                    <span className="text-muted-foreground ml-2 font-normal">
                      through {record.streakEndSeason}
                    </span>
                  ) : (
                    <span className="sr-only">, streak continues</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{record.streakLength}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        {records.map((record) => (
          <MobileRecordCard
            key={`${record.riderSlug}-${record.rank}`}
            rank={record.rank}
            primary={record.riderName}
            primaryHref={record.riderSlug ? `/riders/${record.riderSlug}` : undefined}
            secondary={
              record.streakEndSeason < currentSeason
                ? `through ${record.streakEndSeason}`
                : undefined
            }
            value={record.streakLength}
            valueLabel={valueLabel}
            highlight={record.rank === 1}
          />
        ))}
      </div>
    </RecordTableContainer>
  )
}
