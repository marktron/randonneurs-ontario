export function formatRideName(eventName: string, eventDistance: number | string): string {
  const trimmed = eventName.trim()
  const distance = String(eventDistance)
  if (trimmed.endsWith(` ${distance}`) || trimmed.toLowerCase().endsWith(` ${distance}km`)) {
    return trimmed
  }
  return `${trimmed} ${distance}km`
}

/**
 * Format a time string (HH:MM) for display in 12-hour format.
 * @example formatEventTime("14:30") → "2:30 PM"
 */
export function formatEventTime(timeStr: string | null | undefined): string {
  if (!timeStr) return 'TBD'
  const [hours, minutes] = timeStr.split(':')
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}
