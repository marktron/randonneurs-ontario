'use client'

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmailTypoSuggestion } from '@/components/email-typo-suggestion'
import type { RegistrationFormState } from '@/hooks/use-registration-form'
import type { BrevetCardType } from '@/lib/brevet-card'

interface FormSectionProps {
  form: RegistrationFormState
}

/** Inline error banner shown above the form fields. */
export function RegistrationError({ form }: FormSectionProps) {
  // Destructured before use: the react-hooks/refs lint rule flags direct
  // `form.errorRef` / `form.error` member access in JSX as a ref read during
  // render (a false positive here — `form` mixes a ref with plain state).
  const { errorRef, error } = form
  if (!error) return null
  return (
    <div
      ref={errorRef}
      role="alert"
      className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
      data-testid="registration-error"
    >
      {error}
    </div>
  )
}

/** Name grid, email (with typo suggestion), cell phone, and gender select. */
export function RiderInfoFields({ form }: FormSectionProps) {
  const { isPending } = form
  return (
    <>
      {/* Name */}
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder="First"
            required
            autoComplete="given-name"
            disabled={isPending}
            value={form.firstName}
            onChange={(e) => form.setFirstName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder="Last"
            required
            autoComplete="family-name"
            disabled={isPending}
            value={form.lastName}
            onChange={(e) => form.setLastName(e.target.value)}
          />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
          disabled={isPending}
          value={form.email}
          onChange={(e) => {
            form.setEmail(e.target.value)
            form.setBlurredEmail('')
            // A previous confirmation only covered the address it was given —
            // once the rider edits it, the typo guard has to run again.
            form.setEmailConfirmed(false)
          }}
          onBlur={(e) => form.setBlurredEmail(e.target.value)}
        />
        <EmailTypoSuggestion
          email={form.blurredEmail}
          onAccept={(corrected) => {
            form.setEmail(corrected)
            form.setBlurredEmail('')
          }}
        />
      </div>

      {/* Cell phone */}
      <div className="space-y-2">
        <Label htmlFor="phone">Cell phone</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="Phone number"
          required
          autoComplete="tel"
          disabled={isPending}
          value={form.phone}
          onChange={(e) => form.setPhone(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Used only for urgent ride-day updates, such as weather or safety-related changes.
        </p>
      </div>

      {/* Gender */}
      <div className="space-y-2">
        <Label htmlFor="gender">
          Gender
          <span className="text-muted-foreground font-normal ml-1">(optional)</span>
        </Label>
        <Select
          key={form.gender || 'empty'}
          value={form.gender}
          onValueChange={form.setGender}
          disabled={isPending}
        >
          <SelectTrigger id="gender" className="w-full">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M">Male</SelectItem>
            <SelectItem value="F">Female</SelectItem>
            <SelectItem value="X">Non-binary / Other</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Audax Club Parisien uses this for ridership statistics.
        </p>
      </div>
    </>
  )
}

/** Emergency contact name/phone in a highlighted fieldset. */
export function EmergencyContactFields({ form }: FormSectionProps) {
  const { isPending } = form
  return (
    <fieldset className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
      <legend className="text-sm font-medium">Emergency contact</legend>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="emergencyContactName">Name</Label>
          <Input
            id="emergencyContactName"
            name="emergencyContactName"
            type="text"
            placeholder="Name"
            required
            autoComplete="off"
            disabled={isPending}
            value={form.emergencyContactName}
            onChange={(e) => form.setEmergencyContactName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergencyContactPhone">Phone</Label>
          <Input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            inputMode="tel"
            placeholder="Phone number"
            required
            autoComplete="off"
            disabled={isPending}
            value={form.emergencyContactPhone}
            onChange={(e) => form.setEmergencyContactPhone(e.target.value)}
          />
        </div>
      </div>
    </fieldset>
  )
}

/** "Appear on the registered riders list" checkbox with clickable label. */
export function ShareRegistrationCheckbox({ form }: FormSectionProps) {
  const { isPending } = form
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        checked={form.shareRegistration}
        onCheckedChange={(checked) => form.setShareRegistration(checked === true)}
        className="mt-1"
        disabled={isPending}
        aria-label="Appear on the registered riders list"
      />
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- checkbox is keyboard-accessible via aria-label */}
      <div
        className="space-y-1 cursor-pointer"
        onClick={() => {
          if (!isPending) form.setShareRegistration(!form.shareRegistration)
        }}
      >
        <span className="text-sm font-medium leading-none">
          Appear on the registered riders list
        </span>
        <p className="text-xs text-muted-foreground">
          Allow other riders to see you&apos;re signed up. Results always include all riders.
        </p>
      </div>
    </div>
  )
}

/** Paper vs. digital brevet card choice, radio-styled like a two-option select. */
export function BrevetCardTypeField({ form }: FormSectionProps) {
  const { isPending } = form
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Brevet card</legend>
      <p className="text-xs text-muted-foreground -mt-2">
        This only tells the organizer what to prepare at the start.
      </p>
      <RadioGroup
        value={form.brevetCardType}
        onValueChange={(value) => form.setBrevetCardType(value as BrevetCardType)}
        disabled={isPending}
        className="gap-3"
      >
        <div className="flex items-start gap-3">
          <RadioGroupItem value="paper" id="brevetCardType-paper" className="mt-1" />
          <Label
            htmlFor="brevetCardType-paper"
            className="flex-col items-start gap-1 font-normal cursor-pointer"
          >
            <span className="block text-sm font-medium leading-none text-foreground">
              Paper brevet card
            </span>
            <span className="block text-xs text-muted-foreground">
              Pick up a printed card at the start and collect stamps as usual.
            </span>
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <RadioGroupItem value="digital" id="brevetCardType-digital" className="mt-1" />
          <Label
            htmlFor="brevetCardType-digital"
            className="flex-col items-start gap-1 font-normal cursor-pointer"
          >
            <span className="block text-sm font-medium leading-none text-foreground">
              Digital brevet card
            </span>
            <span className="block text-xs text-muted-foreground">
              Check in at each control from your phone. You can still ask for a paper card at the
              start.
            </span>
          </Label>
        </div>
      </RadioGroup>
    </fieldset>
  )
}

interface NotesFieldProps {
  disabled: boolean
  /** Controlled usage (permanent form); omit both to read via FormData on submit. */
  value?: string
  onChange?: (value: string) => void
}

/** "Notes for the organizer" textarea. */
export function NotesField({ disabled, value, onChange }: NotesFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="notes">
        Notes for the organizer
        <span className="text-muted-foreground font-normal ml-1">(optional)</span>
      </Label>
      <Textarea
        id="notes"
        name="notes"
        placeholder="Any special requirements or information…"
        rows={3}
        disabled={disabled}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
    </div>
  )
}
