import { PageShell } from '@/components/page-shell'
import { ArrowLink } from '@/components/arrow-link'

export default function NotFound() {
  return (
    <PageShell>
      <div className="mx-auto max-w-3xl px-6 py-32 md:py-44">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight md:text-5xl">Off route</h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          This page doesn&apos;t exist, or it may have moved. Here are some places to get back on
          course.
        </p>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:gap-8">
          <ArrowLink href="/calendar">Browse the calendar</ArrowLink>
          <ArrowLink href="/riders">Rider directory</ArrowLink>
          <ArrowLink href="/">Return home</ArrowLink>
        </div>
      </div>
    </PageShell>
  )
}
