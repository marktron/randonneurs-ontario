import { PageShell } from '@/components/page-shell'
import { RiderDirectory } from '@/components/rider-directory'
import { getAllRiders } from '@/lib/data/riders'

export const revalidate = 3600 // Revalidate every hour

export const metadata = {
  title: 'Rider Directory',
  description: 'Browse all registered riders in Randonneurs Ontario.',
}

export default async function RidersPage() {
  const riders = await getAllRiders()

  return (
    <PageShell>
      <div className="content-container pt-20 md:pt-28">
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl tracking-tight">
          Rider Directory
        </h1>
        <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-2xl">
          Browse all riders who have participated in Randonneurs Ontario events. Select a rider to
          view their complete results history.
        </p>
      </div>

      <div className="content-container py-8 md:py-10">
        <RiderDirectory riders={riders} />
      </div>
    </PageShell>
  )
}
