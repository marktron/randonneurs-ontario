import { getSupabaseAdmin } from '@/lib/supabase-server'
import { emailIlikePattern } from '@/lib/utils/validation'
import { logRiderAction } from '@/lib/audit-log'

export interface LinkCandidate {
  id: string
  firstName: string
  lastName: string
}

export type LinkDecision = 'link' | 'unmatched' | 'choose'

export type LinkOutcome =
  | { kind: 'linked'; riderId: string }
  | { kind: 'unmatched' }
  | { kind: 'choose'; candidates: LinkCandidate[] }

/** Pure decision: 0 → unmatched, 1 → link, many (shared family email) → choose. */
export function decideLinkOutcome(candidates: LinkCandidate[]): LinkDecision {
  if (candidates.length === 0) return 'unmatched'
  if (candidates.length === 1) return 'link'
  return 'choose'
}

/** Riders whose email matches and who are not yet linked to any account. */
export async function findLinkCandidates(email: string): Promise<LinkCandidate[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('riders')
    .select('id, first_name, last_name')
    .ilike('email', emailIlikePattern(email))
    .is('auth_user_id', null)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`findLinkCandidates: ${error.message}`)
  return (data ?? []).map((r) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name }))
}

/**
 * Atomically claim a rider for an auth user. Succeeds only if the rider is
 * still unlinked AND still carries the email, so a concurrent claim, an admin
 * link, or a merge cannot be overwritten. Returns false when nothing was
 * claimed (already linked, email changed, or this user is already linked to
 * another rider — unique violation).
 */
export async function claimRider(input: {
  riderId: string
  userId: string
  email: string
}): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin()
    .from('riders')
    .update({ auth_user_id: input.userId, linked_at: new Date().toISOString() })
    .eq('id', input.riderId)
    .is('auth_user_id', null)
    .ilike('email', emailIlikePattern(input.email))
    .select('id')

  if (error) {
    if (error.code === '23505') return false
    throw new Error(`claimRider: ${error.message}`)
  }
  const linked = (data?.length ?? 0) === 1
  if (linked) {
    await logRiderAction({
      actorUserId: input.userId,
      action: 'account_link',
      entityType: 'rider',
      entityId: input.riderId,
      description: `Rider linked their account (${input.email})`,
    })
  }
  return linked
}

/**
 * Link an account to a rider by verified email. Re-evaluates once if the
 * single candidate is claimed by someone else between lookup and claim.
 */
export async function resolveLink(
  input: { userId: string; email: string },
  attempt = 0
): Promise<LinkOutcome> {
  const candidates = await findLinkCandidates(input.email)
  const decision = decideLinkOutcome(candidates)
  if (decision === 'unmatched') return { kind: 'unmatched' }
  if (decision === 'choose') return { kind: 'choose', candidates }

  const riderId = candidates[0].id
  const linked = await claimRider({ riderId, userId: input.userId, email: input.email })
  if (linked) return { kind: 'linked', riderId }
  if (attempt === 0) return resolveLink(input, 1)
  return { kind: 'unmatched' }
}
