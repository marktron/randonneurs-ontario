/**
 * Shared types for the registration server actions.
 *
 * Kept in a plain module (no `'use server'`) so both the action entry points
 * (`lib/actions/register.ts`) and the internal step modules can import them
 * without tripping the "use server can only export async functions" rule.
 */
import type { RegistrationEmailData } from '@/lib/email/templates'

/**
 * The portion of a confirmation-email payload a caller assembles up front.
 * `finalizeRegistration` fills in the membership-dependent fields
 * (`membershipStatus`, `membershipType`) and the `managementUrl`.
 */
export type BaseEmailPayload = Omit<
  RegistrationEmailData,
  'membershipStatus' | 'membershipType' | 'managementUrl'
>
