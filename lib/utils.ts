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
