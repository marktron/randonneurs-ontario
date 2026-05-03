import { notFound, redirect } from 'next/navigation'
import { PageShell } from '@/components/page-shell'
import { RegistrationManage } from '@/components/registration-manage'
import { createEarlyResult, getRegistrationByToken } from '@/lib/actions/manage-registration'
import { createTorontoDate } from '@/lib/brmTimes'
import { formatRideName } from '@/lib/events/format'
import { parseISO } from 'date-fns'

interface PageProps {
  params: Promise<{ token: string }>
}

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: PageProps) {
  const { token } = await params
  const data = await getRegistrationByToken(token)

  if (!data) {
    return { title: 'Registration Not Found' }
  }

  return {
    title: `Manage Registration: ${formatRideName(data.event.name, data.event.distance_km)}`,
  }
}

export default async function RegistrationManagePage({ params }: PageProps) {
  const { token } = await params
  const data = await getRegistrationByToken(token)

  if (!data) {
    notFound()
  }

  // If a result exists with this token as submission_token, redirect to submission page
  if (data.existingResultToken) {
    redirect(`/results/submit/${data.existingResultToken}`)
  }

  // Compute whether event has started (server-side)
  let eventStarted = false
  if (data.event.start_time) {
    const eventDate = parseISO(data.event.event_date)
    const [hours, minutes] = data.event.start_time.split(':').map(Number)
    const eventStart = createTorontoDate(
      eventDate.getFullYear(),
      eventDate.getMonth(),
      eventDate.getDate(),
      hours,
      minutes
    )
    eventStarted = new Date() >= eventStart
  }

  // Once the event has started, riders coming here from the brevet card QR
  // (or registration email) want to submit results — create the pending result
  // on demand and forward them to the submission page.
  if (eventStarted && data.registration.status === 'registered') {
    const result = await createEarlyResult(token)
    if (result.success && result.submissionToken) {
      redirect(`/results/submit/${result.submissionToken}`)
    }
  }

  return (
    <PageShell>
      <div className="content-container-wide py-8 md:py-12">
        <div className="max-w-2xl mx-auto">
          <RegistrationManage
            token={token}
            registration={data.registration}
            event={data.event}
            rider={data.rider}
            eventStarted={eventStarted}
          />
        </div>
      </div>
    </PageShell>
  )
}
