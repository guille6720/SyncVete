-- STAGING ONLY — enable scheduled subscription expiry.
-- Do NOT run against Production until GLOBAL_NAVIGATION_RESULTS.md is PASS
-- and a human explicitly enables Production cron.
--
-- Prerequisites (Supabase Staging project):
-- 1. Migration 20260827200000_expire_subscriptions_job.sql applied
-- 2. Extensions: pg_cron (and optionally pg_net) available on the project
-- 3. Run this in the Staging SQL editor as a privileged role
--
-- Idempotent: unschedules prior job name before creating.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'syncvete_expire_due_subscriptions';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'cron.job missing — enable pg_cron in Supabase Dashboard first';
  WHEN undefined_function THEN
    RAISE NOTICE 'cron.unschedule missing — enable pg_cron in Supabase Dashboard first';
END;
$$;

SELECT cron.schedule(
  'syncvete_expire_due_subscriptions',
  '*/15 * * * *',
  $$SELECT public.expire_due_subscriptions_job();$$
);

-- ---------------------------------------------------------------------------
-- PRODUCTION (manual, later):
-- 1. Confirm staging job is healthy for several days
-- 2. Apply the same migration on Production
-- 3. Run an equivalent script in Production SQL editor
-- 4. Monitor organization_subscriptions status transitions + audit logs
-- ---------------------------------------------------------------------------
