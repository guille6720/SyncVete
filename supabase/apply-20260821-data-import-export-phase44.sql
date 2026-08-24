-- Data Import/Export Phase 44: hospitalization_notes bundled export (progress notes / evolución).
-- Read-only companion to hospitalizations export (single-entity + full_clinic bundle). Never imported
-- standalone (hospitalizations import stays admission-only; notes are entered live post-import).
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 44: hospitalization_notes bundled into hospitalizations/full_clinic export (JSON + ZIP), export-only.';
