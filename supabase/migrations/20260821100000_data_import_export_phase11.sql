-- Data Import/Export Phase 11: migration notifications + superadmin force-cancel.
-- Additive. Staging first.

ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'migracion';

CREATE OR REPLACE FUNCTION public.superadmin_force_cancel_data_import_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.data_import_batches%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.data_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  IF v_row.status NOT IN ('queued', 'importing') THEN
    RAISE EXCEPTION 'batch cannot be force-cancelled from status %', v_row.status;
  END IF;

  UPDATE public.data_import_batches
  SET
    status = 'cancelled',
    cancel_requested_at = timezone('utc', now()),
    cancelled_by = auth.uid(),
    completed_at = timezone('utc', now()),
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    progress_message = 'Cancelado por Superadmin',
    error_message = COALESCE(error_message, 'Cancelado por Superadmin')
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'id', p_batch_id,
    'status', 'cancelled',
    'organization_id', v_row.organization_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_force_cancel_data_export_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.data_export_jobs%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.data_export_jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'export job not found';
  END IF;

  IF v_row.status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'export cannot be force-cancelled from status %', v_row.status;
  END IF;

  UPDATE public.data_export_jobs
  SET
    status = 'failed',
    error_message = 'Cancelado por Superadmin',
    progress_message = 'Cancelado por Superadmin',
    completed_at = timezone('utc', now()),
    worker_locked_at = NULL,
    worker_lock_token = NULL
  WHERE id = p_job_id;

  RETURN jsonb_build_object(
    'id', p_job_id,
    'status', 'failed',
    'organization_id', v_row.organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_force_cancel_data_import_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_force_cancel_data_export_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_force_cancel_data_import_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_force_cancel_data_export_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_force_cancel_data_import_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.superadmin_force_cancel_data_export_job(UUID) TO service_role;
