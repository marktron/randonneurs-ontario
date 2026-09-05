import { getSupabaseAdmin } from '@/lib/supabase-server'

export interface AccountRide {
  registrationId: string
  managementToken: string
  registrationStatus: string
  eventSlug: string
  eventName: string
  eventDate: string
  eventStatus: string
  distanceKm: number
  chapterName: string
  resultStatus: string | null
}

/** Raw row shape after joining registrations → events → chapters, plus the rider's result status. */
export interface AccountRideRow {
  id: string
  management_token: string
  status: string
  events: {
    slug: string
    name: string
    event_date: string
    status: string
    distance_km: number
    chapters: { name: string } | null
  } | null
  result_status: string | null
}

function toAccountRide(
  row: AccountRideRow & { events: NonNullable<AccountRideRow['events']> }
): AccountRide {
  return {
    registrationId: row.id,
    managementToken: row.management_token,
    registrationStatus: row.status,
    eventSlug: row.events.slug,
    eventName: row.events.name,
    eventDate: row.events.event_date,
    eventStatus: row.events.status,
    distanceKm: row.events.distance_km,
    chapterName: row.events.chapters?.name ?? '',
    resultStatus: row.result_status,
  }
}

/**
 * Upcoming = scheduled, on or after today, and not cancelled by the rider.
 * Everything else is past. Pure so it can be unit-tested.
 */
export function splitRides(
  rows: AccountRideRow[],
  today: string
): { upcoming: AccountRide[]; past: AccountRide[] } {
  const upcoming: AccountRide[] = []
  const past: AccountRide[] = []
  for (const row of rows) {
    if (!row.events) continue
    const ride = toAccountRide({ ...row, events: row.events })
    const isFuture = row.events.event_date >= today && row.events.status === 'scheduled'
    if (isFuture && row.status !== 'cancelled') upcoming.push(ride)
    else if (!isFuture) past.push(ride)
  }
  upcoming.sort((a, b) => a.eventDate.localeCompare(b.eventDate))
  past.sort((a, b) => b.eventDate.localeCompare(a.eventDate))
  return { upcoming, past }
}

/**
 * All registrations for one rider with their capability tokens.
 * Service-role read: tokens are hidden from anon/authenticated. Callers must
 * have resolved `riderId` through requireRider(); never pass a client value.
 */
export async function getAccountRides(
  riderId: string
): Promise<{ upcoming: AccountRide[]; past: AccountRide[] }> {
  const supabase = getSupabaseAdmin()
  const [{ data: registrations, error }, { data: results, error: resultsError }] =
    await Promise.all([
      supabase
        .from('registrations')
        .select(
          `id, event_id, management_token, status,
         events ( slug, name, event_date, status, distance_km, chapters ( name ) )`
        )
        .eq('rider_id', riderId),
      supabase.from('results').select('event_id, status').eq('rider_id', riderId),
    ])
  if (error) throw new Error(`getAccountRides registrations: ${error.message}`)
  if (resultsError) throw new Error(`getAccountRides results: ${resultsError.message}`)

  // results join on event, not registration
  const resultByEvent = new Map((results ?? []).map((r) => [r.event_id, r.status]))
  const rows: AccountRideRow[] = (registrations ?? []).map((reg) => ({
    id: reg.id,
    // Both columns carry a DB default and are practically always populated;
    // the type is nullable only because Postgres doesn't enforce NOT NULL here
    // (a historical bug briefly nulled management_token on some cancellations).
    management_token: reg.management_token ?? '',
    status: reg.status ?? 'registered',
    events: reg.events as AccountRideRow['events'],
    result_status: resultByEvent.get(reg.event_id) ?? null,
  }))

  const today = new Date().toISOString().split('T')[0]
  return splitRides(rows, today)
}
