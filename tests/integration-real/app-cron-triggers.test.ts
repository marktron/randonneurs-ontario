import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { Client } from 'pg'

/**
 * The hourly cron endpoints are triggered from inside Postgres (pg_cron +
 * pg_net, see supabase/migrations/20261110120000_app_cron_triggers.sql).
 * None of cron/net/vault is reachable through PostgREST, so this suite talks
 * to the local database directly.
 *
 * Every test runs inside a transaction that is rolled back. That matters for
 * more than cleanliness: pg_net's background worker only sends committed
 * queue rows, so a rolled-back request never leaves the database, and the
 * Vault secrets a test sets never outlive it.
 */
const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const JOBS = [
  { name: 'app-cron-complete-events', schedule: '0 * * * *', job: 'complete-events' },
  { name: 'app-cron-card-reminders', schedule: '15 * * * *', job: 'card-reminders' },
  { name: 'app-cron-announce-awards', schedule: '30 * * * *', job: 'announce-awards' },
]

let db: Client

async function setSecret(name: string, value: string) {
  await db.query('DELETE FROM vault.secrets WHERE name = $1', [name])
  await db.query('SELECT vault.create_secret($1, $2)', [value, name])
}

async function clearSecrets() {
  await db.query("DELETE FROM vault.secrets WHERE name IN ('app_cron_site_url', 'app_cron_secret')")
}

beforeAll(async () => {
  db = new Client({ connectionString: DB_URL })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

beforeEach(async () => {
  await db.query('BEGIN')
})

afterEach(async () => {
  await db.query('ROLLBACK')
})

describe('app cron schedule', () => {
  it.each(JOBS)('schedules $name at "$schedule"', async ({ name, schedule, job }) => {
    const { rows } = await db.query(
      'SELECT schedule, command, active FROM cron.job WHERE jobname = $1',
      [name]
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].schedule).toBe(schedule)
    expect(rows[0].active).toBe(true)
    expect(rows[0].command).toContain(`trigger_app_cron('${job}')`)
  })
})

describe('trigger_app_cron', () => {
  it('does nothing when the Vault secrets are missing', async () => {
    await clearSecrets()

    const { rows } = await db.query("SELECT public.trigger_app_cron('card-reminders') AS id")

    expect(rows[0].id).toBeNull()
    const queue = await db.query('SELECT count(*)::int AS n FROM net.http_request_queue')
    expect(queue.rows[0].n).toBe(0)
    const runs = await db.query('SELECT count(*)::int AS n FROM public.app_cron_runs')
    expect(runs.rows[0].n).toBe(0)
  })

  it('does nothing when only one of the two secrets is set', async () => {
    await clearSecrets()
    await setSecret('app_cron_site_url', 'https://example.test')

    const { rows } = await db.query("SELECT public.trigger_app_cron('card-reminders') AS id")

    expect(rows[0].id).toBeNull()
    const queue = await db.query('SELECT count(*)::int AS n FROM net.http_request_queue')
    expect(queue.rows[0].n).toBe(0)
  })

  it('queues an authenticated GET to the job endpoint and records the run', async () => {
    await clearSecrets()
    // Trailing slash on purpose: the URL must not come out as `//api/...`.
    await setSecret('app_cron_site_url', 'https://example.test/')
    await setSecret('app_cron_secret', 'test-cron-secret')

    const { rows } = await db.query("SELECT public.trigger_app_cron('card-reminders') AS id")
    const requestId = rows[0].id
    expect(requestId).not.toBeNull()

    const queue = await db.query(
      'SELECT method, url, headers, timeout_milliseconds FROM net.http_request_queue WHERE id = $1',
      [requestId]
    )
    expect(queue.rows).toHaveLength(1)
    expect(queue.rows[0].method).toBe('GET')
    expect(queue.rows[0].url).toBe('https://example.test/api/cron/card-reminders')
    expect(queue.rows[0].headers.Authorization).toBe('Bearer test-cron-secret')
    // pg_net's default is 5s, shorter than a sweep that sends real email.
    expect(queue.rows[0].timeout_milliseconds).toBeGreaterThanOrEqual(60000)

    const runs = await db.query('SELECT job, request_id FROM public.app_cron_runs')
    expect(runs.rows).toEqual([{ job: 'card-reminders', request_id: requestId }])
  })

  it('rejects a job name that is not one of the cron endpoints', async () => {
    await setSecret('app_cron_site_url', 'https://example.test')
    await setSecret('app_cron_secret', 'test-cron-secret')

    await expect(db.query("SELECT public.trigger_app_cron('../revalidate')")).rejects.toThrow(
      /Unknown app cron job/
    )
  })
})

describe('app cron access', () => {
  it.each(['anon', 'authenticated', 'service_role'])(
    '%s cannot execute trigger_app_cron',
    async (role) => {
      const { rows } = await db.query(
        "SELECT has_function_privilege($1, 'public.trigger_app_cron(text)', 'EXECUTE') AS allowed",
        [role]
      )
      expect(rows[0].allowed).toBe(false)
    }
  )

  it.each(['anon', 'authenticated'])('%s cannot read app_cron_runs', async (role) => {
    const { rows } = await db.query(
      "SELECT has_table_privilege($1, 'public.app_cron_runs', 'SELECT') AS allowed",
      [role]
    )
    expect(rows[0].allowed).toBe(false)
  })
})
