import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccount } from '@/lib/auth/get-rider'
import { findLinkCandidates } from '@/lib/account/linking'
import { getAccountRides } from '@/lib/account/rides'
import { RidesList } from '@/components/account/rides-list'

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } }

export default async function AccountPage() {
  const account = await getAccount()
  if (!account) redirect('/account/login')
  if (!account.rider) {
    const candidates = account.email ? await findLinkCandidates(account.email) : []
    redirect(candidates.length > 0 ? '/account/choose' : '/account/unmatched')
  }

  const rides = await getAccountRides(account.rider.id)

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Hi, {account.rider.first_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as {account.email}
            {account.rider.rider_number && <> · Rider No. {account.rider.rider_number}</>}
          </p>
        </div>
        <nav className="flex gap-4 text-sm">
          <Link href={`/riders/${account.rider.slug}`} className="underline underline-offset-4">
            Public profile
          </Link>
        </nav>
      </header>
      <RidesList upcoming={rides.upcoming} past={rides.past} />
    </div>
  )
}
