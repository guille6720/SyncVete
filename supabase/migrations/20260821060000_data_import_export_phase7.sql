-- Data Import/Export Phase 7: idempotency indexes + superadmin read-only stats.
-- Additive. Staging first. No cross-tenant writes from clinic roles.

CREATE INDEX IF NOT EXISTS idx_owners_org_source_record
  ON public.owners (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patients_org_source_record
  ON public.patients (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinical_entries_org_source_record
  ON public.clinical_entries (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vaccinations_org_source_record
  ON public.vaccinations (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_orders_org_source_record
  ON public.lab_orders (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_surgeries_org_source_record
  ON public.surgeries (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_org_source_record
  ON public.prescriptions (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hospitalizations_org_source_record
  ON public.hospitalizations (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_record_id IS NOT NULL
    AND source_system IS NOT NULL;

ALTER TABLE public.data_import_batches
  ADD COLUMN IF NOT EXISTS idempotency_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (idempotency_mode IN ('off', 'skip_existing_source'));

COMMENT ON COLUMN public.data_import_batches.idempotency_mode IS
  'off = always attempt create (subject to conflict decisions). skip_existing_source = skip rows whose source_system+source_record_id already exist in the tenant.';

CREATE OR REPLACE FUNCTION public.superadmin_org_data_migration_stats(p_organization_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_imports JSONB;
  v_exports JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_imports
  FROM (
    SELECT
      id,
      import_type,
      status,
      source_filename,
      source_system,
      imported_records,
      failed_records,
      linked_records,
      skipped_records,
      warning_records,
      progress_message,
      idempotency_mode,
      created_at,
      completed_at,
      queued_at
    FROM public.data_import_batches
    WHERE organization_id = p_organization_id
    ORDER BY created_at DESC
    LIMIT 25
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_exports
  FROM (
    SELECT
      id,
      export_type,
      format,
      status,
      record_counts,
      download_filename,
      progress_message,
      date_from,
      date_to,
      created_at,
      completed_at,
      expires_at,
      storage_path IS NOT NULL AS has_artifact
    FROM public.data_export_jobs
    WHERE organization_id = p_organization_id
    ORDER BY created_at DESC
    LIMIT 25
  ) t;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'imports', v_imports,
    'exports', v_exports,
    'import_totals', (
      SELECT jsonb_build_object(
        'batches', COUNT(*),
        'imported_records', COALESCE(SUM(imported_records), 0),
        'failed_records', COALESCE(SUM(failed_records), 0),
        'queued', COUNT(*) FILTER (WHERE status IN ('queued', 'importing'))
      )
      FROM public.data_import_batches
      WHERE organization_id = p_organization_id
    ),
    'export_totals', (
      SELECT jsonb_build_object(
        'jobs', COUNT(*),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'queued', COUNT(*) FILTER (WHERE status IN ('queued', 'running'))
      )
      FROM public.data_export_jobs
      WHERE organization_id = p_organization_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_org_data_migration_stats(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_org_data_migration_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_org_data_migration_stats(UUID) TO service_role;
