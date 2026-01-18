/**
 * Shared test utilities and helpers
 */

import type { Event } from '@/types/queries'

/**
 * Simple rider list item for testing
 */
interface RiderListItem {
  slug: string
  firstName: string
  lastName: string
}

/**
 * Create a mock event for testing
 */
export function createMockEvent(overrides?: Partial<Event>): Event {
  return {
    id: 'event-1',
    slug: 'test-event',
    name: 'Test Event',
    event_date: '2025-06-15',
    start_time: '08:00',
    start_location: 'Toronto',
    distance_km: 200,
    event_type: 'brevet',
    status: 'scheduled',
    chapter_id: 'chapter-1',
    route_id: null,
    description: null,
    image_url: null,
    collection: null,
    season: 2025,
    created_at: null,
    updated_at: null,
    external_register_url: null,
    registration_opens_at: null,
    registration_closes_at: null,
    ...overrides,
  }
}

/**
 * Create a mock rider for testing
 */
export function createMockRider(overrides?: Partial<RiderListItem>): RiderListItem {
  return {
    slug: 'john-doe',
    firstName: 'John',
    lastName: 'Doe',
    ...overrides,
  }
}

/**
 * Create a mock FormData object for testing
 */
export function createMockFormData(data: Record<string, string | File>): FormData {
  const formData = new FormData()
  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value)
  }
  return formData
}

/**
 * Create a mock File object for testing
 */
export function createMockFile(
  name: string,
  type: string,
  size: number,
  content: string = ''
): File {
  const file = new File([content], name, { type })
  Object.defineProperty(file, 'size', { value: size, writable: false })
  return file
}

/**
 * Wait for a promise to resolve (useful for testing async operations)
 */
export function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Create a mock Supabase error
 */
export function createSupabaseError(code: string, message: string) {
  return {
    code,
    message,
    details: '',
    hint: '',
  }
}
