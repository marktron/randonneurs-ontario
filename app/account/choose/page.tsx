import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAccount } from '@/lib/auth/get-rider'
import { findLinkCandidates } from '@/lib/account/linking'
import { ChooseRiderForm } from '@/components/account/choose-rider-form'

export const metadata: Metadata = {
  title: 'Which rider are you?',
  robots: { index: false, follow: false },
}

export default async function ChooseRiderPage() {
  const account = await getAccount()
  if (!account) redirect('/account/login')
  if (account.rider) redirect('/account')
  const candidates = account.email ? await findLinkCandidates(account.email) : []
  if (candidates.length === 0) redirect('/account/unmatched')

  return (
    <div className="max-w-prose space-y-6">
      <h1 className="font-serif text-4xl tracking-tight">Which rider are you?</h1>
      <p>
        More than one rider registers with <span className="font-medium">{account.email}</span>.
        Pick yourself below.
      </p>
      <ChooseRiderForm candidates={candidates} />
      <p className="text-sm text-muted-foreground">
        The other people on this address will need their own email to get an account. Ask the club
        to update their address, and they can sign in with it afterwards.
      </p>
    </div>
  )
}
