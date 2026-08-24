-- Data Import/Export Phase 18: invoices import + provenance + integrity/prune.
-- Additive. Staging first. Tenant-safe. Items only (no payment rows / no caja).

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
    'inventory_products',
    'invoices',
    'attachments',
    'full_migration',
    'migration_zip'
  ));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_org_source_unique
  ON public.invoices (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_system IS NOT NULL
    AND btrim(source_system) <> ''
    AND source_record_id IS NOT NULL
    AND btrim(source_record_id) <> '';

CREATE INDEX IF NOT EXISTS idx_invoices_import_batch
  ON public.invoices (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Integrity orphans: inventory + invoices.
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
      'owners', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.owners o ON o.id = c.entity_id AND o.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'owners' AND o.id IS NULL),
      'patients', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.patients p ON p.id = c.entity_id AND p.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'patients' AND p.id IS NULL),
      'clinical_entries', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.clinical_entries e ON e.id = c.entity_id AND e.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'clinical_entries' AND e.id IS NULL),
      'vaccinations', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.vaccinations v ON v.id = c.entity_id AND v.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'vaccinations' AND v.id IS NULL),
      'lab_orders', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.lab_orders l ON l.id = c.entity_id AND l.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'lab_orders' AND l.id IS NULL),
      'surgeries', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.surgeries s ON s.id = c.entity_id AND s.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'surgeries' AND s.id IS NULL),
      'prescriptions', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.prescriptions r ON r.id = c.entity_id AND r.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'prescriptions' AND r.id IS NULL),
      'hospitalizations', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.hospitalizations h ON h.id = c.entity_id AND h.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'hospitalizations' AND h.id IS NULL),
      'appointments', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.appointments a ON a.id = c.entity_id AND a.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'appointments' AND a.id IS NULL),
      'inventory_products', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.inventory_products i ON i.id = c.entity_id AND i.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'inventory_products' AND i.id IS NULL),
      'invoices', (SELECT COUNT(*) FROM public.data_import_created_rows c LEFT JOIN public.invoices inv ON inv.id = c.entity_id AND inv.organization_id = c.organization_id WHERE c.organization_id = v_org AND c.entity_type = 'invoices' AND inv.id IS NULL)
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
      'inventory_products', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.inventory_products i ON i.id = m.internal_id AND i.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'inventory_products' AND i.id IS NULL),
      'invoices', (SELECT COUNT(*) FROM public.data_import_id_map m LEFT JOIN public.invoices inv ON inv.id = m.internal_id AND inv.organization_id = m.organization_id WHERE m.organization_id = v_org AND m.entity_type = 'invoices' AND inv.id IS NULL)
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
        OR (c.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = c.entity_id AND i.organization_id = v_org))
        OR (c.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = c.entity_id AND inv.organization_id = v_org))
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
        OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
        OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
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
      (c.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = c.entity_id AND o.organization_id = v_org))
      OR (c.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = c.entity_id AND p.organization_id = v_org))
      OR (c.entity_type = 'clinical_entries' AND NOT EXISTS (SELECT 1 FROM public.clinical_entries e WHERE e.id = c.entity_id AND e.organization_id = v_org))
      OR (c.entity_type = 'vaccinations' AND NOT EXISTS (SELECT 1 FROM public.vaccinations v WHERE v.id = c.entity_id AND v.organization_id = v_org))
      OR (c.entity_type = 'lab_orders' AND NOT EXISTS (SELECT 1 FROM public.lab_orders l WHERE l.id = c.entity_id AND l.organization_id = v_org))
      OR (c.entity_type = 'surgeries' AND NOT EXISTS (SELECT 1 FROM public.surgeries s WHERE s.id = c.entity_id AND s.organization_id = v_org))
      OR (c.entity_type = 'prescriptions' AND NOT EXISTS (SELECT 1 FROM public.prescriptions r WHERE r.id = c.entity_id AND r.organization_id = v_org))
      OR (c.entity_type = 'hospitalizations' AND NOT EXISTS (SELECT 1 FROM public.hospitalizations h WHERE h.id = c.entity_id AND h.organization_id = v_org))
      OR (c.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = c.entity_id AND a.organization_id = v_org))
      OR (c.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = c.entity_id AND i.organization_id = v_org))
      OR (c.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = c.entity_id AND inv.organization_id = v_org))
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
      OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
      OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
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

-- Checklist: invoices import is available.
CREATE OR REPLACE FUNCTION public.own_data_migration_checklist()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_items JSONB := '[]'::jsonb;
  v_owners INT;
  v_patients INT;
  v_appts INT;
  v_vacc_due INT;
  v_hosp INT;
  v_inv INT;
  v_invoices INT;
  v_open_balance NUMERIC;
  v_orphans INT;
  v_stuck INT;
  v_failed INT;
  v_completed INT;
  v_score INT := 0;
  v_total INT := 0;
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

  SELECT COUNT(*) INTO v_owners
  FROM public.owners WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_patients
  FROM public.patients WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COUNT(*) INTO v_appts
  FROM public.appointments
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND starts_at >= timezone('utc', now())
    AND starts_at < timezone('utc', now()) + interval '30 days';

  SELECT COUNT(*) INTO v_vacc_due
  FROM public.vaccinations
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND next_due_at IS NOT NULL
    AND next_due_at::date >= (timezone('utc', now()))::date
    AND next_due_at::date <= (timezone('utc', now()) + interval '90 days')::date;

  SELECT COUNT(*) INTO v_hosp
  FROM public.hospitalizations
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND status IN ('internado', 'observacion');

  SELECT COUNT(*) INTO v_inv
  FROM public.inventory_products
  WHERE organization_id = v_org AND deleted_at IS NULL AND is_active;

  SELECT COUNT(*) INTO v_invoices
  FROM public.invoices
  WHERE organization_id = v_org AND deleted_at IS NULL;

  SELECT COALESCE(SUM(balance), 0) INTO v_open_balance
  FROM public.invoices
  WHERE organization_id = v_org
    AND deleted_at IS NULL
    AND status IN ('emitida', 'borrador')
    AND balance > 0;

  SELECT COUNT(*) INTO v_orphans
  FROM public.data_import_id_map m
  WHERE m.organization_id = v_org
    AND (
      (m.entity_type = 'owners' AND NOT EXISTS (SELECT 1 FROM public.owners o WHERE o.id = m.internal_id AND o.organization_id = v_org))
      OR (m.entity_type = 'patients' AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = m.internal_id AND p.organization_id = v_org))
      OR (m.entity_type = 'appointments' AND NOT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = m.internal_id AND a.organization_id = v_org))
      OR (m.entity_type = 'inventory_products' AND NOT EXISTS (SELECT 1 FROM public.inventory_products i WHERE i.id = m.internal_id AND i.organization_id = v_org))
      OR (m.entity_type = 'invoices' AND NOT EXISTS (SELECT 1 FROM public.invoices inv WHERE inv.id = m.internal_id AND inv.organization_id = v_org))
    );

  SELECT
    (
      SELECT COUNT(*) FROM public.data_import_batches b
      WHERE b.organization_id = v_org
        AND b.status IN ('queued', 'importing')
        AND b.worker_locked_at IS NOT NULL
        AND b.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    ) + (
      SELECT COUNT(*) FROM public.data_export_jobs j
      WHERE j.organization_id = v_org
        AND j.status IN ('queued', 'running')
        AND j.worker_locked_at IS NOT NULL
        AND j.worker_locked_at < timezone('utc', now()) - interval '30 minutes'
    )
  INTO v_stuck;

  SELECT COUNT(*) INTO v_failed
  FROM public.data_import_batches
  WHERE organization_id = v_org
    AND status = 'failed'
    AND created_at >= timezone('utc', now()) - interval '7 days';

  SELECT COUNT(*) INTO v_completed
  FROM public.data_import_batches
  WHERE organization_id = v_org
    AND status IN ('completed', 'completed_with_warnings');

  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'owners',
    'label', 'Propietarios activos',
    'status', CASE WHEN v_owners > 0 THEN 'ok' ELSE 'fail' END,
    'count', v_owners,
    'detail', CASE WHEN v_owners > 0 THEN 'Hay tutores en el tenant' ELSE 'No hay propietarios importados/creados' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'patients',
    'label', 'Pacientes activos',
    'status', CASE WHEN v_patients > 0 THEN 'ok' ELSE 'fail' END,
    'count', v_patients,
    'detail', CASE WHEN v_patients > 0 THEN 'Hay pacientes en el tenant' ELSE 'No hay pacientes' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'appointments_next_30d',
    'label', 'Citas próximos 30 días',
    'status', CASE WHEN v_appts > 0 THEN 'ok' WHEN v_completed > 0 THEN 'warn' ELSE 'warn' END,
    'count', v_appts,
    'detail', 'Agenda operativa inmediata post cutover'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'vaccinations_due_90d',
    'label', 'Vacunas con próximo vencimiento (90d)',
    'status', CASE WHEN v_vacc_due > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_vacc_due,
    'detail', 'Útil para recordatorios y controles'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'active_hospitalizations',
    'label', 'Internaciones activas',
    'status', 'ok',
    'count', v_hosp,
    'detail', 'Informativo: pacientes internados ahora'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'inventory_products',
    'label', 'Productos de inventario activos',
    'status', CASE WHEN v_inv > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_inv,
    'detail', 'Stock/farmacia listo para el día a día'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'invoices',
    'label', 'Facturas registradas',
    'status', CASE WHEN v_invoices > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_invoices,
    'detail', 'Histórico comercial importable (ítems; sin pagos/caja)'
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'open_invoice_balance',
    'label', 'Saldo abierto en facturas',
    'status', CASE WHEN v_open_balance = 0 THEN 'ok' ELSE 'warn' END,
    'count', ROUND(v_open_balance)::INT,
    'detail', CASE
      WHEN v_open_balance = 0 THEN 'Sin saldos pendientes relevantes'
      ELSE 'Hay saldos abiertos; revisá cobranzas antes/después del cutover'
    END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'orphan_id_map',
    'label', 'Mapas id-map huérfanos (owners/patients/citas/inventario/facturas)',
    'status', CASE WHEN v_orphans = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_orphans,
    'detail', CASE WHEN v_orphans = 0 THEN 'Sin huérfanos detectados' ELSE 'Revisá poda de huérfanos' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'stuck_locks',
    'label', 'Locks de workers trabados',
    'status', CASE WHEN v_stuck = 0 THEN 'ok' ELSE 'fail' END,
    'count', v_stuck,
    'detail', CASE WHEN v_stuck = 0 THEN 'Sin locks stale' ELSE 'Liberá locks antes del go-live' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'failed_imports_7d',
    'label', 'Imports fallidos (7 días)',
    'status', CASE WHEN v_failed = 0 THEN 'ok' ELSE 'warn' END,
    'count', v_failed,
    'detail', CASE WHEN v_failed = 0 THEN 'Sin fallos recientes' ELSE 'Revisá errores CSV / reintentos' END
  ));
  v_items := v_items || jsonb_build_array(jsonb_build_object(
    'key', 'completed_imports',
    'label', 'Lotes de import completados',
    'status', CASE WHEN v_completed > 0 THEN 'ok' ELSE 'warn' END,
    'count', v_completed,
    'detail', 'Historial de migraciones aplicadas'
  ));

  SELECT COUNT(*) INTO v_total FROM jsonb_array_elements(v_items);
  SELECT COUNT(*) INTO v_score
  FROM jsonb_array_elements(v_items) AS e(item)
  WHERE e.item->>'status' = 'ok';

  RETURN jsonb_build_object(
    'organization_id', v_org,
    'generated_at', timezone('utc', now()),
    'score_ok', v_score,
    'score_total', v_total,
    'ready_for_golive', (
      v_owners > 0 AND v_patients > 0 AND v_stuck = 0
    ),
    'items', v_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_migration_integrity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_integrity() TO service_role;
REVOKE ALL ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_prune_orphan_migration_maps(BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.own_data_migration_checklist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_checklist() TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_checklist() TO service_role;
