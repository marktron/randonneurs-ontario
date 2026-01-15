import { PageShell } from '@/components/page-shell'
import { Skeleton } from '@/components/ui/skeleton'

function RecordTableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

function RecordSectionSkeleton() {
  return (
    <section className="py-12 md:py-16 border-b border-border">
      <div className="content-container">
        <Skeleton className="h-10 w-64 mb-3" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <div className="mt-8 grid gap-10 lg:grid-cols-2">
          <RecordTableSkeleton />
          <RecordTableSkeleton />
        </div>
      </div>
    </section>
  )
}

export default function RecordsLoading() {
  return (
    <PageShell>
      {/* Header skeleton */}
      <div className="content-container pt-20 md:pt-28">
        <Skeleton className="h-12 md:h-14 w-64" />
        <Skeleton className="mt-6 h-6 w-96 max-w-full" />
      </div>

      {/* Section skeletons */}
      <RecordSectionSkeleton />
      <RecordSectionSkeleton />
      <RecordSectionSkeleton />
      <RecordSectionSkeleton />
      <RecordSectionSkeleton />
      <RecordSectionSkeleton />
    </PageShell>
  )
}
