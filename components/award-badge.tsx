import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const colorClassesMap = {
  'Completed Devil Week': 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200',
  'First Brevet': 'bg-zinc-200 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200',
  'Super Randonneur': 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200',
  'Ontario Rover': 'bg-lime-200 dark:bg-lime-800 text-lime-800 dark:text-lime-200',
  'Ontario Explorer': 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200',
  'O-5000': 'bg-cyan-200 dark:bg-cyan-800 text-cyan-800 dark:text-cyan-200',
  'O-12': 'bg-violet-200 dark:bg-violet-800 text-violet-800 dark:text-violet-200',
  'Paris-Brest-Paris': 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200',
  'Granite Anvil': 'bg-fuchsia-200 dark:bg-fuchsia-800 text-fuchsia-800 dark:text-fuchsia-200',
  'Course Record': 'bg-linear-to-tr from-amber-600 to-yellow-500 text-white dark:text-amber-950',
  default: 'bg-zinc-300 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200',
} as const

const defaultDescriptions: Record<string, string> = {
  'Completed Devil Week': "Rode a 200, 300, 400, and 600km brevet during the club's Devil Week.",
  'First Brevet': 'Rode their first brevet with Randonneurs Ontario.',
  'Super Randonneur': 'Completed a 200, 300, 400, and 600 km brevet in the same season.',
  'Ontario Rover': 'Accumulate 1200 km of Permanents with at least two being 300 km or more.',
  'Ontario Explorer': 'Completed at least one brevet in every chapter during a calendar year.',
  'O-5000': 'Completed at least 5000 km of sanctioned events in a calendar year.',
  'O-12': 'Completed a club-sanctioned 200+ km event for 12 consecutive months.',
  'Paris-Brest-Paris': 'Completed Paris-Brest-Paris',
  'Course Record': 'Fastest recorded time for this route',
  'Granite Anvil': 'Completed the Granite Anvil 1200km brevet',
}

export interface Award {
  title: string
  description?: string | null
}

interface AwardBadgeProps {
  award: Award
  className?: string
}

function getColorClasses(title: string): string {
  return colorClassesMap[title as keyof typeof colorClassesMap] || colorClassesMap.default
}

function getDescription(award: Award): string {
  return award.description || defaultDescriptions[award.title] || ''
}

export function AwardBadge({ award, className }: AwardBadgeProps) {
  const description = getDescription(award)

  const badge = (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        getColorClasses(award.title),
        className
      )}
    >
      {award.title}
    </span>
  )

  if (!description) {
    return badge
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

interface AwardBadgeListProps {
  awards: Award[]
  className?: string
}

export function AwardBadgeList({ awards, className }: AwardBadgeListProps) {
  if (awards.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {awards.map((award, index) => (
        <AwardBadge key={`${award.title}-${index}`} award={award} />
      ))}
    </div>
  )
}

export interface AwardCount {
  title: string
  description?: string | null
  count: number
}

interface AwardSummaryProps {
  awards: AwardCount[]
  className?: string
}

export function AwardSummary({ awards, className }: AwardSummaryProps) {
  if (awards.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {awards.map((award) => {
        const description = getDescription(award)

        const badge = (
          <span
            key={award.title}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              getColorClasses(award.title)
            )}
          >
            {award.title}
            {award.count > 1 && <span className="opacity-75">× {award.count}</span>}
          </span>
        )

        if (!description) {
          return badge
        }

        return (
          <TooltipProvider key={award.title}>
            <Tooltip>
              <TooltipTrigger asChild>{badge}</TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">{description}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )
      })}
    </div>
  )
}

/**
 * Aggregate awards from results into counts by title
 */
export function aggregateAwards(awards: Award[]): AwardCount[] {
  const countMap = new Map<string, { count: number; description: string | null }>()

  for (const award of awards) {
    const existing = countMap.get(award.title)
    if (existing) {
      existing.count++
    } else {
      countMap.set(award.title, {
        count: 1,
        description: award.description ?? null,
      })
    }
  }

  return Array.from(countMap.entries())
    .map(([title, { count, description }]) => ({
      title,
      description,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
}
