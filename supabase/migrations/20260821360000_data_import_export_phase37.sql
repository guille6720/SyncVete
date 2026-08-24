-- Data Import/Export Phase 37: complete staff mapping (lab, prescriptions, vaccinations, clinical).
-- Empty external → importer user. Unmapped → fail. Never creates auth users.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 37: staff map complete for lab/rx/vaccinations/clinical (+ prior clinical entities).';
