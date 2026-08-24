-- Data Import/Export Phase 21: consultations export + import + provenance.
-- Additive. Staging first. Tenant-safe.

DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'data_import_batches'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%import_type%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.data_import_batches DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.data_import_batches
  ADD CONSTRAINT data_import_batches_import_type_check
  CHECK (import_type IN (
    'owners',
    'patients',
    'clinical_entries',
    'vaccinations',
    'lab_orders',
    'surgeries',
    'prescriptions',
    'hospitalizations',
    'appointments',
    'consultations',
    'inventory_products',
    'invoices',
    'payments',
    'attachments',
    'full_migration',
    'migration_zip'
  ));

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
    'consultations',
    'inventory_products',
    'invoices',
    'payments',
    'patient_clinical',
    'full_clinic'
  ));

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_org_source_unique
  ON public.consultations (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_system IS NOT NULL
    AND btrim(source_system) <> ''
    AND source_record_id IS NOT NULL
    AND btrim(source_record_id) <> '';

CREATE INDEX IF NOT EXISTS idx_consultations_import_batch
  ON public.consultations (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

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

  SELECT COUNT(*) INTO v_created FROM public.data_import_created_rows WHERE organization_id = v_org;
  SELECT COUNT(*) INTO v_maps FROM public.data_import_id_map WHERE organization_id = v_org;

  SELECT jsonb_build_object(
    'created_rows', jsonb_build_object(
      'owners', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.owners o ON o.id = c.entity_id AND o.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'owners' AND o.id IS NULL),
      'patients', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.patients p ON p.id = c.entity_id AND p.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'patients' AND p.id IS NULL),
      'clinical_entries', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.clinical_entries e ON e.id = c.entity_id AND e.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'clinical_entries' AND e.id IS NULL),
      'vaccinations', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.vaccinations v ON v.id = c.entity_id AND v.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'vaccinations' AND v.id IS NULL),
      'lab_orders', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.lab_orders l ON l.id = c.entity_id AND l.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'lab_orders' AND l.id IS NULL),
      'surgeries', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.surgeries s ON s.id = c.entity_id AND s.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'surgeries' AND s.id IS NULL),
      'prescriptions', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.prescriptions r ON r.id = c.entity_id AND r.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'prescriptions' AND r.id IS NULL),
      'hospitalizations', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.hospitalizations h ON h.id = c.entity_id AND h.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'hospitalizations' AND h.id IS NULL),
      'appointments', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.appointments a ON a.id = c.entity_id AND a.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'appointments' AND a.id IS NULL),
      'consultations', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.consultations x ON x.id = c.entity_id AND x.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'consultations' AND x.id IS NULL),
      'inventory_products', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.inventory_products i ON i.id = c.entity_id AND i.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'inventory_products' AND i.id IS NULL),
      'invoices', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.invoices inv ON inv.id = c.entity_id AND inv.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'invoices' AND inv.id IS NULL),
      'payments', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.payments p ON p.id = c.entity_id AND p.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'payments' AND p.id IS NULL)
    ),
    'id_map', jsonb_build_object(
      'owners', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.owners o ON o.id = m.internal_id AND o.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'owners' AND o.id IS NULL),
      'patients', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.patients p ON p.id = m.internal_id AND p.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'patients' AND p.id IS NULL),
      'clinical_entries', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.clinical_entries e ON e.id = m.internal_id AND e.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'clinical_entries' AND e.id IS NULL),
      'vaccinations', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.vaccinations v ON v.id = m.internal_id AND v.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'vaccinations' AND v.id IS NULL),
      'lab_orders', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.lab_orders l ON l.id = m.internal_id AND l.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'lab_orders' AND l.id IS NULL),
      'surgeries', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.surgeries s ON s.id = m.internal_id AND s.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'surgeries' AND s.id IS NULL),
      'prescriptions', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.prescriptions r ON r.id = m.internal_id AND r.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'prescriptions' AND r.id IS NULL),
      'hospitalizations', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.hospitalizations h ON h.id = m.internal_id AND h.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'hospitalizations' AND h.id IS NULL),
      'appointments', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.appointments a ON a.id = m.internal_id AND a.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'appointments' AND a.id IS NULL),
      'consultations', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.consultations x ON x.id = m.internal_id AND x.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'consultations' AND x.id IS NULL),
      'inventory_products', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.inventory_products i ON i.id = m.internal_id AND i.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'inventory_products' AND i.id IS NULL),
      'invoices', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.invoices inv ON inv.id = m.internal_id AND inv.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'invoices' AND inv.id IS NULL),
      'payments', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.payments p ON p.id = m.internal_id AND p.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'payments' AND p.id IS NULL)
    )
  )
  INTO v_orphans;

  SELECT jsonb_build_object(
    'imports', (
      SELECT COUNT(*) FROM public.data_import_batches b
      WHERE b.organization_id = v_org AND b.status IN ('queued', 'importing')
        AND b.worker_locked_at IS NOT NULL
        AND b.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    ),
    'exports', (
      SELECT COUNT(*) FROM public.data_export_jobs j
      WHERE j.organization_id = v_org AND j.status IN ('queued', 'running')
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
        (c.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = c.entity_id AND o.organization_id = v_org))
        OR (c.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = c.entity_id AND p.organization_id = v_org))
        OR (c.entity_type = 'clinical_entries' AND NOT EXISTS (SELECT 1 FROM public.clinical_entries e WHERE e.id = c.entity_id AND e.organization_id = v_org))
        OR (c.entity_type = 'vaccinations' AND NOT EXISTS (SELECT 1 FROM public.vaccinations v WHERE v.id = c.entity_id AND v.organization_id = v_org))
        OR (c.entity_type = 'lab_orders' AND NOT EXISTS (SELECT 1 FROM public.lab_orders l WHERE l.id = c.entity_id AND l.organization_id = v_org))
        OR (c.entity_type = 'surgeries' AND NOT EXISTS (SELECT 1 FROM public.surgeries s WHERE s.id = c.entity_id AND s.organization_id = v_org))
        OR (c.entity_type = 'prescriptions' AND NOT EXISTS (SELECT 1 FROM public.prescriptions r WHERE r.id = c.entity_id AND r.organization_id = v_org))
        OR (c.entity_type = 'hospitalizations' AND NOT EXISTS (SELECT 1 FROM public.hospitalizations h WHERE h.id = c.entity_id AND h.organization_id = v_org))
        OR (c.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = c.entity_id AND a.organization_id = v_org))
        OR (c.entity_type = 'consultations' AND NOT EXISTS (SELECT 1 FROM public.consultations x WHERE x.id = c.entity_id AND x.organization_id = v_org))
        OR (c.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = c.entity_id AND i.organization_id = v_org))
        OR (c.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = c.entity_id AND inv.organization_id = v_org))
        OR (c.entity_type = 'payments' AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = c.entity_id AND p.organization_id = v_org))
      );

    SELECT COUNT(*) INTO v_maps
    FROM public.data_import_id_map m
    WHERE m.organization_id = v_org
      AND (
        (m.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org))
        OR (m.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org))
        OR (m.entity_type = 'clinical_entries' AND NOT EXISTS (SELECT 1 FROM public.clinical_entries e WHERE e.id = m.internal_id AND e.organization_id = v_org))
        OR (m.entity_type = 'vaccinations' AND NOT EXISTS (SELECT 1 FROM public.vaccinations v WHERE v.id = m.internal_id AND v.organization_id = v_org))
        OR (m.entity_type = 'lab_orders' AND NOT EXISTS (SELECT 1 FROM public.lab_orders l WHERE l.id = m.internal_id AND l.organization_id = v_org))
        OR (m.entity_type = 'surgeries' AND NOT EXISTS (SELECT 1 FROM public.surgeries s WHERE s.id = m.internal_id AND s.organization_id = v_org))
        OR (m.entity_type = 'prescriptions' AND NOT EXISTS (SELECT 1 FROM public.prescriptions r WHERE r.id = m.internal_id AND r.organization_id = v_org))
        OR (m.entity_type = 'hospitalizations' AND NOT EXISTS (SELECT 1 FROM public.hospitalizations h WHERE h.id = m.internal_id AND h.organization_id = v_org))
        OR (m.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = m.internal_id AND a.organization_id = v_org))
        OR (m.entity_type = 'consultations' AND NOT EXISTS (SELECT 1 FROM public.consultations x WHERE x.id = m.internal_id AND x.organization_id = v_org))
        OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
        OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
        OR (m.entity_type = 'payments' AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = m.internal_id AND p.organization_id = v_org))
      );

    RETURN jsonb_build_object(
      'organization_id', v_org, 'dry_run', true,
      'orphan_created_rows', v_created, 'orphan_id_map', v_maps,
      'deleted_created_rows', 0, 'deleted_id_map', 0
    );
  END IF;

  DELETE FROM public.data_import_created_rows c
  WHERE c.organization_id = v_org
    AND (
      (c.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = c.entity_id AND o.organization_id = v_org))
      OR (c.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = c.entity_id AND p.organization_id = v_org))
      OR (c.entity_type = 'clinical_entries' AND NOT EXISTS (SELECT 1 FROM public.clinical_entries e WHERE e.id = c.entity_id AND e.organization_id = v_org))
      OR (c.entity_type = 'vaccinations' AND NOT EXISTS (SELECT 1 FROM public.vaccinations v WHERE v.id = c.entity_id AND v.organization_id = v_org))
      OR (c.entity_type = 'lab_orders' AND NOT EXISTS (SELECT 1 FROM public.lab_orders l WHERE l.id = c.entity_id AND l.organization_id = v_org))
      OR (c.entity_type = 'surgeries' AND NOT EXISTS (SELECT 1 FROM public.surgeries s WHERE s.id = c.entity_id AND s.organization_id = v_org))
      OR (c.entity_type = 'prescriptions' AND NOT EXISTS (SELECT 1 FROM public.prescriptions r WHERE r.id = c.entity_id AND r.organization_id = v_org))
      OR (c.entity_type = 'hospitalizations' AND NOT EXISTS (SELECT 1 FROM public.hospitalizations h WHERE h.id = c.entity_id AND h.organization_id = v_org))
      OR (c.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = c.entity_id AND a.organization_id = v_org))
      OR (c.entity_type = 'consultations' AND NOT EXISTS (SELECT 1 FROM public.consultations x WHERE x.id = c.entity_id AND x.organization_id = v_org))
      OR (c.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = c.entity_id AND i.organization_id = v_org))
      OR (c.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = c.entity_id AND inv.organization_id = v_org))
      OR (c.entity_type = 'payments' AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = c.entity_id AND p.organization_id = v_org))
    );
  GET DIAGNOSTICS v_created = ROW_COUNT;

  DELETE FROM public.data_import_id_map m
  WHERE m.organization_id = v_org
    AND (
      (m.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org))
      OR (m.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org))
      OR (m.entity_type = 'clinical_entries' AND NOT EXISTS (SELECT 1 FROM public.clinical_entries e WHERE e.id = m.internal_id AND e.organization_id = v_org))
      OR (m.entity_type = 'vaccinations' AND NOT EXISTS (SELECT 1 FROM public.vaccinations v WHERE v.id = m.internal_id AND v.organization_id = v_org))
      OR (m.entity_type = 'lab_orders' AND NOT EXISTS (SELECT 1 FROM public.lab_orders l WHERE l.id = m.internal_id AND l.organization_id = v_org))
      OR (m.entity_type = 'surgeries' AND NOT EXISTS (SELECT 1 FROM public.surgeries s WHERE s.id = m.internal_id AND s.organization_id = v_org))
      OR (m.entity_type = 'prescriptions' AND NOT EXISTS (SELECT 1 FROM public.prescriptions r WHERE r.id = m.internal_id AND r.organization_id = v_org))
      OR (m.entity_type = 'hospitalizations' AND NOT EXISTS (SELECT 1 FROM public.hospitalizations h WHERE h.id = m.internal_id AND h.organization_id = v_org))
      OR (m.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = m.internal_id AND a.organization_id = v_org))
      OR (m.entity_type = 'consultations' AND NOT EXISTS (SELECT 1 FROM public.consultations x WHERE x.id = m.internal_id AND x.organization_id = v_org))
      OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
      OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
      OR (m.entity_type = 'payments' AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.id = m.internal_id AND p.organization_id = v_org))
    );
  GET DIAGNOSTICS v_maps = ROW_COUNT;

  RETURN jsonb_build_object(
    'organization_id', v_org, 'dry_run', false,
    'orphan_created_rows', v_created, 'orphan_id_map', v_maps,
    'deleted_created_rows', v_created, 'deleted_id_map', v_maps
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_migration_integrity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO service_role;
REVOKE ALL ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO service_role;
