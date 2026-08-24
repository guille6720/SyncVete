-- Data Import/Export Phase 31: cutover pack v2 (export catalog + freeze recommendations).
-- App-only enrichment of cutover ZIP. Additive. Staging first. Tenant-safe. Read-only.

COMMENT ON FUNCTION public.own_data_migration_integrity() IS
  'Phase 31: cutover pack v2 adds export_catalog.csv and freeze_recommendations.csv.';
