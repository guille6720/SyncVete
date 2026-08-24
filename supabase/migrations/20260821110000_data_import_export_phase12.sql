-- Data Import/Export Phase 12: deep integrity, worker heartbeats, id-map export, force-retry.
-- Additive. Staging first. Tenant-safe RPCs only.

CREATE TABLE IF NOT EXISTS public.data_migration_worker_heartbeats (
  worker_name TEXT PRIMARY KEY,
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  last_ok BOOLEAN NOT NULL DEFAULT true,
  last_detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.data_migration_worker_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_migration_heartbeats_platform_select
  ON public.data_migration_worker_heartbeats;
CREATE POLICY data_migration_heartbeats_platform_select
  ON public.data_migration_worker_heartbeats
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

GRANT SELECT ON public.data_migration_worker_heartbeats TO authenticated;
GRANT ALL ON public.data_migration_worker_heartbeats TO service_role;

CREATE OR REPLACE FUNCTION public.touch_data_migration_worker_heartbeat(
  p_worker_name TEXT,
  p_ok BOOLEAN DEFAULT true,
  p_detail JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;
  IF p_worker_name IS NULL OR btrim(p_worker_name) = '' THEN
    RAISE EXCEPTION 'worker_name required';
  END IF;

  INSERT INTO public.data_migration_worker_heartbeats (
    worker_name, last_run_at, last_ok, last_detail, updated_at
  )
  VALUES (
    left(btrim(p_worker_name), 64),
    timezone('utc', now()),
    COALESCE(p_ok, true),
    COALESCE(p_detail, '{}'::jsonb),
    timezone('utc', now())
  )
  ON CONFLICT (worker_name) DO UPDATE
  SET
    last_run_at = EXCLUDED.last_run_at,
    last_ok = EXCLUDED.last_ok,
    last_detail = EXCLUDED.last_detail,
    updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_data_migration_worker_heartbeat(TEXT, BOOLEAN, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_data_migration_worker_heartbeat(TEXT, BOOLEAN, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.superadmin_data_migration_worker_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'worker_name', worker_name,
      'last_run_at', last_run_at,
      'last_ok', last_ok,
      'last_detail', last_detail,
      'stale_minutes', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (timezone('utc', now()) - last_run_at)) / 60.0))
    )
    ORDER BY worker_name
  ), '[]'::jsonb)
  INTO v_rows
  FROM public.data_migration_worker_heartbeats;

  RETURN jsonb_build_object(
    'generated_at', timezone('utc', now()),
    'workers', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_data_migration_worker_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_data_migration_worker_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_data_migration_worker_status() TO service_role;

CREATE OR REPLACE FUNCTION public.own_data_migration_integrity()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_imports JSONB;
  v_exports JSONB;
  v_created INT;
  v_maps INT;
  v_orphans JSONB;
  v_stuck JSONB;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT (
    public.has_permission('data:import')
    OR public.has_permission('data:export')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'queued', COUNT(*) FILTER (WHERE status IN ('queued', 'importing')),
    'completed', COUNT(*) FILTER (WHERE status IN ('completed', 'completed_with_warnings')),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled'),
    'rolled_back', COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL),
    'imported_records', COALESCE(SUM(imported_records), 0),
    'failed_records', COALESCE(SUM(failed_records), 0)
  )
  INTO v_imports
  FROM public.data_import_batches
  WHERE organization_id = v_org;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'queued', COUNT(*) FILTER (WHERE status IN ('queued', 'running')),
    'completed', COUNT(*) FILTER (WHERE status = 'completed'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'with_artifact', COUNT(*) FILTER (WHERE storage_path IS NOT NULL AND status = 'completed')
  )
  INTO v_exports
  FROM public.data_export_jobs
  WHERE organization_id = v_org;

  SELECT COUNT(*) INTO v_created
  FROM public.data_import_created_rows
  WHERE organization_id = v_org;

  SELECT COUNT(*) INTO v_maps
  FROM public.data_import_id_map
  WHERE organization_id = v_org;

  SELECT jsonb_build_object(
    'created_rows', jsonb_build_object(
      'owners', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.owners o ON o.id = c.entity_id AND o.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'owners' AND o.id IS NULL
      ),
      'patients', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.patients p ON p.id = c.entity_id AND p.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'patients' AND p.id IS NULL
      ),
      'clinical_entries', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.clinical_entries e ON e.id = c.entity_id AND e.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'clinical_entries' AND e.id IS NULL
      ),
      'vaccinations', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.vaccinations v ON v.id = c.entity_id AND v.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'vaccinations' AND v.id IS NULL
      ),
      'lab_orders', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.lab_orders l ON l.id = c.entity_id AND l.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'lab_orders' AND l.id IS NULL
      ),
      'surgeries', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.surgeries s ON s.id = c.entity_id AND s.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'surgeries' AND s.id IS NULL
      ),
      'prescriptions', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.prescriptions r ON r.id = c.entity_id AND r.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'prescriptions' AND r.id IS NULL
      ),
      'hospitalizations', (
        SELECT COUNT(*) FROM public.data_import_created_rows c
        LEFT JOIN public.hospitalizations h ON h.id = c.entity_id AND h.organization_id = c.organization_id
        WHERE c.organization_id = v_org AND c.entity_type = 'hospitalizations' AND h.id IS NULL
      )
    ),
    'id_map', jsonb_build_object(
      'owners', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.owners o ON o.id = m.internal_id AND o.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'owners' AND o.id IS NULL
      ),
      'patients', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.patients p ON p.id = m.internal_id AND p.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'patients' AND p.id IS NULL
      ),
      'clinical_entries', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.clinical_entries e ON e.id = m.internal_id AND e.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'clinical_entries' AND e.id IS NULL
      ),
      'vaccinations', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.vaccinations v ON v.id = m.internal_id AND v.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'vaccinations' AND v.id IS NULL
      ),
      'lab_orders', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.lab_orders l ON l.id = m.internal_id AND l.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'lab_orders' AND l.id IS NULL
      ),
      'surgeries', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.surgeries s ON s.id = m.internal_id AND s.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'surgeries' AND s.id IS NULL
      ),
      'prescriptions', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.prescriptions r ON r.id = m.internal_id AND r.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'prescriptions' AND r.id IS NULL
      ),
      'hospitalizations', (
        SELECT COUNT(*) FROM public.data_import_id_map m
        LEFT JOIN public.hospitalizations h ON h.id = m.internal_id AND h.organization_id = m.organization_id
        WHERE m.organization_id = v_org AND m.entity_type = 'hospitalizations' AND h.id IS NULL
      )
    )
  )
  INTO v_orphans;

  SELECT jsonb_build_object(
    'imports', (
      SELECT COUNT(*) FROM public.data_import_batches b
      WHERE b.organization_id = v_org
        AND b.status IN ('queued', 'importing')
        AND b.worker_locked_at IS NOT NULL
        AND b.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    ),
    'exports', (
      SELECT COUNT(*) FROM public.data_export_jobs j
      WHERE j.organization_id = v_org
        AND j.status IN ('queued', 'running')
        AND j.worker_locked_at IS NOT NULL
        AND j.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    )
  )
  INTO v_stuck;

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'generated_at', timezone('utc', now()),
    'imports', v_imports,
    'exports', v_exports,
    'created_rows_tracked', v_created,
    'id_map_entries', v_maps,
    'orphans', v_orphans,
    'stuck_locks', v_stuck
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.own_data_import_id_map(p_batch_id UUID)
RETURNS TABLE (
  entity_type TEXT,
  external_id TEXT,
  internal_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
BEGIN
  IF v_org IS NULL OR NOT public.has_permission('data:import') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.data_import_batches b
    WHERE b.id = p_batch_id AND b.organization_id = v_org
  ) THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  RETURN QUERY
  SELECT m.entity_type, m.external_id, m.internal_id, m.created_at
  FROM public.data_import_id_map m
  WHERE m.batch_id = p_batch_id
    AND m.organization_id = v_org
  ORDER BY m.entity_type, m.external_id
  LIMIT 20000;
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_import_id_map(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_import_id_map(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_import_id_map(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.superadmin_force_retry_data_import_batch(p_batch_id UUID)
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

  IF v_row.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'batch cannot be force-retried from status %', v_row.status;
  END IF;

  IF v_row.storage_path IS NULL THEN
    RAISE EXCEPTION 'batch has no stored CSV for retry';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.data_import_batches b
    WHERE b.organization_id = v_row.organization_id
      AND b.id IS DISTINCT FROM p_batch_id
      AND b.status IN ('queued', 'importing')
  ) THEN
    RAISE EXCEPTION 'organization already has an active import';
  END IF;

  UPDATE public.data_import_batches
  SET
    status = 'queued',
    error_message = NULL,
    progress_message = CASE
      WHEN COALESCE(progress_processed, 0) > 0 THEN 'Reencolado por Superadmin (reanudación)'
      ELSE 'Reencolado por Superadmin'
    END,
    cancel_requested_at = NULL,
    cancelled_by = NULL,
    completed_at = NULL,
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    queued_at = timezone('utc', now()),
    imported_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN imported_records ELSE 0 END,
    failed_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN failed_records ELSE 0 END,
    linked_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN linked_records ELSE 0 END,
    skipped_records = CASE WHEN COALESCE(progress_processed, 0) > 0 THEN skipped_records ELSE 0 END
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'id', p_batch_id,
    'status', 'queued',
    'organization_id', v_row.organization_id,
    'resume_from', COALESCE(v_row.progress_processed, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_force_retry_data_import_batch(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_force_retry_data_import_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_force_retry_data_import_batch(UUID) TO service_role;
