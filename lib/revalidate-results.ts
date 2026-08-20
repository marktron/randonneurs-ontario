import { revalidatePath, revalidateTag } from 'next/cache'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { getUrlSlugFromDbSlug } from '@/lib/chapter-config'
import type { EventForResultsRevalidation } from '@/types/queries'

/**
 * Revalidate every cache tag/path that surfaces an event's results.
 *
 * Shared between the admin results actions (`lib/actions/results.ts`) and the
 * rider self-service submission (`lib/actions/rider-results.ts`) so the two
 * paths can never drift on which tags a results change must bust. Duplicating
 * this tag list is exactly how rider submissions stopped appearing publicly.
 *
 * This covers the award caches too, because Postgres triggers on `results` can
 * grant or withdraw awards as a side effect of a results change. Anything that
 * derives from a result belongs here, not just the results pages themselves.
 */
export async function revalidateResultsTags(eventId: string) {
  // Get event info including season, chapter, and event_type.
  // event_type matters because permanent/fleche results pages are queried by
  // event_type (not chapter), so they live at /results/{year}/permanent and
  // /results/{year}/fleche regardless of which chapter owns the event row.
  const { data: event } = await getSupabaseAdmin()
    .from('events')
    .select('season, event_type, chapters (slug)')
    .eq('id', eventId)
    .single()

  if (event) {
    const typedEvent = event as EventForResultsRevalidation
    // Revalidate general results cache. { expire: 0 } forces immediate
    // path revalidation; passing a named profile like 'max' only schedules a
    // background refresh and leaves stale pages served in the meantime.
    revalidateTag('results', { expire: 0 })

    // A results change can also change AWARDS, without any award action running:
    // `trg_results_super_randonneur` grants season-scoped Super Randonneur rows
    // from inside Postgres whenever a result is inserted, deleted, or has its
    // status/distance/rider/season updated. Those rows surface on /awards,
    // /records and rider pages, which cache for 24h under these tags and are
    // otherwise only busted by the admin award actions. Without this, an
    // auto-granted SR stays invisible until the TTL lapses.
    revalidateTag('awards', { expire: 0 })
    revalidateTag('records', { expire: 0 })
    revalidateTag('riders', { expire: 0 })

    if (typedEvent.season) {
      // Year-specific cache spans all chapters for the season.
      revalidateTag(`year-${typedEvent.season}`, { expire: 0 })

      if (typedEvent.chapters?.slug) {
        const urlSlug = getUrlSlugFromDbSlug(typedEvent.chapters.slug)
        if (urlSlug) {
          revalidateTag(`chapter-${urlSlug}`, { expire: 0 })
          revalidatePath(`/results/${typedEvent.season}/${urlSlug}`)
        }
      }

      // Permanent/fleche results pages are grouped by event_type, not chapter,
      // so they need their own path revalidation.
      if (typedEvent.event_type === 'permanent' || typedEvent.event_type === 'fleche') {
        revalidateTag(`chapter-${typedEvent.event_type}`, { expire: 0 })
        revalidatePath(`/results/${typedEvent.season}/${typedEvent.event_type}`)
      }
    }
  }
}
