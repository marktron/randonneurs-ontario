import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { ResultSubmissionForm } from '@/components/result-submission-form'
import { getResultByToken } from '@/lib/actions/rider-results'
import { CalendarIcon, MapPinIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

interface PageProps {
  params: Promise<{ token: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params
  const result = await getResultByToken(token)

  if (!result.success || !result.data) {
    return {
      title: 'Submit Result',
    }
  }

  return {
    title: `Submit Result: ${result.data.eventName} ${result.data.eventDistance}km`,
    description: `Submit your result for the ${result.data.eventName} ${result.data.eventDistance}km event.`,
  }
}

export default async function ResultSubmitPage({ params }: PageProps) {
  const { token } = await params
  const result = await getResultByToken(token)

  if (!result.success || !result.data) {
    notFound()
  }

  const data = result.data
  const eventDate = format(new Date(data.eventDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy')

  return (
    <PageShell>
      {/* Header */}
      <header className="bg-background">
        <div className="content-container-wide pt-6 md:pt-10 pb-4 md:pb-6">
          {/* Kicker / Overline */}
          <div className="flex flex-wrap items-center gap-2 mb-3 md:mb-4">
            <Badge variant="secondary" className="text-xs tracking-wider font-medium">
              Result Submission
            </Badge>
            <span className="text-xs tracking-[0.15em] uppercase text-muted-foreground">
              {data.eventDistance} km · {data.chapterName}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-serif text-3xl md:text-5xl lg:text-6xl tracking-tight mb-4 md:mb-6">
            {data.eventName}
          </h1>

          {/* Meta */}
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span>{eventDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4 text-muted-foreground" />
              <span>{data.riderName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="content-container-wide pt-6 md:pt-8 pb-12 md:pb-16">
        <div className="max-w-xl mx-auto">
          <ResultSubmissionForm token={token} initialData={data} />
        </div>
      </div>
    </PageShell>
  )
}
