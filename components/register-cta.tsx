'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { RegistrationForm } from '@/components/registration-form'
import { FlecheRegistrationForm } from '@/components/fleche-registration-form'
import type { FlecheTeam } from '@/lib/data/events'

interface RegisterCTAProps {
  eventId: string
  isPermanent: boolean
  isFleche?: boolean
  existingTeams?: FlecheTeam[]
}

export function RegisterCTA({ eventId, isPermanent, isFleche, existingTeams }: RegisterCTAProps) {
  const [isOpen, setIsOpen] = useState(false)

  const formContent = isFleche ? (
    <FlecheRegistrationForm eventId={eventId} existingTeams={existingTeams || []} variant="plain" />
  ) : (
    <RegistrationForm eventId={eventId} isPermanent={isPermanent} variant="plain" />
  )

  const sidebarContent = isFleche ? (
    <FlecheRegistrationForm eventId={eventId} existingTeams={existingTeams || []} />
  ) : (
    <RegistrationForm eventId={eventId} isPermanent={isPermanent} />
  )

  return (
    <>
      {/* Mobile CTA Button */}
      <div className="lg:hidden">
        <Button size="lg" className="w-full text-base h-12" onClick={() => setIsOpen(true)}>
          Register for this event
        </Button>
      </div>

      {/* Mobile Drawer (bottom sheet) */}
      <Drawer open={isOpen} onOpenChange={setIsOpen}>
        <DrawerContent className="px-2 pb-safe">
          <DrawerHeader>
            <DrawerTitle className="font-serif text-2xl tracking-tight">Register</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">{formContent}</div>
        </DrawerContent>
      </Drawer>

      {/* Desktop Sidebar Form */}
      <div className="hidden lg:block">
        <div className="lg:sticky lg:top-8">{sidebarContent}</div>
      </div>
    </>
  )
}
