-- Data Import/Export Phase 25: complete external_branch_id for remaining specialty imports.
-- Covers clinical_entries, vaccinations, lab_orders, surgeries, prescriptions, hospitalizations.
-- Same rule as phase 23: empty → default branch; unmapped → fail row (no silent fallback).
-- Additive. Staging first. Tenant-safe. No schema type-check changes required.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 25: multi-branch specialty complete (clinical/vaccines/lab/surgery/rx/hosp + prior entities).';
