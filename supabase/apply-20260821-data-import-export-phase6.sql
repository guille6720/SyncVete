-- Data Import/Export Phase 6: expire export jobs, cleanup helper, import audit trail.
-- Additive. Staging first. Tenant-isolated. Service-role cron only for cleanup.

CREATE OR REPLACE FUNCTION public.cleanup_expired_data_export_jobs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_marked INT := 0;
BEGIN
  UPDATE public.data_export_jobs
  SET
    status = 'expired',
    progress_message = COALESCE(progress_message, '') || ' · Expirado por retención',
    completed_at = COALESCE(completed_at, timezone('utc', now()))
  WHERE expires_at IS NOT NULL
    AND expires_at < timezone('utc', now())
    AND status IN ('completed', 'failed', 'queued', 'running');

  GET DIAGNOSTICS v_marked = ROW_COUNT;

  RETURN jsonb_build_object(
    'expired_jobs', v_marked,
    'ran_at', timezone('utc', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_data_export_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_data_export_jobs() TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_data_export_jobs() IS
  'Marks expired data_export_jobs. Storage object deletion is handled by the app cron.';

-- Optional: cancel stale queued imports older than 7 days (stuck jobs)
CREATE OR REPLACE FUNCTION public.cleanup_stale_data_import_batches(p_max_age_hours INT DEFAULT 168)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled INT := 0;
  v_hours INT := GREATEST(COALESCE(p_max_age_hours, 168), 24);
BEGIN
  UPDATE public.data_import_batches
  SET
    status = 'cancelled',
    progress_message = 'Cancelado por antigüedad en cola',
    completed_at = timezone('utc', now()),
    error_message = COALESCE(error_message, 'Stale queued/importing batch')
  WHERE status IN ('queued', 'importing')
    AND COALESCE(queued_at, started_at, created_at) < (timezone('utc', now()) - make_interval(hours => v_hours));

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelled_batches', v_cancelled,
    'max_age_hours', v_hours,
    'ran_at', timezone('utc', now())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_data_import_batches(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_data_import_batches(INT) TO service_role;
