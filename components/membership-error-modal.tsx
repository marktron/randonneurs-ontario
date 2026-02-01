'use client'

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface MembershipErrorModalProps {
  open: boolean
  onClose: () => void
  variant: 'no-membership' | 'trial-used'
}

export function MembershipErrorModal({ open, onClose, variant }: MembershipErrorModalProps) {
  const isNoMembership = variant === 'no-membership'

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>
              {isNoMembership ? 'Membership Required' : 'Trial Membership Used'}
            </DialogTitle>
          </div>
          <DialogDescription className="pt-2">
            {isNoMembership ? (
              <>
                To register for events, you need to be an active member of Randonneurs Ontario.
                Please join the club first, then return to complete your registration.
              </>
            ) : (
              <>
                Your trial membership has already been used for another event this season. To
                continue participating, please upgrade to a full membership.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-4">
          <Button asChild>
            <Link href="/membership">
              {isNoMembership ? 'Join Randonneurs Ontario' : 'Upgrade Membership'}
            </Link>
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
