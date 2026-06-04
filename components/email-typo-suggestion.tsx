'use client'

import { suggestEmailCorrection } from '@/lib/utils/email-typo'

interface EmailTypoSuggestionProps {
  /** The email value to check (parent passes the blurred value). */
  email: string
  /** Called with the corrected address when the rider accepts the suggestion. */
  onAccept: (corrected: string) => void
}

export function EmailTypoSuggestion({ email, onAccept }: EmailTypoSuggestionProps) {
  const suggestion = suggestEmailCorrection(email)
  if (!suggestion) {
    return null
  }
  return (
    <p className="text-sm text-muted-foreground" role="status">
      Did you mean{' '}
      <button
        type="button"
        onClick={() => onAccept(suggestion)}
        aria-label={`Use suggested email ${suggestion}`}
        className="text-primary font-medium hover:underline underline-offset-2"
      >
        {suggestion}
      </button>
      ?
    </p>
  )
}
