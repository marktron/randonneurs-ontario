/**
 * Re-send the "Registration Received" confirmation email for a single existing
 * registration. Useful when the original bounced (e.g. the rider mistyped their
 * email) and the address has since been corrected in the database.
 *
 * It reconstructs the same email the live registration flow sends — same CC to
 * the chapter VP, same reply-to, same management link, same membership info —
 * by reusing the shared builders (no new email content here).
 *
 * It does NOT re-run the CCN membership check (that path writes to
 * rider_memberships). Membership info is derived from current DB state:
 *   - registration.status 'registered'            → membershipStatus 'valid'
 *     (+ membershipType from the rider's current-season rider_memberships row)
 *   - any other status (e.g. 'incomplete: membership') → membershipStatus 'none'
 * The rare "trial-used" wording is not reproduced; dry-run prints what it
 * derived so you can confirm before sending.
 *
 * Dry-run by default — prints the exact to/cc/reply-to/subject and a body
 * preview, sends nothing. Add --send to actually dispatch via AWS SES.
 *
 * Usage:
 *   # dry-run against local env
 *   npx tsx scripts/resend-registration-email.ts --registration-id=<uuid>
 *
 *   # actually send (production)
 *   npx tsx scripts/resend-registration-email.ts \
 *     --registration-id=<uuid> --env-file=.env.production.local --send
 */
// MUST be first: loads env (honoring --env-file) before any module that reads
// env at import time, e.g. lib/email/ses.ts which freezes the SES from-address.
import './load-env'

import { createClient } from '@supabase/supabase-js'
import { formatEventType } from '../lib/utils'
import { getCurrentSeason } from '../lib/season'
import {
  formatEventDate,
  formatEventTime,
  buildRouteUrl,
  buildManagementUrl,
} from '../lib/actions/registration/helpers'
import { buildRegistrationConfirmationEmail } from '../lib/email/templates'
import type { RegistrationEmailData } from '../lib/email/templates'
import { getVpEmail } from '../lib/email/vp-emails'
import { fromEmail } from '../lib/email/ses'
import { sendRegistrationConfirmationEmail } from '../lib/email/send-registration-email'

const args = process.argv.slice(2)
const send = args.includes('--send')
const idArg = args.find((a) => a.startsWith('--registration-id='))
const registrationId = idArg?.split('=')[1]

if (!registrationId) {
  console.error('Missing --registration-id=<uuid>')
  process.exit(1)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Supabase returns embedded to-one relations as an object, but the typings
// sometimes widen to an array. Normalize to a single record.
function one<T>(rel: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(rel)) return rel[0]
  return rel ?? undefined
}

async function main() {
  const mode = send ? 'SEND' : 'DRY-RUN'
  console.log(`Resend registration confirmation [${mode}]`)
  console.log(`Registration: ${registrationId}\n`)

  const { data: registration, error: regError } = await supabase
    .from('registrations')
    .select('id, event_id, rider_id, notes, status, management_token, cancelled_at')
    .eq('id', registrationId)
    .maybeSingle()

  if (regError) {
    console.error('Failed to load registration:', regError.message)
    process.exit(1)
  }
  if (!registration) {
    console.error(`No registration found with id ${registrationId}`)
    process.exit(1)
  }
  if (registration.cancelled_at) {
    console.error(
      `Registration is cancelled (cancelled_at=${registration.cancelled_at}). Refusing to resend a confirmation.`
    )
    process.exit(1)
  }
  if (!registration.management_token) {
    console.error('Registration has no management_token — cannot build the management link.')
    process.exit(1)
  }

  const { data: rider, error: riderError } = await supabase
    .from('riders')
    .select('first_name, last_name, email')
    .eq('id', registration.rider_id)
    .maybeSingle()

  if (riderError || !rider) {
    console.error('Failed to load rider:', riderError?.message ?? 'not found')
    process.exit(1)
  }
  if (!rider.email) {
    console.error('Rider has no email address on file.')
    process.exit(1)
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select(
      'name, event_date, start_time, start_location, distance_km, event_type, chapters(slug, name), routes(rwgps_id, rwgps_collection_id)'
    )
    .eq('id', registration.event_id)
    .maybeSingle()

  if (eventError || !event) {
    console.error('Failed to load event:', eventError?.message ?? 'not found')
    process.exit(1)
  }

  const chapter = one(
    event.chapters as { slug: string; name: string } | { slug: string; name: string }[]
  )
  const route = one(
    event.routes as
      | { rwgps_id: string | null; rwgps_collection_id: string | null }
      | { rwgps_id: string | null; rwgps_collection_id: string | null }[]
  )

  // Derive membership fields from current DB state (no CCN re-check).
  let membershipStatus: 'valid' | 'none' | 'trial-used' = 'none'
  let membershipType: string | undefined
  if (registration.status === 'registered') {
    membershipStatus = 'valid'
    const { data: membership } = await supabase
      .from('rider_memberships')
      .select('membership_type')
      .eq('rider_id', registration.rider_id)
      .eq('season', getCurrentSeason())
      .maybeSingle()
    membershipType = membership?.membership_type ?? undefined
  }

  const emailData: RegistrationEmailData = {
    registrantName: `${rider.first_name} ${rider.last_name}`,
    registrantEmail: rider.email,
    eventName: event.name,
    eventDate: formatEventDate(event.event_date),
    eventTime: formatEventTime(event.start_time),
    eventLocation: event.start_location || 'TBD',
    eventDistance: event.distance_km,
    eventType: formatEventType(event.event_type),
    chapterName: chapter?.name || '',
    chapterSlug: chapter?.slug || '',
    routeUrl: buildRouteUrl(route?.rwgps_id, route?.rwgps_collection_id),
    notes: registration.notes || undefined,
    membershipStatus,
    membershipType,
    managementUrl: buildManagementUrl(registration.management_token),
  }

  const { subject, text } = buildRegistrationConfirmationEmail(emailData)
  const vpEmail = getVpEmail(emailData.chapterSlug)

  console.log('---')
  console.log(`From:      ${fromEmail}`)
  console.log(`To:        ${emailData.registrantEmail}`)
  console.log(`Cc:        ${vpEmail || '(none)'}`)
  console.log(`Reply-To:  ${vpEmail || '(none)'}`)
  console.log(`Subject:   ${subject}`)
  console.log(
    `Status:    registration.status=${registration.status} → membershipStatus=${membershipStatus}${membershipType ? ` (${membershipType})` : ''}`
  )
  const override = process.env.SES_OVERRIDE_RECIPIENT
  if (override) {
    console.log(
      `\n⚠  SES_OVERRIDE_RECIPIENT is set: the actual send will go to ${override} (NOT ${emailData.registrantEmail}), and the Cc to the VP will be dropped.`
    )
  }
  console.log('--- text body preview ---')
  console.log(text)
  console.log('---\n')

  if (!send) {
    console.log('DRY-RUN: nothing sent. Re-run with --send to dispatch.')
    return
  }

  if (!process.env.AWS_ACCESS_KEY_ID) {
    console.error(
      'AWS SES is not configured (no AWS_ACCESS_KEY_ID). Nothing would actually send. Aborting.\n' +
        'Point at a real environment, e.g. --env-file=.env.production.local'
    )
    process.exit(1)
  }

  const result = await sendRegistrationConfirmationEmail(emailData)
  if (result.success) {
    console.log(`SENT to ${emailData.registrantEmail}.`)
  } else {
    console.error(`FAILED to send: ${result.error}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
