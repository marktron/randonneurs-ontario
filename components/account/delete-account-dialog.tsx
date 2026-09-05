'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { requestSignInCode, deleteAccount } from '@/lib/actions/account'

export function DeleteAccountDialog({
  email,
  disabled,
}: {
  email: string | null
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sendCode = () => {
    setError(null)
    startTransition(async () => {
      const result = await requestSignInCode(email ?? '')
      if (result.success) setSent(true)
      else setError(result.error || 'Could not send a code.')
    })
  }

  const confirm = () => {
    setError(null)
    startTransition(async () => {
      const result = await deleteAccount(code)
      if (result.success) {
        setOpen(false)
        router.push('/')
        router.refresh()
      } else {
        setError(result.error || 'Could not delete your account.')
      }
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setSent(false)
          setCode('')
          setError(null)
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={disabled}>
          Delete account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes your sign-in and anything you&apos;ve written on your profile. Your ride
            history and results stay in the club&apos;s records. To confirm, we&apos;ll email you a
            fresh code.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {sent ? (
          <div className="space-y-2">
            <Label htmlFor="delete-code">6-digit code</Label>
            <Input
              id="delete-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tracking-[0.3em] tabular-nums"
            />
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={sendCode} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Email me a code
          </Button>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Keep my account</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              confirm()
            }}
            disabled={!sent || code.replace(/\s/g, '').length !== 6 || isPending}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete account
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
