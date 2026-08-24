-- Data Import / Export system (clinic tenant-scoped).
-- STAGING FIRST. Additive. Never auto-merges ambiguous duplicates.
-- Depends on foundation + clinical modules.

-- ─────────────────────────────────────────────
-- Permissions: data:import / data:export (owner + admin)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.user_role;
  custom_perms JSONB;
  role_perms TEXT[];
BEGIN
  SELECT bm.role, bm.permissions
  INTO user_role, custom_perms
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid()
    AND bm.deleted_at IS NULL
    AND bm.is_active = true
  ORDER BY bm.created_at ASC
  LIMIT 1;

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  IF custom_perms IS NOT NULL AND jsonb_array_length(custom_perms) > 0 THEN
    RETURN custom_perms ? required_permission;
  END IF;

  role_perms := CASE user_role
    WHEN 'owner' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export'
    ]
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;

  RETURN required_permission = ANY(role_perms);
END;
$$;

-- ─────────────────────────────────────────────
-- Import batches
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  import_type TEXT NOT NULL
    CHECK (import_type IN (
      'owners',
      'patients',
      'clinical_entries',
      'vaccinations',
      'full_migration'
    )),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'uploaded',
      'mapping',
      'validating',
      'ready',
      'importing',
      'completed',
      'completed_with_warnings',
      'failed',
      'rolled_back',
      'cancelled'
    )),
  source_filename TEXT,
  source_system TEXT,
  source_format TEXT
    CHECK (source_format IS NULL OR source_format IN ('csv', 'json', 'xlsx', 'zip')),
  date_locale TEXT NOT NULL DEFAULT 'es-AR'
    CHECK (date_locale IN ('es-AR', 'en-US', 'iso')),
  conflict_policy TEXT NOT NULL DEFAULT 'review'
    CHECK (conflict_policy IN ('create', 'link', 'skip', 'review')),
  dry_run BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ,
  rolled_back_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  total_records INT NOT NULL DEFAULT 0,
  imported_records INT NOT NULL DEFAULT 0,
  linked_records INT NOT NULL DEFAULT 0,
  skipped_records INT NOT NULL DEFAULT 0,
  warning_records INT NOT NULL DEFAULT 0,
  failed_records INT NOT NULL DEFAULT 0,
  storage_path TEXT,
  column_mapping JSONB NOT NULL DEFAULT '{}'::JSONB,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_org_created
  ON public.data_import_batches (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.data_import_batch_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.data_import_batches(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_number INT,
  entity_type TEXT NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  field_name TEXT,
  source_reference TEXT,
  severity TEXT NOT NULL DEFAULT 'error'
    CHECK (severity IN ('error', 'warning')),
  recommended_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_data_import_batch_errors_batch
  ON public.data_import_batch_errors (batch_id, severity);

CREATE TABLE IF NOT EXISTS public.data_import_created_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.data_import_batches(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (batch_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_data_import_created_rows_batch
  ON public.data_import_created_rows (batch_id, entity_type);

CREATE TABLE IF NOT EXISTS public.data_import_id_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.data_import_batches(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  internal_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (batch_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_data_import_id_map_lookup
  ON public.data_import_id_map (organization_id, entity_type, external_id);

-- ─────────────────────────────────────────────
-- Export jobs
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.data_export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  export_type TEXT NOT NULL
    CHECK (export_type IN (
      'owners',
      'patients',
      'clinical_entries',
      'patient_clinical',
      'full_clinic'
    )),
  format TEXT NOT NULL
    CHECK (format IN ('csv', 'json', 'xlsx', 'pdf', 'zip')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'expired')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  record_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  storage_path TEXT,
  download_filename TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_data_export_jobs_org_created
  ON public.data_export_jobs (organization_id, created_at DESC);

-- ─────────────────────────────────────────────
-- Provenance columns (additive)
-- ─────────────────────────────────────────────
ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clinical_entries
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.vaccinations
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_owners_import_batch ON public.owners (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patients_import_batch ON public.patients (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clinical_entries_import_batch ON public.clinical_entries (import_batch_id) WHERE import_batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_owners_source_record
  ON public.owners (organization_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_patients_source_record
  ON public.patients (organization_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────
ALTER TABLE public.data_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_batch_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_created_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_import_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_export_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_import_batches_select ON public.data_import_batches
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_batches_insert ON public.data_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_batches_update ON public.data_import_batches
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_errors_select ON public.data_import_batch_errors
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_errors_insert ON public.data_import_batch_errors
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_created_select ON public.data_import_created_rows
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_created_insert ON public.data_import_created_rows
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_created_delete ON public.data_import_created_rows
  FOR DELETE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_id_map_select ON public.data_import_id_map
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_id_map_insert ON public.data_import_id_map
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_export_jobs_select ON public.data_export_jobs
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:export')
  );

CREATE POLICY data_export_jobs_insert ON public.data_export_jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:export')
  );

CREATE POLICY data_export_jobs_update ON public.data_export_jobs
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:export')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:export')
  );

GRANT SELECT, INSERT, UPDATE ON public.data_import_batches TO authenticated;
GRANT SELECT, INSERT ON public.data_import_batch_errors TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.data_import_created_rows TO authenticated;
GRANT SELECT, INSERT ON public.data_import_id_map TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.data_export_jobs TO authenticated;

GRANT ALL ON public.data_import_batches TO service_role;
GRANT ALL ON public.data_import_batch_errors TO service_role;
GRANT ALL ON public.data_import_created_rows TO service_role;
GRANT ALL ON public.data_import_id_map TO service_role;
GRANT ALL ON public.data_export_jobs TO service_role;

-- ─────────────────────────────────────────────
-- Storage bucket for import uploads / export artifacts
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'data-migration',
  'data-migration',
  false,
  52428800,
  ARRAY[
    'text/csv',
    'text/plain',
    'application/json',
    'application/zip',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS data_migration_storage_select ON storage.objects;
DROP POLICY IF EXISTS data_migration_storage_insert ON storage.objects;
DROP POLICY IF EXISTS data_migration_storage_update ON storage.objects;
DROP POLICY IF EXISTS data_migration_storage_delete ON storage.objects;

CREATE POLICY data_migration_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'data-migration'
    AND (storage.foldername(name))[1] = public.get_user_organization_id()::TEXT
    AND (
      public.has_permission('data:import')
      OR public.has_permission('data:export')
    )
  );

CREATE POLICY data_migration_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'data-migration'
    AND (storage.foldername(name))[1] = public.get_user_organization_id()::TEXT
    AND (
      public.has_permission('data:import')
      OR public.has_permission('data:export')
    )
  );

CREATE POLICY data_migration_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'data-migration'
    AND (storage.foldername(name))[1] = public.get_user_organization_id()::TEXT
    AND (
      public.has_permission('data:import')
      OR public.has_permission('data:export')
    )
  );

CREATE POLICY data_migration_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'data-migration'
    AND (storage.foldername(name))[1] = public.get_user_organization_id()::TEXT
    AND public.has_permission('data:import')
  );

COMMENT ON TABLE public.data_import_batches IS
  'Clinic data import batches. Tenant-isolated. No silent overwrites.';
COMMENT ON TABLE public.data_export_jobs IS
  'Clinic data export jobs with expiring artifacts. Tenant-isolated.';
