import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockLogError, mockFrom, db } = vi.hoisted(() => {
  interface Call {
    table: string
    op: 'select' | 'update'
    values: unknown
    filters: Array<[string, string, unknown]>
  }
  const db = {
    riderRows: [] as unknown[],
    resultRows: [] as unknown[],
    calls: [] as Call[],
  }
  const mockFrom = (table: string) => {
    const call: Call = { table, op: 'select', values: null, filters: [] }
    db.calls.push(call)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: Record<string, any> = {}
    b.select = () => b
    b.update = (values: unknown) => {
      call.op = 'update'
      call.values = values
      return b
    }
    for (const f of ['is', 'eq', 'in']) {
      b[f] = (col: string, val: unknown) => {
        call.filters.push([f, col, val])
        return b
      }
    }
    b.order = () => b
    b.limit = () => b
    b.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const data =
        call.op === 'update' ? null : table === 'rider_awards' ? db.riderRows : db.resultRows
      return Promise.resolve({ data, error: null }).then(resolve, reject)
    }
    return b
  }
  return { mockLogError: vi.fn(), mockFrom: vi.fn(mockFrom), db }
})

vi.mock('@/lib/errors', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
}))

vi.mock('@/lib/supabase-server', () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: mockFrom })),
}))

import {
  announceNewAwards,
  buildAwardsMessages,
  postSlackMessage,
  isSlackAwardsConfigured,
  isAnnounceable,
  ANNOUNCED_RESULT_AWARD_SLUGS,
  type AwardAnnouncement,
} from '@/lib/awards/announce-awards'
import { SITE_URL } from '@/lib/site-url'

const WEBHOOK = 'https://hooks.slack.test/services/T/B/X'

function item(overrides: Partial<AwardAnnouncement> = {}): AwardAnnouncement {
  return {
    kind: 'season',
    riderId: 'r1',
    riderSlug: 'jane-doe',
    riderName: 'Jane Doe',
    hidden: false,
    awardSlug: 'super-randonneur',
    awardTitle: 'Super Randonneur',
    season: 2026,
    stamp: { table: 'rider_awards', id: 'ra1' },
    ...overrides,
  }
}

function riderAwardRow(
  id: string,
  rider: { id: string; slug: string; first_name: string; last_name: string; hidden: boolean }
) {
  return {
    id,
    season: 2026,
    created_at: '2026-09-01T00:00:00Z',
    riders: rider,
    awards: { slug: 'super-randonneur', title: 'Super Randonneur' },
  }
}

function resultAwardRow(
  resultId: string,
  awardId: string,
  rider: { id: string; slug: string; first_name: string; last_name: string; hidden: boolean },
  award: { slug: string; title: string } = { slug: 'first-brevet', title: 'First Brevet' }
) {
  return {
    result_id: resultId,
    award_id: awardId,
    awards: award,
    results: {
      id: resultId,
      season: 2026,
      riders: rider,
      events: { name: 'Niagara 200', event_date: '2026-06-15' },
    },
  }
}

const JANE = { id: 'r1', slug: 'jane-doe', first_name: 'Jane', last_name: 'Doe', hidden: false }
const GHOST = { id: 'r2', slug: 'ghost', first_name: 'Secret', last_name: 'Ghost', hidden: true }

describe('buildAwardsMessages', () => {
  it('returns [] for no items', () => {
    expect(buildAwardsMessages([])).toEqual([])
  })

  it('returns [] when every item is hidden', () => {
    expect(buildAwardsMessages([item({ hidden: true })])).toEqual([])
  })

  it('groups season awards under a heading with the season', () => {
    const [msg] = buildAwardsMessages([
      item(),
      item({ riderId: 'r2', riderSlug: 'john-roe', riderName: 'John Roe' }),
    ])
    expect(msg.split('\n')[0]).toMatch(/^:trophy: New awards/)
    expect(msg).toContain('*Super Randonneur 2026*')
    expect(msg.match(/\*Super Randonneur 2026\*/g)).toHaveLength(1)
    expect(msg).toContain(`• <${SITE_URL}/riders/jane-doe|Jane Doe>`)
    expect(msg).toContain(`• <${SITE_URL}/riders/john-roe|John Roe>`)
  })

  it('separates the same award across seasons', () => {
    const [msg] = buildAwardsMessages([item(), item({ season: 2025 })])
    expect(msg).toContain('*Super Randonneur 2026*')
    expect(msg).toContain('*Super Randonneur 2025*')
  })

  it('uses the bare title for result awards and appends the event label', () => {
    const [msg] = buildAwardsMessages([
      item({
        kind: 'result',
        awardSlug: 'o-12',
        awardTitle: 'O-12',
        eventLabel: 'Niagara 200 (Jun 15, 2026)',
        stamp: { table: 'result_awards', resultId: 'res1', awardId: 'aw1' },
      }),
    ])
    expect(msg).toContain('*O-12*\n')
    expect(msg).not.toContain('*O-12 2026*')
    expect(msg).toContain(`• <${SITE_URL}/riders/jane-doe|Jane Doe> — Niagara 200 (Jun 15, 2026)`)
  })

  it('escapes &, < and > in names, event labels and titles', () => {
    const [msg] = buildAwardsMessages([
      item({
        kind: 'result',
        awardSlug: 'o-12',
        riderName: 'A&B <C>',
        awardTitle: 'R&R',
        eventLabel: 'Hills & <Dales> (Jun 1, 2026)',
        stamp: { table: 'result_awards', resultId: 'x', awardId: 'y' },
      }),
    ])
    expect(msg).toContain('|A&amp;B &lt;C&gt;>')
    expect(msg).toContain('Hills &amp; &lt;Dales&gt; (Jun 1, 2026)')
    expect(msg).toContain('*R&amp;R*')
  })

  it('leaves hidden riders out of the text', () => {
    const [msg] = buildAwardsMessages([
      item(),
      item({ riderId: 'r2', riderName: 'Secret Ghost', riderSlug: 'ghost', hidden: true }),
    ])
    expect(msg).not.toContain('Ghost')
  })

  it('drops an unlisted result award but keeps an o-12 result award and a season award', () => {
    const [msg] = buildAwardsMessages([
      item(), // season award (Super Randonneur), always announceable
      item({
        kind: 'result',
        riderId: 'r2',
        riderName: 'First Timer',
        riderSlug: 'first-timer',
        awardSlug: 'first-brevet',
        awardTitle: 'First Brevet',
        eventLabel: 'Niagara 200 (Jun 15, 2026)',
        stamp: { table: 'result_awards', resultId: 'res1', awardId: 'aw-fb' },
      }),
      item({
        kind: 'result',
        riderId: 'r3',
        riderName: 'O Twelve',
        riderSlug: 'o-twelve',
        awardSlug: 'o-12',
        awardTitle: 'O-12',
        eventLabel: 'Niagara 200 (Jun 15, 2026)',
        stamp: { table: 'result_awards', resultId: 'res2', awardId: 'aw-o12' },
      }),
    ])
    expect(msg).toContain('*Super Randonneur 2026*')
    expect(msg).toContain('*O-12*')
    expect(msg).toContain('O Twelve')
    expect(msg).not.toContain('First Timer')
    expect(msg).not.toContain('First Brevet')
  })

  it('splits between award groups when the text exceeds the limit', () => {
    const items: AwardAnnouncement[] = []
    // 11 award groups x 10 riders each, ~70 chars per bullet → well over 3000.
    for (let g = 0; g < 11; g++) {
      for (let r = 0; r < 10; r++) {
        items.push(
          item({
            awardTitle: `Award ${g}`,
            riderId: `r${g}-${r}`,
            riderSlug: `rider-${g}-${r}`,
            riderName: `Rider Number ${g}-${r}`,
          })
        )
      }
    }
    const msgs = buildAwardsMessages(items)
    expect(msgs.length).toBeGreaterThan(1)
    for (const m of msgs) expect(m.length).toBeLessThanOrEqual(3000)
    expect(msgs[0].startsWith(':trophy: New awards')).toBe(true)
    expect(msgs.slice(1).some((m) => m.includes(':trophy:'))).toBe(false)
    // Each group heading appears exactly once overall: no group was split.
    const all = msgs.join('\n')
    for (let g = 0; g < 11; g++) {
      expect(all.match(new RegExp(`\\*Award ${g} 2026\\*`, 'g'))).toHaveLength(1)
      // and all of a group's bullets live in the message carrying its heading
      const owner = msgs.find((m) => m.includes(`*Award ${g} 2026*`))!
      for (let r = 0; r < 10; r++) expect(owner).toContain(`Rider Number ${g}-${r}>`)
    }
  })

  it('splits a single oversized group across messages, repeating the heading', () => {
    const items = Array.from({ length: 80 }, (_, i) =>
      item({
        riderId: `r${i}`,
        riderSlug: `rider-with-a-longish-slug-${i}`,
        riderName: `Rider With Long Name ${i}`,
      })
    )
    const msgs = buildAwardsMessages(items)
    expect(msgs.length).toBeGreaterThan(1)
    for (const m of msgs) {
      expect(m.length).toBeLessThanOrEqual(3000)
      expect(m).toContain('*Super Randonneur 2026*')
    }
    const all = msgs.join('\n')
    for (let i = 0; i < 80; i++) {
      expect(all.match(new RegExp(`Rider With Long Name ${i}>`, 'g'))).toHaveLength(1)
    }
  })
})

describe('isAnnounceable', () => {
  it('is false for a hidden rider regardless of kind or slug', () => {
    expect(isAnnounceable(item({ hidden: true }))).toBe(false)
    expect(isAnnounceable(item({ hidden: true, kind: 'result', awardSlug: 'o-12' }))).toBe(false)
  })

  it('is true for season awards when not hidden', () => {
    expect(isAnnounceable(item({ kind: 'season' }))).toBe(true)
  })

  it('is false for result awards whose slug is not allowlisted', () => {
    expect(isAnnounceable(item({ kind: 'result', awardSlug: 'first-brevet' }))).toBe(false)
    expect(isAnnounceable(item({ kind: 'result', awardSlug: 'paris-brest-paris' }))).toBe(false)
  })

  it('is true for result awards whose slug is allowlisted', () => {
    expect(ANNOUNCED_RESULT_AWARD_SLUGS.has('o-12')).toBe(true)
    expect(isAnnounceable(item({ kind: 'result', awardSlug: 'o-12' }))).toBe(true)
  })
})

describe('postSlackMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs JSON { text } to the webhook', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('ok', { status: 200 }))
    await postSlackMessage(WEBHOOK, 'hello')
    expect(global.fetch).toHaveBeenCalledWith(
      WEBHOOK,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ text: 'hello', unfurl_links: false, unfurl_media: false }),
      })
    )
  })

  it('throws with status and body on non-2xx', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response('invalid_payload', { status: 400 }))
    await expect(postSlackMessage(WEBHOOK, 'x')).rejects.toThrow(/400.*invalid_payload/)
  })
})

describe('isSlackAwardsConfigured', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('reflects SLACK_AWARDS_WEBHOOK_URL', () => {
    vi.stubEnv('SLACK_AWARDS_WEBHOOK_URL', '')
    expect(isSlackAwardsConfigured()).toBe(false)
    vi.stubEnv('SLACK_AWARDS_WEBHOOK_URL', WEBHOOK)
    expect(isSlackAwardsConfigured()).toBe(true)
  })
})

describe('announceNewAwards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.riderRows = []
    db.resultRows = []
    db.calls = []
    vi.stubEnv('SLACK_AWARDS_WEBHOOK_URL', WEBHOOK)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 }))
    )
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  const updates = () => db.calls.filter((c) => c.op === 'update')
  const postedText = () =>
    vi
      .mocked(global.fetch)
      .mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).text as string)
      .join('\n')

  it('short-circuits without touching the DB when not configured', async () => {
    vi.stubEnv('SLACK_AWARDS_WEBHOOK_URL', '')
    const result = await announceNewAwards()
    expect(result).toEqual({
      configured: false,
      fetched: 0,
      announced: 0,
      hiddenSkipped: 0,
      unlistedSkipped: 0,
      posted: 0,
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does nothing when there are no unannounced rows', async () => {
    const result = await announceNewAwards()
    expect(result).toMatchObject({ configured: true, fetched: 0, posted: 0 })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(updates()).toHaveLength(0)
  })

  it('stamps hidden riders without posting them', async () => {
    db.riderRows = [riderAwardRow('ra-ghost', GHOST)]
    const result = await announceNewAwards()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result).toMatchObject({ fetched: 1, announced: 0, hiddenSkipped: 1, posted: 0 })
    const u = updates()
    expect(u).toHaveLength(1)
    expect(u[0].table).toBe('rider_awards')
    expect(u[0].values).toEqual({ announced_at: expect.any(String) })
    expect(u[0].filters).toContainEqual(['in', 'id', ['ra-ghost']])
  })

  it('posts visible riders only, then stamps both tables', async () => {
    const O12 = { slug: 'o-12', title: 'O-12' }
    db.riderRows = [riderAwardRow('ra1', JANE), riderAwardRow('ra-ghost', GHOST)]
    db.resultRows = [
      resultAwardRow('res1', 'aw-o12', JANE, O12),
      resultAwardRow('res2', 'aw-o12', GHOST, O12),
    ]

    const result = await announceNewAwards()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const text = postedText()
    expect(text).toContain('Jane Doe')
    expect(text).toContain('*Super Randonneur 2026*')
    expect(text).toContain('*O-12*')
    expect(text).toContain('Niagara 200 (Jun 15, 2026)')
    expect(text).not.toContain('Ghost')
    expect(result).toEqual({
      configured: true,
      fetched: 4,
      announced: 2,
      hiddenSkipped: 2,
      unlistedSkipped: 0,
      posted: 1,
    })

    const u = updates()
    const riderUpdate = u.find((c) => c.table === 'rider_awards')!
    expect(riderUpdate.filters).toContainEqual(['in', 'id', ['ra1', 'ra-ghost']])
    expect(riderUpdate.filters).toContainEqual(['is', 'announced_at', null])
    const resultUpdate = u.find((c) => c.table === 'result_awards')!
    expect(resultUpdate.filters).toContainEqual(['eq', 'award_id', 'aw-o12'])
    expect(resultUpdate.filters).toContainEqual(['in', 'result_id', ['res1', 'res2']])
  })

  it('stamps an unlisted result award without posting it, and counts it separately from hidden', async () => {
    db.riderRows = [riderAwardRow('ra1', JANE)]
    db.resultRows = [resultAwardRow('res1', 'aw-fb', JANE)] // default award: first-brevet, unlisted

    const result = await announceNewAwards()

    expect(global.fetch).toHaveBeenCalledTimes(1)
    const text = postedText()
    expect(text).toContain('*Super Randonneur 2026*')
    expect(text).not.toContain('*First Brevet*')
    expect(text).not.toContain('Niagara 200')
    expect(result).toEqual({
      configured: true,
      fetched: 2,
      announced: 1,
      hiddenSkipped: 0,
      unlistedSkipped: 1,
      posted: 1,
    })

    const resultUpdate = updates().find((c) => c.table === 'result_awards')!
    expect(resultUpdate.filters).toContainEqual(['eq', 'award_id', 'aw-fb'])
    expect(resultUpdate.filters).toContainEqual(['in', 'result_id', ['res1']])
  })

  it('leaves rows unstamped and rethrows when Slack fails', async () => {
    db.riderRows = [riderAwardRow('ra1', JANE)]
    vi.mocked(global.fetch).mockResolvedValue(new Response('no_service', { status: 404 }))

    await expect(announceNewAwards()).rejects.toThrow(/404/)
    expect(updates()).toHaveLength(0)
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: expect.stringContaining('announce-awards') })
    )
  })
})
