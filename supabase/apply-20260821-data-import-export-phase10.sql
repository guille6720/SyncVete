-- Data Import/Export Phase 10: integrity snapshot + export concurrency helper.
-- Additive. Staging first. Tenant-safe RPCs only.

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

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'generated_at', timezone('utc', now()),
    'imports', v_imports,
    'exports', v_exports,
    'created_rows_tracked', v_created,
    'id_map_entries', v_maps
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_migration_integrity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO service_role;
