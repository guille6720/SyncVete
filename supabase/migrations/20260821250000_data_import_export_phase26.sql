-- Data Import/Export Phase 26: cutover freeze pack (app bundles integrity + checklist + billing).
-- No new tables. Additive. Staging first. Tenant-safe.
-- Download is read-only; never mutates data or plans.

COMMENT ON FUNCTION public.own_data_migration_integrity() IS
  'Phase 26: included in cutover pack ZIP (integrity.csv + checklist + billing reconcile).';
