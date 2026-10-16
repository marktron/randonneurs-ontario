-- Outbox column for Slack award announcements.
--
-- Awards are written to `rider_awards` (season-scoped) and `result_awards`
-- (result-scoped) by Postgres triggers as well as by admin server actions, so
-- the app never sees most writes happen. Instead of hooking every writer, each
-- award row carries `announced_at`: NULL means "not yet posted to Slack". An
-- hourly cron (app/api/cron/announce-awards, see lib/awards/announce-awards.ts)
-- picks up NULL rows, posts a grouped digest to the Slack webhook, then stamps
-- `announced_at = now()`. Hidden riders' rows are stamped without posting.
--
-- Every existing row is stamped here so the first cron run posts nothing
-- historical. New rows default to NULL and are announced once.
--
-- RLS: unchanged. The cron uses the service role, which bypasses RLS. The
-- existing public SELECT policies expose the new column to anon, which is
-- harmless (it is only a timestamp). There is no UPDATE policy on
-- result_awards, which is fine because only the service role stamps it.
--
-- Note: rider_awards has an updated_at trigger, so stamping bumps updated_at.

ALTER TABLE rider_awards ADD COLUMN IF NOT EXISTS announced_at TIMESTAMPTZ;
ALTER TABLE result_awards ADD COLUMN IF NOT EXISTS announced_at TIMESTAMPTZ;

UPDATE rider_awards SET announced_at = now() WHERE announced_at IS NULL;
UPDATE result_awards SET announced_at = now() WHERE announced_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rider_awards_unannounced
  ON rider_awards (created_at, id) WHERE announced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_result_awards_unannounced
  ON result_awards (result_id) WHERE announced_at IS NULL;
