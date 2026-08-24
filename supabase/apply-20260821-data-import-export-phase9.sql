-- Data Import/Export Phase 9: cancel/retry + org concurrency helpers.
-- Additive. Staging first. Tenant-safe RPCs only.

ALTER TABLE public.data_import_batches
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.data_import_batches.cancel_requested_at IS
  'Set when clinic requests cancel of a queued/importing batch; worker must stop and mark cancelled.';

CREATE OR REPLACE FUNCTION public.cancel_own_data_import_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_row public.data_import_batches%ROWTYPE;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT public.has_permission('data:import') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.data_import_batches
  WHERE id = p_batch_id
    AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  IF v_row.status NOT IN ('queued', 'importing') THEN
    RAISE EXCEPTION 'batch cannot be cancelled from status %', v_row.status;
  END IF;

  UPDATE public.data_import_batches
  SET
    status = 'cancelled',
    cancel_requested_at = timezone('utc', now()),
    cancelled_by = auth.uid(),
    completed_at = timezone('utc', now()),
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    progress_message = COALESCE(progress_message, 'Cancelado por el usuario'),
    error_message = COALESCE(error_message, 'Cancelado por el usuario')
  WHERE id = p_batch_id
    AND organization_id = v_org;

  RETURN jsonb_build_object(
    'id', p_batch_id,
    'status', 'cancelled',
    'organization_id', v_org
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_own_data_import_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_row public.data_import_batches%ROWTYPE;
  v_active INT;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT public.has_permission('data:import') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.data_import_batches
  WHERE id = p_batch_id
    AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  IF v_row.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'batch cannot be retried from status %', v_row.status;
  END IF;

  IF v_row.storage_path IS NULL THEN
    RAISE EXCEPTION 'batch has no stored CSV for retry';
  END IF;

  SELECT COUNT(*) INTO v_active
  FROM public.data_import_batches
  WHERE organization_id = v_org
    AND status IN ('queued', 'importing')
    AND id <> p_batch_id;

  IF v_active > 0 THEN
    RAISE EXCEPTION 'organization already has an active import job';
  END IF;

  -- Resume from last progress_processed when > 0 (idempotent re-runs); otherwise restart counters.
  UPDATE public.data_import_batches
  SET
    status = 'queued',
    queued_at = timezone('utc', now()),
    cancel_requested_at = NULL,
    cancelled_by = NULL,
    completed_at = NULL,
    error_message = NULL,
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    progress_message = CASE
      WHEN COALESCE(progress_processed, 0) > 0 THEN 'Reencolado (reanudación)'
      ELSE 'Reencolado'
    END,
    imported_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN imported_records ELSE 0 END,
    failed_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN failed_records ELSE 0 END,
    linked_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN linked_records ELSE 0 END,
    skipped_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN skipped_records ELSE 0 END
  WHERE id = p_batch_id
    AND organization_id = v_org;

  RETURN jsonb_build_object(
    'id', p_batch_id,
    'status', 'queued',
    'organization_id', v_org,
    'resume_from', COALESCE(v_row.progress_processed, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_data_export_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_row public.data_export_jobs%ROWTYPE;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT public.has_permission('data:export') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.data_export_jobs
  WHERE id = p_job_id
    AND organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'export job not found';
  END IF;

  IF v_row.status NOT IN ('queued', 'running') THEN
    RAISE EXCEPTION 'export cannot be cancelled from status %', v_row.status;
  END IF;

  UPDATE public.data_export_jobs
  SET
    status = 'failed',
    error_message = 'Cancelado por el usuario',
    progress_message = 'Cancelado por el usuario',
    completed_at = timezone('utc', now()),
    worker_locked_at = NULL,
    worker_lock_token = NULL
  WHERE id = p_job_id
    AND organization_id = v_org;

  RETURN jsonb_build_object(
    'id', p_job_id,
    'status', 'failed',
    'organization_id', v_org
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_own_data_import_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retry_own_data_import_batch(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_own_data_export_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_own_data_import_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_own_data_import_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_data_export_job(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_data_import_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_own_data_import_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_own_data_export_job(UUID) TO service_role;
