'use client'

import { UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface SelectedRiderCardProps {
  firstName: string
  lastName: string
  email: string | null
  /** Clears the selection and returns the picker to search mode. */
  onClear: () => void
  disabled?: boolean
}

/**
 * Confirms which rider an admin picked in a search-and-select field.
 *
 * Without this the picker showed the chosen rider as a single row styled
 * exactly like the unselected result list, so there was no way to tell a
 * selection had been made. The state is carried by an icon, a "Selected"
 * label, and a tinted surface — never colour alone.
 */
export function SelectedRiderCard({
  firstName,
  lastName,
  email,
  onClear,
  disabled,
}: SelectedRiderCardProps) {
  return (
    <div
      data-testid="selected-rider"
      className="flex items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2"
    >
      <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {firstName} {lastName}
        </p>
        {email && <p className="truncate text-xs text-muted-foreground">{email}</p>}
      </div>
      <Badge variant="secondary" className="shrink-0">
        Selected
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={onClear}
        disabled={disabled}
      >
        Change
      </Button>
    </div>
  )
}
