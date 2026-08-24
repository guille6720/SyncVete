-- Data Import/Export Phase 2: specialty provenance + attachment-ready export support.
-- Additive. Staging first. Still NO cross-tenant exposure / silent overwrites.

ALTER TABLE public.clinical_images
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.surgeries
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.lab_orders
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.hospitalizations
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.data_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS original_professional_name TEXT,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Allow richer import types for phase 2 specialty packs.
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
    'full_migration',
    'migration_zip'
  ));

CREATE INDEX IF NOT EXISTS idx_clinical_images_import_batch
  ON public.clinical_images (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

COMMENT ON COLUMN public.clinical_images.import_batch_id IS
  'Import provenance for migrated clinical attachments. Never auto-changes clinical content.';
