'use client'

import { RiderMatchDialog } from '@/components/rider-match-dialog'
import { MembershipErrorModal } from '@/components/membership-error-modal'
import type { RegistrationFormState } from '@/hooks/use-registration-form'

interface RegistrationDialogsProps {
  form: RegistrationFormState
  /** Called with the chosen rider id, or null to create a new rider. */
  onSelectRider: (riderId: string | null) => void
}

/** Fuzzy rider-match dialog + membership error modal, wired to the shared form state. */
export function RegistrationDialogs({ form, onSelectRider }: RegistrationDialogsProps) {
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
    </>
  )
}
