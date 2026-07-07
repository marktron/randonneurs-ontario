'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { registerForEvent, completeRegistrationWithRider } from '@/lib/actions/register'
import { HoneypotField } from '@/components/honeypot-field'
import { useRegistrationForm } from '@/hooks/use-registration-form'
import {
  RegistrationError,
  RiderInfoFields,
  EmergencyContactFields,
  ShareRegistrationCheckbox,
  NotesField,
} from '@/components/registration/registration-fields'
import {
  RegistrationSuccess,
  UpcomingEventsLoading,
  UpcomingEventsSection,
} from '@/components/registration/registration-success'
import { RegistrationDialogs } from '@/components/registration/registration-dialogs'

interface RegistrationFormProps {
  eventId: string
  isPermanent?: boolean
  /** "card" shows border/title container, "plain" for use in drawers/modals */
  variant?: 'card' | 'plain'
}

export function RegistrationForm({
  eventId,
  isPermanent,
  variant = 'card',
}: RegistrationFormProps) {
  const form = useRegistrationForm({
    upcomingEventsEventId: isPermanent ? undefined : eventId,
  })
  const { isPending, startTransition } = form
  const [pendingNotes, setPendingNotes] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    form.setError(null)

    const formData = new FormData(e.currentTarget)
    const notes = formData.get('notes') as string

    startTransition(async () => {
      const result = await registerForEvent({
        eventId,
        ...form.riderPayload,
        notes: notes || undefined,
      })
      form.handleRegistrationResult(result, {
        onNeedsMatch: () => setPendingNotes(notes || ''),
      })
    })
  }

  function handleRiderSelection(riderId: string | null) {
    startTransition(async () => {
      const result = await completeRegistrationWithRider({
        eventId,
        selectedRiderId: riderId,
        ...form.riderPayload,
        notes: pendingNotes || undefined,
      })
      form.handleRegistrationResult(result)
    })
  }

  const wrapperClassName =
    variant === 'card'
      ? 'lg:sticky lg:top-24 rounded-2xl border border-border bg-card p-6 md:p-8'
      : undefined

  if (form.success) {
    return (
      <div className={wrapperClassName}>
        <RegistrationSuccess successRef={form.successRef} title="You're registered!">
          See you at the start line.
        </RegistrationSuccess>

        {form.loadingEvents && <UpcomingEventsLoading />}

        {!form.loadingEvents && form.upcomingEvents.length > 0 && (
          <UpcomingEventsSection title="More Upcoming Events" events={form.upcomingEvents} />
        )}
      </div>
    )
  }

  return (
    <div className={wrapperClassName}>
      {variant === 'card' && <h2 className="font-serif text-2xl tracking-tight mb-6">Register</h2>}

      {isPermanent && (
        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-sm">
          <p className="font-medium mb-1">This is a Permanent</p>
          <p className="text-muted-foreground">
            Join this rider on their scheduled permanent ride, or{' '}
            <Link
              href="/register/permanent"
              className="text-primary hover:underline underline-offset-2"
            >
              schedule your own
            </Link>
            .
          </p>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <HoneypotField value={form.homepageUrl} onChange={form.setHomepageUrl} />
        <RegistrationError form={form} />
        <RiderInfoFields form={form} />
        <EmergencyContactFields form={form} />
        <NotesField disabled={isPending} />
        <ShareRegistrationCheckbox form={form} />

        <Button
          type="submit"
          className="w-full h-12"
          size="lg"
          disabled={isPending}
          data-testid="registration-submit"
        >
          {isPending ? 'Registering…' : 'Register'}
        </Button>
      </form>

      <RegistrationDialogs form={form} onSelectRider={handleRiderSelection} />
    </div>
  )
}
