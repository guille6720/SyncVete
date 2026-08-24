-- Data Import/Export Phase 13: release stuck locks, prune orphan maps, appointments export.
-- Additive. Staging first. Tenant-safe RPCs only.

DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'data_export_jobs'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%export_type%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.data_export_jobs DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.data_export_jobs
  ADD CONSTRAINT data_export_jobs_export_type_check
  CHECK (export_type IN (
    'owners',
    'patients',
    'clinical_entries',
    'vaccinations',
    'lab_orders',
    'surgeries',
    'prescriptions',
    'hospitalizations',
    'appointments',
    'patient_clinical',
    'full_clinic'
  ));

CREATE OR REPLACE FUNCTION public.own_release_stale_migration_locks(
  p_stale_minutes INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_minutes INT := GREATEST(5, LEAST(COALESCE(p_stale_minutes, 30), 24 * 60));
  v_imports INT := 0;
  v_exports INT := 0;
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

  UPDATE public.data_import_batches b
  SET
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    status = CASE WHEN b.status = 'importing' THEN 'queued' ELSE b.status END,
    progress_message = 'Lock liberado (stale)'
  WHERE b.organization_id = v_org
    AND b.status IN ('queued', 'importing')
    AND b.worker_locked_at IS NOT NULL
    AND b.worker_locked_at < timezone('utc', now()) - make_interval(mins => v_minutes);

  GET DIAGNOSTICS v_imports = ROW_COUNT;

  UPDATE public.data_export_jobs j
  SET
    worker_locked_at = NULL,
    worker_lock_token = NULL,
    status = CASE WHEN j.status = 'running' THEN 'queued' ELSE j.status END,
    progress_message = 'Lock liberado (stale)'
  WHERE j.organization_id = v_org
    AND j.status IN ('queued', 'running')
    AND j.worker_locked_at IS NOT NULL
    AND j.worker_locked_at < timezone('utc', now()) - make_interval(mins => v_minutes);

  GET DIAGNOSTICS v_exports = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'stale_minutes', v_minutes,
    'imports_released', v_imports,
    'exports_released', v_exports
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_release_stale_migration_locks(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_release_stale_migration_locks(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_release_stale_migration_locks(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.own_prune_orphan_migration_maps(
  p_dry_run BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_created INT := 0;
  v_maps INT := 0;
BEGIN
  IF v_org IS NULL OR NOT public.has_permission('data:import') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF COALESCE(p_dry_run, true) THEN
    SELECT COUNT(*) INTO v_created
    FROM public.data_import_created_rows c
    WHERE c.organization_id = v_org
      AND (
        (c.entity_type = 'owners' AND NOT EXISTS (
          SELECT 1 FROM public.owners o WHERE o.id = c.entity_id AND o.organization_id = v_org
        ))
        OR (c.entity_type = 'patients' AND NOT EXISTS (
          SELECT 1 FROM public.patients p WHERE p.id = c.entity_id AND p.organization_id = v_org
        ))
        OR (c.entity_type = 'clinical_entries' AND NOT EXISTS (
          SELECT 1 FROM public.clinical_entries e WHERE e.id = c.entity_id AND e.organization_id = v_org
        ))
        OR (c.entity_type = 'vaccinations' AND NOT EXISTS (
          SELECT 1 FROM public.vaccinations v WHERE v.id = c.entity_id AND v.organization_id = v_org
        ))
        OR (c.entity_type = 'lab_orders' AND NOT EXISTS (
          SELECT 1 FROM public.lab_orders l WHERE l.id = c.entity_id AND l.organization_id = v_org
        ))
        OR (c.entity_type = 'surgeries' AND NOT EXISTS (
          SELECT 1 FROM public.surgeries s WHERE s.id = c.entity_id AND s.organization_id = v_org
        ))
        OR (c.entity_type = 'prescriptions' AND NOT EXISTS (
          SELECT 1 FROM public.prescriptions r WHERE r.id = c.entity_id AND r.organization_id = v_org
        ))
        OR (c.entity_type = 'hospitalizations' AND NOT EXISTS (
          SELECT 1 FROM public.hospitalizations h WHERE h.id = c.entity_id AND h.organization_id = v_org
        ))
      );

    SELECT COUNT(*) INTO v_maps
    FROM public.data_import_id_map m
    WHERE m.organization_id = v_org
      AND (
        (m.entity_type = 'owners' AND NOT EXISTS (
          SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org
        ))
        OR (m.entity_type = 'patients' AND NOT EXISTS (
          SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org
        ))
        OR (m.entity_type = 'clinical_entries' AND NOT EXISTS (
          SELECT 1 FROM public.clinical_entries e WHERE e.id = m.internal_id AND e.organization_id = v_org
        ))
        OR (m.entity_type = 'vaccinations' AND NOT EXISTS (
          SELECT 1 FROM public.vaccinations v WHERE v.id = m.internal_id AND v.organization_id = v_org
        ))
        OR (m.entity_type = 'lab_orders' AND NOT EXISTS (
          SELECT 1 FROM public.lab_orders l WHERE l.id = m.internal_id AND l.organization_id = v_org
        ))
        OR (m.entity_type = 'surgeries' AND NOT EXISTS (
          SELECT 1 FROM public.surgeries s WHERE s.id = m.internal_id AND s.organization_id = v_org
        ))
        OR (m.entity_type = 'prescriptions' AND NOT EXISTS (
          SELECT 1 FROM public.prescriptions r WHERE r.id = m.internal_id AND r.organization_id = v_org
        ))
        OR (m.entity_type = 'hospitalizations' AND NOT EXISTS (
          SELECT 1 FROM public.hospitalizations h WHERE h.id = m.internal_id AND h.organization_id = v_org
        ))
      );

    RETURN jsonb_build_object(
      'organization_id', v_org,
      'dry_run', true,
      'orphan_created_rows', v_created,
      'orphan_id_map', v_maps,
      'deleted_created_rows', 0,
      'deleted_id_map', 0
    );
  END IF;

  DELETE FROM public.data_import_created_rows c
  WHERE c.organization_id = v_org
    AND (
      (c.entity_type = 'owners' AND NOT EXISTS (
        SELECT 1 FROM public.owners o WHERE o.id = c.entity_id AND o.organization_id = v_org
      ))
      OR (c.entity_type = 'patients' AND NOT EXISTS (
        SELECT 1 FROM public.patients p WHERE p.id = c.entity_id AND p.organization_id = v_org
      ))
      OR (c.entity_type = 'clinical_entries' AND NOT EXISTS (
        SELECT 1 FROM public.clinical_entries e WHERE e.id = c.entity_id AND e.organization_id = v_org
      ))
      OR (c.entity_type = 'vaccinations' AND NOT EXISTS (
        SELECT 1 FROM public.vaccinations v WHERE v.id = c.entity_id AND v.organization_id = v_org
      ))
      OR (c.entity_type = 'lab_orders' AND NOT EXISTS (
        SELECT 1 FROM public.lab_orders l WHERE l.id = c.entity_id AND l.organization_id = v_org
      ))
      OR (c.entity_type = 'surgeries' AND NOT EXISTS (
        SELECT 1 FROM public.surgeries s WHERE s.id = c.entity_id AND s.organization_id = v_org
      ))
      OR (c.entity_type = 'prescriptions' AND NOT EXISTS (
        SELECT 1 FROM public.prescriptions r WHERE r.id = c.entity_id AND r.organization_id = v_org
      ))
      OR (c.entity_type = 'hospitalizations' AND NOT EXISTS (
        SELECT 1 FROM public.hospitalizations h WHERE h.id = c.entity_id AND h.organization_id = v_org
      ))
    );
  GET DIAGNOSTICS v_created = ROW_COUNT;

  DELETE FROM public.data_import_id_map m
  WHERE m.organization_id = v_org
    AND (
      (m.entity_type = 'owners' AND NOT EXISTS (
        SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org
      ))
      OR (m.entity_type = 'patients' AND NOT EXISTS (
        SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org
      ))
      OR (m.entity_type = 'clinical_entries' AND NOT EXISTS (
        SELECT 1 FROM public.clinical_entries e WHERE e.id = m.internal_id AND e.organization_id = v_org
      ))
      OR (m.entity_type = 'vaccinations' AND NOT EXISTS (
        SELECT 1 FROM public.vaccinations v WHERE v.id = m.internal_id AND v.organization_id = v_org
      ))
      OR (m.entity_type = 'lab_orders' AND NOT EXISTS (
        SELECT 1 FROM public.lab_orders l WHERE l.id = m.internal_id AND l.organization_id = v_org
      ))
      OR (m.entity_type = 'surgeries' AND NOT EXISTS (
        SELECT 1 FROM public.surgeries s WHERE s.id = m.internal_id AND s.organization_id = v_org
      ))
      OR (m.entity_type = 'prescriptions' AND NOT EXISTS (
        SELECT 1 FROM public.prescriptions r WHERE r.id = m.internal_id AND r.organization_id = v_org
      ))
      OR (m.entity_type = 'hospitalizations' AND NOT EXISTS (
        SELECT 1 FROM public.hospitalizations h WHERE h.id = m.internal_id AND h.organization_id = v_org
      ))
    );
  GET DIAGNOSTICS v_maps = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'dry_run', false,
    'orphan_created_rows', v_created,
    'orphan_id_map', v_maps,
    'deleted_created_rows', v_created,
    'deleted_id_map', v_maps
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO service_role;
