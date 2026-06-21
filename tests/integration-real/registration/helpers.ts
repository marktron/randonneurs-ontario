import { expect } from 'vitest'
import type { RegistrationData } from '@/lib/actions/register'
import type { PermanentRegistrationData } from '@/lib/actions/register'
import type { CompleteRegistrationData } from '@/lib/actions/register'

export const TORONTO_CHAPTER_ID = 'ad83d0b9-4d25-472b-9d3e-5732730d761c'

export function daysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

export function buildRegistrationData(
  overrides: Partial<RegistrationData> & { eventId: string }
): RegistrationData {
  return {
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    phone: '555-0199',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

export function buildPermanentRegistrationData(
  overrides: Partial<PermanentRegistrationData> & { routeId: string }
): PermanentRegistrationData {
  return {
    eventDate: daysFromNow(30),
    startTime: '08:00',
    direction: 'as_posted',
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    phone: '555-0199',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

export function buildCompleteRegistrationData(
  overrides: Partial<CompleteRegistrationData> & { eventId: string }
): CompleteRegistrationData {
  return {
    selectedRiderId: null,
    firstName: 'Test',
    lastName: 'Rider',
    email: 'test-rider@example.com',
    gender: 'X',
    shareRegistration: false,
    phone: '555-0199',
    emergencyContactName: 'Emergency Contact',
    emergencyContactPhone: '555-0100',
    ...overrides,
  }
}

/**
 * Assert that sendRegistrationConfirmationEmail was called with expected fields.
 * Pass the vi.mocked sendEmail function and an object of fields to check.
 */
export function assertEmailPayload(
  sendEmail: { mock: { calls: unknown[][] } },
  expected: Record<string, unknown>
) {
  expect(sendEmail.mock.calls.length).toBeGreaterThan(0)
  const payload = sendEmail.mock.calls[0][0] as Record<string, unknown>
  for (const [key, value] of Object.entries(expected)) {
    expect(payload[key]).toEqual(value)
  }
}

/**
 * Assert that the email management URL matches the expected pattern.
 */
export function assertManagementUrl(sendEmail: { mock: { calls: unknown[][] } }) {
  expect(sendEmail.mock.calls.length).toBeGreaterThan(0)
  const payload = sendEmail.mock.calls[0][0] as Record<string, unknown>
  expect(payload.managementUrl).toBeDefined()
  // Management URL should contain a UUID-like token
  expect(payload.managementUrl).toMatch(/\/registration\/manage\/[a-f0-9-]+/)
}
