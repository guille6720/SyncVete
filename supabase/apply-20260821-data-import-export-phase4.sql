-- Data Import/Export Phase 4: hospitalizations, per-row conflict decisions, queued imports.
-- Additive. Staging first. NO silent overwrites / cross-tenant access.

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
    AND t.relname = 'data_import_batches'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.data_import_batches DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.data_import_batches
  ADD CONSTRAINT data_import_batches_status_check
  CHECK (status IN (
    'draft',
    'uploaded',
    'mapping',
    'validating',
    'ready',
    'queued',
    'importing',
    'completed',
    'completed_with_warnings',
    'failed',
    'rolled_back',
    'cancelled'
  ));

ALTER TABLE public.data_import_batches
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_lock_token TEXT;

CREATE TABLE IF NOT EXISTS public.data_import_row_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.data_import_batches(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  row_number INT NOT NULL CHECK (row_number > 0),
  external_id TEXT,
  decision TEXT NOT NULL
    CHECK (decision IN ('create', 'link', 'skip', 'review')),
  link_internal_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (batch_id, entity_type, row_number)
);

CREATE INDEX IF NOT EXISTS idx_data_import_row_decisions_batch
  ON public.data_import_row_decisions (batch_id, entity_type);

ALTER TABLE public.data_import_row_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS data_import_row_decisions_select ON public.data_import_row_decisions;
DROP POLICY IF EXISTS data_import_row_decisions_write ON public.data_import_row_decisions;

CREATE POLICY data_import_row_decisions_select ON public.data_import_row_decisions
  FOR SELECT TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

CREATE POLICY data_import_row_decisions_write ON public.data_import_row_decisions
  FOR ALL TO authenticated
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('data:import')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_import_row_decisions TO authenticated;
GRANT ALL ON public.data_import_row_decisions TO service_role;

COMMENT ON TABLE public.data_import_row_decisions IS
  'Per-row create/link/skip decisions for import conflicts. Never auto-merges without an explicit decision.';
COMMENT ON COLUMN public.data_import_batches.queued_at IS
  'When the batch was queued for background chunk processing.';
