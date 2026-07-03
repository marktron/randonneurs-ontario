import { readFileSync } from 'fs'
import { join } from 'path'

/** Deterministic UUIDs for stable upserts and teardown. Shared by setup + teardown. */
export const E2E_IDS = {
  route: '00000000-e2e0-4000-a000-000000000001',
  scheduledEvent: '00000000-e2e0-4000-a000-000000000002',
  completedEvent: '00000000-e2e0-4000-a000-000000000003',
  submittedEvent: '00000000-e2e0-4000-a000-000000000004',
  rider: '00000000-e2e0-4000-a000-000000000005',
  pendingResult: '00000000-e2e0-4000-a000-000000000006',
  submittedResult: '00000000-e2e0-4000-a000-000000000007',
  activeEvent: '00000000-e2e0-4000-a000-000000000008',
  activeRegistration: '00000000-e2e0-4000-a000-000000000009',
  activeControlStart: '00000000-e2e0-4000-a000-00000000000a',
  activeControlFinish: '00000000-e2e0-4000-a000-00000000000b',
}

export interface E2ETestData {
  admin: { email: string; password: string; userId: string }
  scheduledEvent: { id: string; slug: string; date: string }
  completedEvent: { id: string; slug: string }
  submittedEvent: { id: string; slug: string }
  route: { id: string; slug: string }
  rider: { id: string; slug: string }
  pendingResult: { id: string; submissionToken: string }
  submittedResult: { id: string; submissionToken: string }
  /** In-progress brevet with controls for digital brevet card tests. */
  brevetCard: {
    eventId: string
    managementToken: string
    controlLat: number
    controlLng: number
  }
}

const DATA_FILE = join(__dirname, '..', '.e2e-data.json')

/**
 * Read the test data file written by globalSetup.
 * Returns null if the file is missing (globalSetup didn't run or failed).
 */
export function getTestData(): E2ETestData | null {
  try {
    const raw = readFileSync(DATA_FILE, 'utf-8')
    return JSON.parse(raw) as E2ETestData
  } catch {
    return null
  }
}
