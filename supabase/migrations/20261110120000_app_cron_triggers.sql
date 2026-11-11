-- Trigger the hourly cron endpoints from inside Postgres.
--
-- The three /api/cron/* routes were driven only by GitHub Actions `schedule:`
-- workflows. GitHub treats those as best-effort: between 2026-09-15 and
-- 2026-11-10 the hourly card-reminders workflow ran 265 times instead of
-- ~1,340, with a median gap of 5 hours and a worst gap of 11. Digital brevet
-- card reminders meant for the evening before a ride went out as late as
-- 2:45 am, and riders reported not receiving them. complete-events and
-- announce-awards were dropped at the same rate.
--
-- pg_cron fires on time. Each job calls trigger_app_cron(), which makes the
-- same authenticated GET the workflows make, through pg_net.
--
-- The site URL and the cron secret live in Supabase Vault, never in this
-- repo. Until both exist the function warns and does nothing, so local and CI
-- databases stay inert and this migration can deploy before the secrets do.
-- One-time production setup: docs/database-setup.md -> "Cron triggers".

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- One row per request handed to pg_net. net._http_response holds the outcome
-- but not the URL, and only for about six hours, so without this there is no
-- way to tell which job a response belongs to or whether a job fired at all.
CREATE TABLE IF NOT EXISTS public.app_cron_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job text NOT NULL,
  request_id bigint NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_cron_runs_requested_at_idx
  ON public.app_cron_runs (requested_at DESC);

-- Operational log, not app data: no policies, so only the service role and
-- the SQL editor can read it.
ALTER TABLE public.app_cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_cron_runs FROM anon, authenticated;

-- Returns the pg_net request id, or NULL when the Vault secrets are missing.
--
-- SECURITY INVOKER on purpose: pg_cron runs a job as the role that scheduled
-- it (postgres, via this migration), which can already read Vault. Nothing
-- else needs to call this, so EXECUTE is revoked from every API role below
-- rather than widening the function's own rights.
CREATE OR REPLACE FUNCTION public.trigger_app_cron(p_job text)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_site_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  -- The job name is spliced into a URL that carries the cron secret, so it is
  -- checked against the known endpoints rather than trusted.
  IF p_job NOT IN ('complete-events', 'card-reminders', 'announce-awards') THEN
    RAISE EXCEPTION 'Unknown app cron job: %', p_job;
  END IF;

  SELECT decrypted_secret INTO v_site_url
  FROM vault.decrypted_secrets WHERE name = 'app_cron_site_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'app_cron_secret';

  IF coalesce(v_site_url, '') = '' OR coalesce(v_secret, '') = '' THEN
    RAISE WARNING 'trigger_app_cron(%): Vault secrets app_cron_site_url / app_cron_secret are not set; skipping', p_job;
    RETURN NULL;
  END IF;

  -- pg_net does not follow redirects: app_cron_site_url must be the canonical
  -- host. The default 5s timeout is shorter than a sweep that sends email;
  -- 120s covers the routes' 60s maxDuration with room to spare. pg_net is
  -- asynchronous, so this does not hold the cron job open.
  SELECT net.http_get(
    url := rtrim(v_site_url, '/') || '/api/cron/' || p_job,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  INSERT INTO public.app_cron_runs (job, request_id) VALUES (p_job, v_request_id);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_app_cron(text) FROM PUBLIC, anon, authenticated, service_role;

-- Same minutes the GitHub workflows used. cron.schedule() upserts by job
-- name, so re-running this migration does not duplicate jobs. pg_cron runs in
-- UTC; every schedule here is hourly, so the timezone does not matter.
SELECT cron.schedule(
  'app-cron-complete-events', '0 * * * *',
  $$SELECT public.trigger_app_cron('complete-events')$$
);

SELECT cron.schedule(
  'app-cron-card-reminders', '15 * * * *',
  $$SELECT public.trigger_app_cron('card-reminders')$$
);

SELECT cron.schedule(
  'app-cron-announce-awards', '30 * * * *',
  $$SELECT public.trigger_app_cron('announce-awards')$$
);

-- Housekeeping. pg_cron logs every run to cron.job_run_details and never
-- trims it; three hourly jobs add about 26,000 rows a year.
SELECT cron.schedule(
  'app-cron-prune-logs', '45 3 * * *',
  $$
  DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days';
  DELETE FROM public.app_cron_runs WHERE requested_at < now() - interval '30 days';
  $$
);
