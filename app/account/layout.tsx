import { PageShell } from '@/components/page-shell'

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">{children}</div>
    </PageShell>
  )
}
