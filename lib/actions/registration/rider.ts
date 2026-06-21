/**
 * Rider resolution for the registration server actions.
 *
 * `findOrCreateRider` matches an incoming submission to an existing rider by
 * email + fuzzy name, returns fuzzy-match candidates when the email is unknown
 * but similar names exist, or creates a new rider. `insertNewRider` owns the
 * slug-collision retry shared with the admin rider-creation path.
 */
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { createSlug } from '@/lib/utils'
import { fuzzyNameScore } from '@/lib/utils/fuzzy-match'
import { emailIlikePattern } from '@/lib/utils/validation'
import { logError } from '@/lib/errors'
import { searchRiderCandidates, type RiderMatchCandidate } from '../rider-match'
import type { RiderInsert, RiderUpdate, RiderIdOnly, RiderMergeInsert } from '@/types/queries'

/**
 * Insert a new rider with a `firstName-lastName` slug, retrying with `-2`,
 * `-3`, etc. on slug-uniqueness collisions. Mirrors the admin path in
 * `lib/actions/riders.ts:createRider`.
 */
export async function insertNewRider(
  insertData: Omit<RiderInsert, 'slug'> & { first_name: string; last_name: string }
): Promise<RiderIdOnly> {
  const baseSlug = createSlug(`${insertData.first_name} ${insertData.last_name}`)
  let slug = baseSlug
  let lastError: { code: string; message: string } | null = null

  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt > 0) {
      slug = `${baseSlug}-${attempt + 1}`
    }

    const { data, error } = await getSupabaseAdmin()
      .from('riders')
      .insert({ ...insertData, slug })
      .select('id')
      .single()

    if (!error && data) {
      return data as RiderIdOnly
    }

    if (error?.code === '23505' && error.message?.includes('riders_slug_key')) {
      lastError = error
      continue
    }

    // Log the full Supabase error (code/details) to Sentry before throwing a
    // clean Error; the server-action boundary converts the throw to ActionResult.
    logError(error, {
      operation: 'insertNewRider',
      context: { slug, supabaseCode: error?.code },
    })
    throw new Error('Failed to create rider profile')
  }

  logError(lastError, {
    operation: 'insertNewRider',
    context: { baseSlug, attempts: 5 },
  })
  throw new Error('Failed to create rider profile after 5 attempts')
}

interface FindOrCreateRiderResult {
  success: true
  riderId: string
}

export interface FindOrCreateRiderMatchResult {
  success: false
  needsRiderMatch: true
  matchCandidates: RiderMatchCandidate[]
}

export type FindOrCreateRiderReturn = FindOrCreateRiderResult | FindOrCreateRiderMatchResult

/**
 * Find an existing rider by email or create a new one.
 * If no rider exists and fuzzy name matches are found, returns match candidates.
 *
 * @param email - Normalized email address
 * @param firstName - First name
 * @param lastName - Last name
 * @param gender - Optional gender (M, F, or X)
 * @param phone - Optional rider cell phone (normalized)
 * @param emergencyContactName - Optional emergency contact name
 * @param emergencyContactPhone - Optional emergency contact phone
 * @returns Either a riderId or match candidates for user selection
 */
export async function findOrCreateRider(
  email: string,
  firstName: string,
  lastName: string,
  gender?: string,
  phone?: string,
  emergencyContactName?: string,
  emergencyContactPhone?: string
): Promise<FindOrCreateRiderReturn> {
  const trimmedFirstName = firstName.trim()
  const trimmedLastName = lastName.trim()
  const normalizedEmail = email.toLowerCase().trim()
  const parsedGender = gender === 'M' || gender === 'F' || gender === 'X' ? gender : null

  // Find existing rider(s) by email — multiple riders can share an email (family members).
  // Match case-insensitively because legacy rows may have mixed-case emails.
  const { data: emailRiders } = await getSupabaseAdmin()
    .from('riders')
    .select('id, first_name, last_name')
    .ilike('email', emailIlikePattern(normalizedEmail))

  if (emailRiders && emailRiders.length > 0) {
    // Score each email-matched rider against the submitted name and pick the best
    type RiderRow = { id: string; first_name: string; last_name: string }
    let bestRider: RiderRow | null = null
    let bestScore = 0

    for (const r of emailRiders as RiderRow[]) {
      const score = fuzzyNameScore(trimmedFirstName, trimmedLastName, r.first_name, r.last_name)
      if (score > bestScore) {
        bestScore = score
        bestRider = r
      }
    }

    if (bestRider && bestScore >= 0.8) {
      // Name matches well — same person, proceed automatically
      // Only log to rider_merges if something actually differs (e.g. slight name variation)
      const nameChanged =
        trimmedFirstName !== bestRider.first_name || trimmedLastName !== bestRider.last_name
      if (nameChanged) {
        const mergeInsert: RiderMergeInsert = {
          rider_id: bestRider.id,
          submitted_first_name: trimmedFirstName,
          submitted_last_name: trimmedLastName,
          submitted_email: normalizedEmail,
          previous_first_name: bestRider.first_name,
          previous_last_name: bestRider.last_name,
          previous_email: normalizedEmail,
          merge_source: 'registration',
        }
        await getSupabaseAdmin().from('rider_merges').insert(mergeInsert)
      }

      // Update supplementary rider info only — never overwrite the name
      const updateData: RiderUpdate = {
        gender: parsedGender,
        phone: phone || null,
        emergency_contact_name: emergencyContactName || null,
        emergency_contact_phone: emergencyContactPhone || null,
      }
      const { error: updateError } = await getSupabaseAdmin()
        .from('riders')
        .update(updateData)
        .eq('id', bestRider.id)

      // Surface (don't throw) — the rider already exists, so registration can
      // proceed; we just log the failed contact-info write so a schema/RLS
      // problem doesn't pass silently.
      if (updateError) {
        logError(updateError, {
          operation: 'findOrCreateRider.updateRider',
          context: { riderId: bestRider.id, supabaseCode: updateError.code },
        })
      }

      return { success: true, riderId: bestRider.id }
    }

    // No good name match among email-matched riders — fall through to fuzzy search
    // so the user can confirm which rider they are (or create a new one)
  }

  // Email not found - search for fuzzy name matches
  const { candidates } = await searchRiderCandidates(
    trimmedFirstName,
    trimmedLastName,
    normalizedEmail
  )

  // If there are potential matches, return them for user selection
  if (candidates.length > 0) {
    return {
      success: false,
      needsRiderMatch: true,
      matchCandidates: candidates,
    }
  }

  // No matches found - create new rider. insertNewRider logs and throws on
  // failure; the throw propagates to the server-action boundary, which
  // converts it to an ActionResult via handleActionError.
  const newRider = await insertNewRider({
    first_name: trimmedFirstName,
    last_name: trimmedLastName,
    email: normalizedEmail,
    gender: parsedGender,
    phone: phone || null,
    emergency_contact_name: emergencyContactName || null,
    emergency_contact_phone: emergencyContactPhone || null,
  })
  return { success: true, riderId: newRider.id }
}
