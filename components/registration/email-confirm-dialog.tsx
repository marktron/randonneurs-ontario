'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mail } from 'lucide-react'

interface EmailConfirmDialogProps {
  /** The address the rider typed. */
  typedEmail: string
  /** The server's suggested correction; null keeps the dialog closed. */
  suggestion: string | null
  /** Accept the suggestion and resubmit with the corrected address. */
  onAccept: () => void
  /** Keep the typed address and resubmit unchanged. */
  onKeep: () => void
  isPending: boolean
}

/**
 * Blocking confirmation for a suspected email typo, raised by the server-side
 * guard in `validateContactFields`.
 *
 * There is no dismiss path on purpose: an unnoticed typo means the rider never
 * gets their confirmation email and we have no way to reach them, so both exits
 * complete the registration rather than leaving them on an unsubmitted form.
 */
export function EmailConfirmDialog({
  typedEmail,
  suggestion,
  onAccept,
  onKeep,
  isPending,
}: EmailConfirmDialogProps) {
  return (
    <Dialog open={suggestion !== null}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)]/10">
              <Mail className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <DialogTitle>Check your email address</DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            You entered <span className="font-medium text-foreground">{typedEmail}</span>. Did you
            mean <span className="font-medium text-foreground">{suggestion}</span>?
            <br />
            <br />
            Your confirmation and any ride updates go to this address, so it needs to be right.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button onClick={onAccept} disabled={isPending} data-testid="email-confirm-accept">
            {isPending ? 'Registering…' : `Yes, use ${suggestion}`}
          </Button>
          <Button
            variant="outline"
            onClick={onKeep}
            disabled={isPending}
            data-testid="email-confirm-keep"
          >
            No, {typedEmail} is correct
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
