-- Data Import/Export Phase 50 (milestone): attachments_meta.csv on export round-trip.
-- full_clinic / patient_clinical ZIP emit attachments_meta.csv for packed binaries
-- (phase 42 import sidecar). clinical_images focused ZIP includes meta catalog.
-- Cutover pack v4. Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 50: export attachments_meta.csv for ZIP round-trip; cutover pack v4.';
