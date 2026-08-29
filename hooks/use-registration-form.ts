'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { getSavedRegistrationData, saveRegistrationData } from '@/lib/registration-storage'
import type { RegistrationResult } from '@/lib/actions/register'
import type { RiderMatchCandidate } from '@/lib/actions/rider-match'
import { getUpcomingEventsByEventId, type UpcomingEvent } from '@/lib/actions/rider-results'
import {
  DEFAULT_BREVET_CARD_TYPE,
  normalizeBrevetCardType,
  type BrevetCardType,
} from '@/lib/brevet-card'

export type MembershipErrorVariant = 'no-membership' | 'trial-used'

export interface UseRegistrationFormOptions {
  /** When set, fetch up to 3 upcoming events for this event after a successful registration. */
  upcomingEventsEventId?: string
}

/**
 * Shared state, persistence, and result-branching for the registration forms
 * (scheduled events, fleche, permanents). Each form keeps its own submit
 * handler — it calls the right server action with `riderPayload` plus its
 * unique fields, then hands the result to `handleRegistrationResult`.
 */
export function useRegistrationForm(options: UseRegistrationFormOptions = {}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Rider fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [blurredEmail, setBlurredEmail] = useState('')
  // Set once the rider resolves the typo confirmation, so the resubmit gets
  // past the server guard. Cleared whenever they edit the address again.
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  // The server's suggested correction; non-null while the confirm dialog is up.
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)
  const [phone, setPhone] = useState('')
  const [shareRegistration, setShareRegistration] = useState(true)
  const [gender, setGender] = useState<string>('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [homepageUrl, setHomepageUrl] = useState('')
  const [brevetCardType, setBrevetCardType] = useState<BrevetCardType>(DEFAULT_BREVET_CARD_TYPE)

  // UI state
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [membershipErrorVariant, setMembershipErrorVariant] =
    useState<MembershipErrorVariant | null>(null)

  // Fuzzy matching state
  const [matchDialogOpen, setMatchDialogOpen] = useState(false)
  const [matchCandidates, setMatchCandidates] = useState<RiderMatchCandidate[]>([])

  // Upcoming events state
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)

  const errorRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLDivElement>(null)

  // Load saved data on mount
  useEffect(() => {
    const saved = getSavedRegistrationData()
    if (saved) {
      setFirstName(saved.firstName)
      setLastName(saved.lastName)
      setEmail(saved.email)
      setPhone(saved.phone || '')
      setGender(saved.gender)
      setShareRegistration(saved.shareRegistration)
      setEmergencyContactName(saved.emergencyContactName || '')
      setEmergencyContactPhone(saved.emergencyContactPhone || '')
      setBrevetCardType(normalizeBrevetCardType(saved.brevetCardType))
    }
  }, [])

  // Scroll error into view when it appears
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [error])

  // Move focus to success message when registration completes
  useEffect(() => {
    if (success && successRef.current) {
      successRef.current.focus()
    }
  }, [success])

  /** Rider fields shaped for the register server actions. */
  const riderPayload = {
    firstName,
    lastName,
    email,
    phone,
    gender: gender || undefined,
    shareRegistration,
    emergencyContactName,
    emergencyContactPhone,
    emailConfirmed,
    homepageUrl,
    brevetCardType,
  }

  /**
   * Resolve the email-typo confirmation. Returns the address the caller should
   * submit — returned rather than read back off state, since the resubmit fires
   * in the same tick and would otherwise still see the old value.
   */
  function acceptEmailSuggestion(): string {
    const corrected = emailSuggestion ?? email
    setEmail(corrected)
    setBlurredEmail('')
    setEmailConfirmed(true)
    setEmailSuggestion(null)
    return corrected
  }

  /** Keep the address as typed — the rider says the unusual domain is real. */
  function keepTypedEmail(): string {
    setEmailConfirmed(true)
    setEmailSuggestion(null)
    return email
  }

  /**
   * Branch on a register-action result. `onNeedsMatch` fires just before the
   * rider-match dialog opens so the form can stash pending context (notes,
   * pending event id) for the follow-up `completeRegistrationWithRider` call.
   */
  function handleRegistrationResult(
    result: RegistrationResult,
    { onNeedsMatch }: { onNeedsMatch?: (result: RegistrationResult) => void } = {}
  ) {
    if (result.success) {
      // Save form data to localStorage for next registration
      saveRegistrationData({
        firstName,
        lastName,
        email,
        phone,
        gender,
        shareRegistration,
        emergencyContactName,
        emergencyContactPhone,
        brevetCardType,
      })
      setMatchDialogOpen(false)
      setSuccess(true)
      router.refresh()

      if (options.upcomingEventsEventId) {
        setLoadingEvents(true)
        getUpcomingEventsByEventId(options.upcomingEventsEventId, 3)
          .then((eventsResult) => {
            if (eventsResult.success && eventsResult.data) {
              setUpcomingEvents(eventsResult.data)
            }
          })
          .catch(() => {
            // Silently fail - the events are a nice-to-have
          })
          .finally(() => {
            setLoadingEvents(false)
          })
      }
    } else if (result.emailSuggestion) {
      // Ask before writing a likely-undeliverable address. Deliberately not
      // routed through setError — this is a question, not a failure.
      setMatchDialogOpen(false)
      setEmailSuggestion(result.emailSuggestion)
    } else if (result.needsRiderMatch && result.matchCandidates) {
      onNeedsMatch?.(result)
      setMatchCandidates(result.matchCandidates)
      setMatchDialogOpen(true)
    } else if (result.membershipError) {
      setMatchDialogOpen(false)
      setMembershipErrorVariant(result.membershipError)
    } else {
      setMatchDialogOpen(false)
      setError(result.error || 'Registration failed')
    }
  }

  return {
    // transition
    isPending,
    startTransition,
    // rider fields
    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    blurredEmail,
    setBlurredEmail,
    emailConfirmed,
    setEmailConfirmed,
    emailSuggestion,
    setEmailSuggestion,
    phone,
    setPhone,
    gender,
    setGender,
    shareRegistration,
    setShareRegistration,
    emergencyContactName,
    setEmergencyContactName,
    emergencyContactPhone,
    setEmergencyContactPhone,
    homepageUrl,
    setHomepageUrl,
    brevetCardType,
    setBrevetCardType,
    // ui state
    error,
    setError,
    success,
    membershipErrorVariant,
    setMembershipErrorVariant,
    matchDialogOpen,
    setMatchDialogOpen,
    matchCandidates,
    upcomingEvents,
    loadingEvents,
    errorRef,
    successRef,
    // helpers
    riderPayload,
    handleRegistrationResult,
    acceptEmailSuggestion,
    keepTypedEmail,
  }
}

export type RegistrationFormState = ReturnType<typeof useRegistrationForm>
