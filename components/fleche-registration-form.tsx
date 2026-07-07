'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle } from 'lucide-react'
import { registerForEvent, completeRegistrationWithRider } from '@/lib/actions/register'
import { HoneypotField } from '@/components/honeypot-field'
import type { FlecheTeam } from '@/lib/data/events'
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

interface FlecheRegistrationFormProps {
  eventId: string
  existingTeams: FlecheTeam[]
  /** "card" shows border/title container, "plain" for use in drawers/modals */
  variant?: 'card' | 'plain'
}

export function FlecheRegistrationForm({
  eventId,
  existingTeams,
  variant = 'card',
}: FlecheRegistrationFormProps) {
  const form = useRegistrationForm({ upcomingEventsEventId: eventId })
  const { isPending, startTransition } = form

  // Team state
  const [teamMode, setTeamMode] = useState<'create' | 'join'>(
    existingTeams.length > 0 ? 'join' : 'create'
  )
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [pendingNotes, setPendingNotes] = useState('')

  const resolvedTeamName = teamMode === 'create' ? newTeamName.trim() : selectedTeam
  const selectedTeamInfo = existingTeams.find((t) => t.teamName === selectedTeam)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    form.setError(null)

    if (!resolvedTeamName) {
      form.setError(teamMode === 'create' ? 'Please enter a team name' : 'Please select a team')
      return
    }

    const formData = new FormData(e.currentTarget)
    const notes = formData.get('notes') as string

    startTransition(async () => {
      const result = await registerForEvent({
        eventId,
        ...form.riderPayload,
        notes: notes || undefined,
        teamName: resolvedTeamName,
        isTeamCaptain: teamMode === 'create',
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
        teamName: resolvedTeamName,
        isTeamCaptain: teamMode === 'create',
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
          Team: {resolvedTeamName}
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

      <form className="space-y-5" onSubmit={handleSubmit}>
        <HoneypotField value={form.homepageUrl} onChange={form.setHomepageUrl} />
        <RegistrationError form={form} />

        {/* Team Section */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium mb-1">
            Team
            <span className="block text-xs text-muted-foreground font-normal mt-1">
              Fleche teams have 3–5 riders. Create a new team or join an existing one.
            </span>
          </legend>

          <div className="flex gap-2" role="group" aria-label="Team option">
            <Button
              type="button"
              variant={teamMode === 'create' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTeamMode('create')}
              disabled={isPending}
              aria-pressed={teamMode === 'create'}
            >
              Create team
            </Button>
            <Button
              type="button"
              variant={teamMode === 'join' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTeamMode('join')}
              disabled={isPending || existingTeams.length === 0}
              aria-pressed={teamMode === 'join'}
            >
              Join team
            </Button>
          </div>

          {teamMode === 'create' ? (
            <div className="space-y-2">
              <Label htmlFor="teamName">Team name</Label>
              <Input
                id="teamName"
                type="text"
                placeholder="Enter your team name"
                required
                disabled={isPending}
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="joinTeam">Select a team</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam} disabled={isPending}>
                <SelectTrigger id="joinTeam" className="w-full">
                  <SelectValue placeholder="Choose a team…" />
                </SelectTrigger>
                <SelectContent>
                  {existingTeams.map((team) => (
                    <SelectItem key={team.teamName} value={team.teamName}>
                      {team.teamName} ({team.memberCount}{' '}
                      {team.memberCount === 1 ? 'rider' : 'riders'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTeamInfo && selectedTeamInfo.memberCount >= 5 && (
                <div
                  role="status"
                  className="flex items-start gap-2 p-2 rounded bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    This team already has {selectedTeamInfo.memberCount} riders. Additional riders
                    register as alternates.
                  </span>
                </div>
              )}
            </div>
          )}
        </fieldset>

        <div className="border-t border-border pt-5" />

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
