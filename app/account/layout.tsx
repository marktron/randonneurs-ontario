import { PageShell } from '@/components/page-shell'
import { getAccount } from '@/lib/auth/get-rider'
import { AccountSubnav } from '@/components/account/account-subnav'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // getAccount() fails closed (throws on a DB error) — let that propagate
  // rather than swallowing it and rendering as signed-out.
  const account = await getAccount()

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {account && <AccountSubnav />}
        {children}
      </div>
    </PageShell>
  )
}
