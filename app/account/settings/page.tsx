import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getAccount } from '@/lib/auth/get-rider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChangeEmailForm } from '@/components/account/change-email-form'
import { DeleteAccountDialog } from '@/components/account/delete-account-dialog'
import { SignOutButton } from '@/components/account/sign-out-button'

export const metadata: Metadata = {
  title: 'Account settings',
  robots: { index: false, follow: false },
}

function formatLinkedAt(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function AccountSettingsPage() {
  const account = await getAccount()
  if (!account) redirect('/account/login')

  return (
    <div className="space-y-8">
      <header>
        <Link href="/account" className="text-sm text-muted-foreground hover:text-foreground">
          ← My account
        </Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">Account settings</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Linked rider</CardTitle>
          <CardDescription>The rider record this sign-in belongs to.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {account.rider ? (
            <p>
              <span className="font-medium">
                {account.rider.first_name} {account.rider.last_name}
              </span>
              {account.rider.linked_at && (
                <> · linked on {formatLinkedAt(account.rider.linked_at)}</>
              )}
            </p>
          ) : (
            <p>
              Not linked to a rider yet.{' '}
              <Link href="/account/unmatched" className="underline underline-offset-4">
                Why?
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            You sign in as <span className="font-medium text-foreground">{account.email}</span>.
            {account.isAdmin && ' As an admin, change your email from the admin settings page.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm currentEmail={account.email} disabled={account.isAdmin} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sign out</CardTitle>
          <CardDescription>Signs you out of this browser only.</CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Removes your sign-in. Your results stay in the club&apos;s records.
            {account.isAdmin && ' Admin accounts cannot be deleted here.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog email={account.email} disabled={account.isAdmin} />
        </CardContent>
      </Card>
    </div>
  )
}
