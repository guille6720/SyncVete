-- Data Import/Export Phase 3: specialty entities + chunked progress + attachment import.
-- Additive. Staging first. NO silent overwrites / cross-tenant access.

ALTER TABLE public.data_import_batches
  ADD COLUMN IF NOT EXISTS progress_processed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_total INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progress_message TEXT,
  ADD COLUMN IF NOT EXISTS chunk_size INT NOT NULL DEFAULT 50
    CHECK (chunk_size BETWEEN 1 AND 500);

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
    'attachments',
    'full_migration',
    'migration_zip'
  ));

COMMENT ON COLUMN public.data_import_batches.progress_processed IS
  'Real rows/files processed in the current import run (not a fake percentage).';
COMMENT ON COLUMN public.data_import_batches.progress_message IS
  'Human-readable progress for chunked imports.';
