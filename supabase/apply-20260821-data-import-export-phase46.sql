-- Data Import/Export Phase 46: clinical_images metadata catalog (export-only).
-- Inventario de adjuntos clínicos (CSV/JSON/XLSX + full_clinic ZIP) sin binarios.
-- Also widens data_export_jobs.export_type check to include inventory_movements (phase 43)
-- and clinical_images. Never imported as rows — file import stays via attachments ZIP.
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
    'inventory_movements',
    'clinical_images',
    'reminder_logs',
    'whatsapp_messages',
    'audit_logs',
    'notifications',
    'staff_profiles',
    'branches',
    'patient_clinical',
    'full_clinic'
  ));

COMMENT ON CONSTRAINT data_export_jobs_export_type_check ON public.data_export_jobs IS
  'Phase 46: clinical_images metadata export-only + inventory_movements (phase 43). No attachment-row import.';

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 46: clinical_images metadata catalog export-only; export_type check includes inventory_movements.';
