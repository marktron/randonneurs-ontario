'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { linkRiderAccount, unlinkRiderAccount } from '@/lib/actions/riders'

interface RiderAccountCardProps {
  rider: { id: string; email: string | null; auth_user_id: string | null; linked_at: string | null }
}

export function RiderAccountCard({ rider }: RiderAccountCardProps) {
  const router = useRouter()
  const [email, setEmail] = useState(rider.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (action: () => Promise<{ success: boolean; error?: string }>, okMessage: string) => {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.success) {
        toast.success(okMessage)
        router.refresh()
      } else {
        setError(result.error || 'Something went wrong')
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          {rider.auth_user_id
            ? `Linked to a sign-in${rider.linked_at ? ` on ${new Date(rider.linked_at).toLocaleDateString('en-CA')}` : ''}.`
            : 'No sign-in linked. Riders link automatically by email; use this when their address changed.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {rider.auth_user_id ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isPending}>
                Unlink account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlink this rider&apos;s account?</AlertDialogTitle>
                <AlertDialogDescription>
                  They stay able to sign in, but will see the &ldquo;we couldn&apos;t find your
                  history&rdquo; page until re-linked by email match or by you.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => run(() => unlinkRiderAccount(rider.id), 'Account unlinked')}
                >
                  Unlink
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(() => linkRiderAccount(rider.id, email), 'Account linked')
            }}
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="link-email">Sign-in email</Label>
              <Input
                id="link-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The rider must have signed in at least once with this address.
              </p>
            </div>
            <Button type="submit" disabled={isPending || !email}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Link account
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
