import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Create a URL-safe slug from a string.
 * - Converts to lowercase
 * - Replaces non-alphanumeric characters with hyphens
 * - Removes leading/trailing hyphens
 * - Truncates to 100 characters
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100)
}

export type EventType = 'Brevet' | 'Populaire' | 'Fleche' | 'Permanent'

/**
 * Format database event_type to display type.
 * Converts lowercase db values to title case display values.
 */
export function formatEventType(eventType: string): EventType {
  const typeMap: Record<string, EventType> = {
    brevet: 'Brevet',
    populaire: 'Populaire',
    fleche: 'Fleche',
    permanent: 'Permanent',
  }
  return typeMap[eventType] || 'Brevet'
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local time.
 * Avoids timezone shift issues when using new Date() with date strings.
 */
export function parseLocalDate(dateStr: string): Date {
  // Append T00:00:00 to interpret as local midnight instead of UTC
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Format a PostgreSQL interval finish time to HH:MM (stripping seconds).
 * Handles formats like "10:30:00", "105:30:00", or "4 days 09:30:00".
 */
export function formatFinishTime(interval: string | null): string {
  if (!interval) return ''

  const match = interval.match(/(?:(\d+)\s*days?\s*)?(\d+):(\d{2})(?::\d{2})?/)
  if (!match) return interval

  const days = parseInt(match[1] || '0', 10)
  const hours = parseInt(match[2], 10) + (days * 24)
  const minutes = match[3]

  return `${hours}:${minutes}`
}

/**
 * Format a result status for display.
 * Returns null for 'finished' (no badge needed), uppercase for others.
 */
export function formatStatus(status: string): string | null {
  const statusMap: Record<string, string> = {
    'dnf': 'DNF',
    'dns': 'DNS',
    'otl': 'OTL',
    'dq': 'DQ',
  }
  if (status === 'finished') return null
  return statusMap[status] || status.toUpperCase()
}
