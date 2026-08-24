-- Data Import/Export Phase 16: inventory products import + provenance + integrity/prune.
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
    'inventory_products',
    'attachments',
    'full_migration',
    'migration_zip'
  ));

ALTER TABLE public.inventory_products
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_org_source_unique
  ON public.inventory_products (organization_id, source_system, source_record_id)
  WHERE deleted_at IS NULL
    AND source_system IS NOT NULL
    AND btrim(source_system) <> ''
    AND source_record_id IS NOT NULL
    AND btrim(source_record_id) <> '';

CREATE INDEX IF NOT EXISTS idx_inventory_products_import_batch
  ON public.inventory_products (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

-- Refresh prune coverage to include inventory_products.
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
