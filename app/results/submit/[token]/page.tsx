import { notFound } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { ResultSubmissionForm } from '@/components/result-submission-form'
import { getResultByToken } from '@/lib/actions/rider-results'

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

  return (
    <PageShell>
      {/* Main Content */}
      <div className="content-container-wide py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          <ResultSubmissionForm token={token} initialData={data} />
        </div>
      </div>
    </PageShell>
  )
}
