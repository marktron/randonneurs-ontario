'use client'

import { RiderMatchDialog } from '@/components/rider-match-dialog'
import { MembershipErrorModal } from '@/components/membership-error-modal'
import { EmailConfirmDialog } from '@/components/registration/email-confirm-dialog'
import type { RegistrationFormState } from '@/hooks/use-registration-form'

interface RegistrationDialogsProps {
  form: RegistrationFormState
  /** Called with the chosen rider id, or null to create a new rider. */
  onSelectRider: (riderId: string | null) => void
  /**
   * Resolve a suspected email typo and resubmit: `true` accepts the suggested
   * address, `false` keeps the one the rider typed.
   */
  onConfirmEmail: (accepted: boolean) => void
}

/** Rider-match dialog, membership error modal, and email-typo confirmation. */
export function RegistrationDialogs({
  form,
  onSelectRider,
  onConfirmEmail,
}: RegistrationDialogsProps) {
  return (
    <>
      <RiderMatchDialog
        open={form.matchDialogOpen}
        onOpenChange={form.setMatchDialogOpen}
        candidates={form.matchCandidates}
        submittedFirstName={form.firstName}
        submittedLastName={form.lastName}
        onSelectRider={onSelectRider}
        onCreateNew={() => onSelectRider(null)}
        isPending={form.isPending}
      />
      <MembershipErrorModal
        open={form.membershipErrorVariant !== null}
        onClose={() => form.setMembershipErrorVariant(null)}
        variant={form.membershipErrorVariant || 'no-membership'}
      />
      <EmailConfirmDialog
        typedEmail={form.email}
        suggestion={form.emailSuggestion}
        onAccept={() => onConfirmEmail(true)}
        onKeep={() => onConfirmEmail(false)}
        isPending={form.isPending}
      />
    </>
  )
}
