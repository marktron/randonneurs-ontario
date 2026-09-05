import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccount } from '@/lib/auth/get-rider'
import { SignOutButton } from '@/components/account/sign-out-button'

export const metadata: Metadata = { title: 'My account', robots: { index: false, follow: false } }

export default async function UnmatchedPage() {
  const account = await getAccount()
  if (!account) redirect('/account/login')
  if (account.rider) redirect('/account')

  return (
    <div className="max-w-prose space-y-6">
      <h1 className="font-serif text-4xl tracking-tight">
        We couldn&apos;t find your ride history
      </h1>
      <p>
        You&apos;re signed in as <span className="font-medium">{account.email}</span>, but no rider
        on file uses that address.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          If you&apos;ve registered for a ride with a different email, sign out and sign in with
          that address instead.
        </li>
        <li>
          If you&apos;ve never ridden with us, there&apos;s nothing to link yet. Your account will
          connect automatically the first time you register while signed in.
        </li>
        <li>
          Otherwise,{' '}
          <Link href="/contact" className="underline underline-offset-4">
            contact the club
          </Link>{' '}
          and we&apos;ll link it for you.
        </li>
      </ul>
      <SignOutButton />
    </div>
  )
}
