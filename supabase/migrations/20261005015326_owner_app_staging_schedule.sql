DO $$ BEGIN
  IF current_setting('app.owner_pwa_staging', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'STAGING ONLY';
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Database-owned job; no external credentials or delivery provider required.
SELECT cron.schedule('owner-app-reminders-staging', '* * * * *', $job$
  SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT public.queue_owner_app_reminders();
$job$);
