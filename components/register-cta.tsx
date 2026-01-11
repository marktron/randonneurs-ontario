'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RegistrationForm } from '@/components/registration-form'

interface RegisterCTAProps {
  eventId: string
  isPermanent: boolean
}

export function RegisterCTA({ eventId, isPermanent }: RegisterCTAProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      {/* Mobile CTA Button */}
      <div className="lg:hidden">
        <Button
          size="lg"
          className="w-full text-base"
          onClick={() => setIsOpen(true)}
        >
          Register for this event
        </Button>
      </div>

      {/* Mobile Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl tracking-tight">Register</DialogTitle>
          </DialogHeader>
          <RegistrationForm eventId={eventId} isPermanent={isPermanent} variant="plain" />
        </DialogContent>
      </Dialog>

      {/* Desktop Sidebar Form */}
      <div className="hidden lg:block">
        <div className="lg:sticky lg:top-8">
          <RegistrationForm eventId={eventId} isPermanent={isPermanent} />
        </div>
      </div>
    </>
  )
}
