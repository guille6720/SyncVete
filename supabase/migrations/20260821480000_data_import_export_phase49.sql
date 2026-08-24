-- Data Import/Export Phase 49: focused single-entity JSON (parity with phase 48 ZIP).
-- Non-bundle JSON exports include only manifest + requested entity (+ companions /
-- specialty children). full_clinic / patient_clinical unchanged. Additive. Staging first.
-- Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 49: focused single-entity JSON (companions/specialty children; no empty clinic dump).';
