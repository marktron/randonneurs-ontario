/**
 * Input validation and normalization for registration data.
 */

/**
 * Validate that a string looks like a plausible email address.
 * Not exhaustive — just catches obviously malformed input that would
 * bounce at SES. Trims and lowercases before checking.
 */
export function validateEmail(email: string): { valid: boolean; normalized: string } {
  const normalized = email.toLowerCase().trim()
  // Must have exactly one @, something before it, a dot after it, and a TLD
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  return { valid, normalized }
}

/**
 * Build a PostgREST `ilike` pattern for an exact case-insensitive email match.
 * Escapes `_`, `%`, and `\` since they are wildcards in SQL LIKE/ILIKE but are
 * valid characters in email local-parts.
 *
 * Use with `.ilike('email', emailIlikePattern(value))` to match rows whose
 * stored email equals `value` regardless of case.
 */
export function emailIlikePattern(email: string): string {
  return email.replace(/[\\_%]/g, (c) => `\\${c}`)
}

/**
 * Normalize a phone number into a consistent format.
 *
 * - Strips all non-digit characters (except leading +)
 * - 10-digit North American numbers → XXX-XXX-XXXX
 * - 11-digit starting with 1 → XXX-XXX-XXXX (drops the leading 1)
 * - Other formats with 7+ digits → passed through with digits only
 * - Fewer than 7 digits → treated as invalid
 *
 * Returns { valid, formatted } where formatted is the cleaned number.
 */
export function normalizePhone(phone: string): { valid: boolean; formatted: string } {
  const trimmed = phone.trim()
  if (!trimmed) {
    return { valid: false, formatted: '' }
  }

  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')

  if (digits.length < 7) {
    return { valid: false, formatted: trimmed }
  }

  // 10-digit North American: 416-555-1234
  if (digits.length === 10) {
    return {
      valid: true,
      formatted: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
    }
  }

  // 11-digit starting with 1 (North American with country code): drop the 1
  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1)
    return {
      valid: true,
      formatted: `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`,
    }
  }

  // International or other format: keep as-is with the + prefix if it had one
  return {
    valid: true,
    formatted: hasPlus ? `+${digits}` : digits,
  }
}
