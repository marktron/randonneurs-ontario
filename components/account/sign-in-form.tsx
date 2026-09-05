'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, Loader2 } from 'lucide-react'
import { requestSignInCode, verifySignInCode } from '@/lib/actions/account'
import { getSafeAccountRedirect } from '@/lib/account/redirect'
import { CODE_SENT_MESSAGE } from '@/lib/account/messages'
import { TurnstileField } from '@/components/account/turnstile-field'

type Step = 'email' | 'code'

export function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = getSafeAccountRedirect(searchParams.get('redirect'))

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Bumped on every send so the Turnstile widget remounts. Cloudflare tokens
  // are single-use, so a resend needs a fresh challenge, not the spent token.
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const sendCode = () => {
    setError(null)
    setNotice(null)
    const token = captchaToken ?? undefined
    // Clear before awaiting: the token is spent the moment it is submitted.
    setCaptchaToken(null)
    setAttempt((n) => n + 1)
    startTransition(async () => {
      const result = await requestSignInCode(email, token)
      if (result.success) {
        setNotice(CODE_SENT_MESSAGE)
        setStep('code')
        setCode('')
      } else {
        setError(result.error || 'Something went wrong. Please try again.')
      }
    })
  }

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendCode()
  }

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await verifySignInCode(email, code)
      if (result.success && result.data) {
        // Only the plain "linked" outcome honours ?redirect=; linking steps come first.
        router.push(result.data.next === '/account' ? redirectTo : result.data.next)
        router.refresh()
      } else {
        setError(result.error || 'That code is invalid or expired.')
      }
    })
  }

  return (
    <div className="space-y-4">
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

      {step === 'email' ? (
        <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <p className="text-sm text-muted-foreground">
              Use the address you register for rides with. We&apos;ll email you a 6-digit code.
            </p>
          </div>
          <TurnstileField key={attempt} onToken={setCaptchaToken} />
          <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send code
          </Button>
        </form>
      ) : (
        <form onSubmit={handleCodeSubmit} className="space-y-4" noValidate>
          <p className="text-sm">
            Sent to <span className="font-medium">{email}</span>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="code">6-digit code</Label>
            <Input
              id="code"
              inputMode="numeric"
              pattern="[0-9 ]*"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-lg tracking-[0.3em] tabular-nums"
              required
            />
          </div>
          <TurnstileField key={attempt} onToken={setCaptchaToken} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <Button type="button" variant="ghost" disabled={isPending} onClick={sendCode}>
              Resend code
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setStep('email')}
            >
              Use a different email
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
