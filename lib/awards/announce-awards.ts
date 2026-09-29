/**
 * Slack announcements for newly assigned awards.
 *
 * Awards land in `rider_awards` (season-scoped) and `result_awards`
 * (result-scoped) from Postgres triggers and from admin server actions, so the
 * app never sees most writes. Both tables carry an `announced_at` outbox column
 * (migration 20260923120000): NULL means "not yet posted". The hourly cron
 * (app/api/cron/announce-awards) calls `announceNewAwards()`, which posts one
 * grouped digest to the Slack Incoming Webhook and then stamps every fetched
 * row. Course Record is computed, not stored, so it never appears here.
 *
 * Post-then-stamp, not claim-then-send. The card-reminder sweep claims each row
 * before emailing because a duplicate email to a rider is worse than a missed
 * one. Here the trade runs the other way: a duplicate Slack post is visible,
 * rare (it needs a stamp to fail right after a successful post), and easy to
 * shrug off, while a silently lost announcement is exactly the failure this
 * feature exists to prevent. So a Slack failure leaves the rows unstamped for
 * the next hourly run and throws, which turns the Actions job red.
 *
 * Hidden riders (`riders.hidden`) never appear in Slack. Their rows are still
 * fetched and stamped, silently; filtering them in the query would leave them
 * at the head of every batch forever.
 *
 * Result-scoped awards (`result_awards`) additionally require their slug to
 * be in `ANNOUNCED_RESULT_AWARD_SLUGS`. Season-scoped awards (`rider_awards`)
 * are unaffected and always announce. Rows for an unlisted result-award slug
 * are fetched and stamped silently, exactly like hidden riders, so they never
 * filter out of the query itself.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-server'
import { logError } from '@/lib/errors'
import { SITE_URL } from '@/lib/site-url'
import type { Database } from '@/types/supabase'

/**
 * Most rows one run fetches per table. Anything past the cap is still NULL and
 * goes out next hour, so nothing is dropped. Only a bulk backfill would come
 * near this.
 */
export const ANNOUNCE_BATCH_LIMIT = 200

/** Slack truncates very long messages; stay well under its limits. */
export const SLACK_MESSAGE_MAX_CHARS = 3000

/**
 * Result-award slugs that post to Slack. Decided 2026-09-23: of the
 * result-scoped awards, only O-12 announces; First Brevet, Completed Devil
 * Week, Paris-Brest-Paris, Granite Anvil and any future result-scoped award
 * stay off the channel. Season-scoped awards are unaffected. Keep this an
 * allowlist, not a query filter: unlisted rows still get fetched and stamped
 * (see the module header), so `announced_at IS NULL` keeps meaning "pending",
 * the partial index stays small, and adding a slug here later doesn't dump its
 * historical backlog into Slack.
 */
export const ANNOUNCED_RESULT_AWARD_SLUGS = new Set(['o-12'])

const HEADER = ':trophy: New awards'

/** Ids per `.in()` filter when stamping, to keep request URLs short. */
const STAMP_CHUNK = 100

interface EmbeddedRider {
  id: string
  slug: string
  first_name: string
  last_name: string
  hidden: boolean
}

interface EmbeddedAward {
  slug: string
  title: string
}

export interface UnannouncedRiderAwardRow {
  id: string
  season: number
  created_at: string | null
  riders: EmbeddedRider
  awards: EmbeddedAward
}

export interface UnannouncedResultAwardRow {
  result_id: string
  award_id: string
  awards: EmbeddedAward
  results: {
    id: string
    season: number
    riders: EmbeddedRider
    events: { name: string; event_date: string }
  }
}

const RIDER_AWARD_SELECT =
  'id, season, created_at, ' +
  'riders!inner(id, slug, first_name, last_name, hidden), ' +
  'awards!inner(slug, title)'

const RESULT_AWARD_SELECT =
  'result_id, award_id, ' +
  'awards!inner(slug, title), ' +
  'results!inner(id, season, ' +
  'riders!inner(id, slug, first_name, last_name, hidden), ' +
  'events!inner(name, event_date))'

/**
 * Unannounced season awards, oldest first. Exported so the real-DB suite runs
 * the exact select the cron runs: nested embeds are where mocks lie.
 */
export function fetchUnannouncedRiderAwards(supabase: SupabaseClient<Database>) {
  return supabase
    .from('rider_awards')
    .select(RIDER_AWARD_SELECT)
    .is('announced_at', null)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(ANNOUNCE_BATCH_LIMIT)
}

/**
 * Unannounced result awards. `result_awards` has no timestamp column, so the
 * order is just a stable one by key.
 */
export function fetchUnannouncedResultAwards(supabase: SupabaseClient<Database>) {
  return supabase
    .from('result_awards')
    .select(RESULT_AWARD_SELECT)
    .is('announced_at', null)
    .order('result_id', { ascending: true })
    .order('award_id', { ascending: true })
    .limit(ANNOUNCE_BATCH_LIMIT)
}

export type AnnouncementStamp =
  | { table: 'rider_awards'; id: string }
  | { table: 'result_awards'; resultId: string; awardId: string }

export interface AwardAnnouncement {
  kind: 'season' | 'result'
  riderId: string
  riderSlug: string
  riderName: string
  hidden: boolean
  awardSlug: string
  awardTitle: string
  season: number | null
  /** Result awards only, e.g. "Niagara 200 (Jun 15, 2026)". */
  eventLabel?: string
  stamp: AnnouncementStamp
}

export interface AnnounceResult {
  configured: boolean
  /** Rows fetched across both tables (all of them get stamped). */
  fetched: number
  /** Rows that appeared in Slack. */
  announced: number
  /**
   * Rows for hidden riders, stamped without posting. Precedence: a hidden
   * rider's row counts here even if it's also an unlisted result award — a
   * row is either hiddenSkipped or unlistedSkipped, never both.
   */
  hiddenSkipped: number
  /**
   * Result-award rows outside `ANNOUNCED_RESULT_AWARD_SLUGS`, stamped without
   * posting. Excludes hidden riders' rows (those count as hiddenSkipped).
   */
  unlistedSkipped: number
  /** Slack messages posted. */
  posted: number
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-06-15" -> "Jun 15, 2026", parsed by hand so no timezone can shift it. */
function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return isoDate
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** Slack mrkdwn control characters. */
function escapeMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function riderName(rider: EmbeddedRider): string {
  return `${rider.first_name} ${rider.last_name}`.trim()
}

/**
 * Whether an award should be posted to Slack. Hidden riders are checked
 * first: a hidden rider's row is never announceable, regardless of scope or
 * slug, so it never counts as an unlisted skip. Result awards additionally
 * require an allowlisted slug; season awards always pass.
 */
export function isAnnounceable(item: AwardAnnouncement): boolean {
  if (item.hidden) return false
  if (item.kind === 'result' && !ANNOUNCED_RESULT_AWARD_SLUGS.has(item.awardSlug)) return false
  return true
}

export function normalizeRiderAward(row: UnannouncedRiderAwardRow): AwardAnnouncement {
  return {
    kind: 'season',
    riderId: row.riders.id,
    riderSlug: row.riders.slug,
    riderName: riderName(row.riders),
    hidden: row.riders.hidden,
    awardSlug: row.awards.slug,
    awardTitle: row.awards.title,
    season: row.season,
    stamp: { table: 'rider_awards', id: row.id },
  }
}

export function normalizeResultAward(row: UnannouncedResultAwardRow): AwardAnnouncement {
  const { riders, events } = row.results
  return {
    kind: 'result',
    riderId: riders.id,
    riderSlug: riders.slug,
    riderName: riderName(riders),
    hidden: riders.hidden,
    awardSlug: row.awards.slug,
    awardTitle: row.awards.title,
    season: row.results.season,
    eventLabel: `${events.name} (${formatEventDate(events.event_date)})`,
    stamp: { table: 'result_awards', resultId: row.result_id, awardId: row.award_id },
  }
}

function bulletFor(item: AwardAnnouncement): string {
  const link = `<${SITE_URL}/riders/${item.riderSlug}|${escapeMrkdwn(item.riderName)}>`
  return item.eventLabel ? `• ${link} — ${escapeMrkdwn(item.eventLabel)}` : `• ${link}`
}

function headingFor(item: AwardAnnouncement): string {
  const title =
    item.kind === 'season' && item.season !== null
      ? `${item.awardTitle} ${item.season}`
      : item.awardTitle
  return `*${escapeMrkdwn(title)}*`
}

/**
 * Turns announcements into Slack message texts. Pure.
 *
 * Items that aren't announceable are dropped (see `isAnnounceable`): hidden
 * riders, and result awards whose slug isn't in `ANNOUNCED_RESULT_AWARD_SLUGS`.
 * Groups are keyed by heading (award title, plus the
 * season for season awards) and keep first-seen order. Messages are packed up
 * to SLACK_MESSAGE_MAX_CHARS, breaking only between groups; a group too big to
 * fit in one message on its own is split between bullets and its heading is
 * repeated at the top of each continuation.
 */
export function buildAwardsMessages(items: AwardAnnouncement[]): string[] {
  const groups = new Map<string, string[]>()
  for (const item of items) {
    if (!isAnnounceable(item)) continue
    const heading = headingFor(item)
    const bullets = groups.get(heading) ?? []
    bullets.push(bulletFor(item))
    groups.set(heading, bullets)
  }
  if (groups.size === 0) return []

  const messages: string[] = []
  let current = HEADER
  let currentHasGroup = false
  const join = (base: string, sep: string, add: string) => (base ? base + sep + add : add)
  const fits = (text: string) => text.length <= SLACK_MESSAGE_MAX_CHARS

  for (const [heading, bullets] of groups) {
    const block = [heading, ...bullets].join('\n')

    if (fits(join(current, '\n\n', block))) {
      current = join(current, '\n\n', block)
      currentHasGroup = true
      continue
    }

    // Doesn't fit beside what's there: start a fresh message for this group.
    if (currentHasGroup) {
      messages.push(current)
      current = ''
      currentHasGroup = false
    }

    if (fits(join(current, '\n\n', block))) {
      current = join(current, '\n\n', block)
      currentHasGroup = true
      continue
    }

    // Oversized on its own: split between bullets, repeating the heading.
    let part = join(current, '\n\n', heading)
    let partHasBullet = false
    for (const bullet of bullets) {
      const next = `${part}\n${bullet}`
      if (fits(next) || !partHasBullet) {
        part = next
        partHasBullet = true
        continue
      }
      messages.push(part)
      part = `${heading}\n${bullet}`
    }
    current = part
    currentHasGroup = true
  }

  if (currentHasGroup) messages.push(current)
  return messages
}

export function isSlackAwardsConfigured(): boolean {
  return Boolean(process.env.SLACK_AWARDS_WEBHOOK_URL)
}

/**
 * POSTs a message to a Slack Incoming Webhook. Throws on non-2xx. Unfurling is
 * off so each rider link doesn't drag a profile-page preview into the channel.
 */
export async function postSlackMessage(webhookUrl: string, text: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    // Never include the webhook URL: it is the secret.
    throw new Error(`Slack webhook responded ${response.status}: ${body}`)
  }
}

async function stampAnnounced(
  supabase: SupabaseClient<Database>,
  items: AwardAnnouncement[],
  announcedAt: string
): Promise<void> {
  const riderAwardIds: string[] = []
  const resultIdsByAward = new Map<string, string[]>()
  for (const { stamp } of items) {
    if (stamp.table === 'rider_awards') {
      riderAwardIds.push(stamp.id)
    } else {
      const ids = resultIdsByAward.get(stamp.awardId) ?? []
      ids.push(stamp.resultId)
      resultIdsByAward.set(stamp.awardId, ids)
    }
  }

  for (let i = 0; i < riderAwardIds.length; i += STAMP_CHUNK) {
    const { error } = await supabase
      .from('rider_awards')
      .update({ announced_at: announcedAt })
      .in('id', riderAwardIds.slice(i, i + STAMP_CHUNK))
      .is('announced_at', null)
    if (error) throw new Error(`Failed to stamp rider_awards: ${error.message}`)
  }

  // Composite key: one update per award, filtered by that award's result ids,
  // touches exactly the fetched (result_id, award_id) pairs.
  for (const [awardId, resultIds] of resultIdsByAward) {
    for (let i = 0; i < resultIds.length; i += STAMP_CHUNK) {
      const { error } = await supabase
        .from('result_awards')
        .update({ announced_at: announcedAt })
        .eq('award_id', awardId)
        .in('result_id', resultIds.slice(i, i + STAMP_CHUNK))
        .is('announced_at', null)
      if (error) throw new Error(`Failed to stamp result_awards: ${error.message}`)
    }
  }
}

/**
 * One cron sweep: fetch unannounced rows from both tables, post the visible
 * ones to Slack, then stamp every fetched row. See the module header for why
 * the post comes before the stamp.
 */
export async function announceNewAwards(): Promise<AnnounceResult> {
  const result: AnnounceResult = {
    configured: false,
    fetched: 0,
    announced: 0,
    hiddenSkipped: 0,
    unlistedSkipped: 0,
    posted: 0,
  }

  const webhookUrl = process.env.SLACK_AWARDS_WEBHOOK_URL
  if (!webhookUrl) return result
  result.configured = true

  const supabase = getSupabaseAdmin()

  const [riderAwards, resultAwards] = await Promise.all([
    fetchUnannouncedRiderAwards(supabase),
    fetchUnannouncedResultAwards(supabase),
  ])
  if (riderAwards.error) {
    throw new Error(`Failed to fetch unannounced rider awards: ${riderAwards.error.message}`)
  }
  if (resultAwards.error) {
    throw new Error(`Failed to fetch unannounced result awards: ${resultAwards.error.message}`)
  }

  const items: AwardAnnouncement[] = [
    ...((riderAwards.data ?? []) as unknown as UnannouncedRiderAwardRow[]).map(normalizeRiderAward),
    ...((resultAwards.data ?? []) as unknown as UnannouncedResultAwardRow[]).map(
      normalizeResultAward
    ),
  ]
  result.fetched = items.length
  if (items.length === 0) return result

  result.hiddenSkipped = items.filter((item) => item.hidden).length
  result.unlistedSkipped = items.filter((item) => !item.hidden && !isAnnounceable(item)).length
  result.announced = items.length - result.hiddenSkipped - result.unlistedSkipped

  const messages = buildAwardsMessages(items)
  for (const text of messages) {
    try {
      await postSlackMessage(webhookUrl, text)
    } catch (error) {
      // Nothing stamped yet: every row retries next hour. If an earlier
      // message in this run already went out, it will be posted again.
      logError(error, {
        operation: 'announce-awards.post',
        context: { messageIndex: result.posted, messageCount: messages.length },
      })
      throw error
    }
    result.posted++
  }

  try {
    await stampAnnounced(supabase, items, new Date().toISOString())
  } catch (error) {
    // Posted but not stamped: next run will announce these again.
    logError(error, {
      operation: 'announce-awards.stamp',
      context: { fetched: result.fetched, posted: result.posted },
    })
    throw error
  }

  return result
}
