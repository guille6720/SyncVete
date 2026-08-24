-- Data Import/Export Phase 5: specialty exports, date-range filters, queued export progress.
-- Additive. Staging first. Tenant-isolated.

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
    'patient_clinical',
    'full_clinic'
  ));

ALTER TABLE public.data_export_jobs
  ADD COLUMN IF NOT EXISTS date_from DATE,
  ADD COLUMN IF NOT EXISTS date_to DATE,
  ADD COLUMN IF NOT EXISTS progress_message TEXT,
  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS worker_lock_token TEXT;

COMMENT ON COLUMN public.data_export_jobs.date_from IS
  'Inclusive lower bound for specialty/clinical date filters (UTC date).';
COMMENT ON COLUMN public.data_export_jobs.date_to IS
  'Inclusive upper bound for specialty/clinical date filters (UTC date).';
