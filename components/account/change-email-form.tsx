'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { changeAccountEmail } from '@/lib/actions/account'

export function ChangeEmailForm({
  currentEmail,
  disabled,
}: {
  currentEmail: string | null
  disabled?: boolean
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await changeAccountEmail(email)
      if (result.success) {
        setNotice(
          `Check both ${currentEmail ?? 'your current address'} and ${email.trim()} — confirm from each to finish the change.`
        )
        setEmail('')
      } else {
        setError(result.error || 'Could not start the email change.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="new-email">New email</Label>
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={disabled}
          required
        />
      </div>
      <Button type="submit" disabled={disabled || isPending || !email}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Change email
      </Button>
    </form>
  )
}
