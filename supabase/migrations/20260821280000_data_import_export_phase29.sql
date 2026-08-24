-- Data Import/Export Phase 29: audit_logs export. EXPORT ONLY.
-- No import of audit logs (immutable history; never rewrite audit trail).
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
    'cash_sessions',
    'reminder_logs',
    'whatsapp_messages',
    'audit_logs',
    'branches',
    'patient_clinical',
    'full_clinic'
  ));

COMMENT ON CONSTRAINT data_export_jobs_export_type_check ON public.data_export_jobs IS
  'Phase 29: audit_logs export-only. No audit import (immutable trail).';
