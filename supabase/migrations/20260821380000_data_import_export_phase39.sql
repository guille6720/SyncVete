-- Data Import/Export Phase 39: invoice staff map + cutover pack v3 (map templates).
-- Empty invoice staff → importer. Unmapped → fail. Never creates auth users / never touches plans or caja.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 39: invoice created_by via staff map; cutover pack v3 includes staff/branch map templates.';
