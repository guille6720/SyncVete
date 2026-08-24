-- Data Import/Export Phase 41: full round-trip readiness in sample ZIP + guided step map hints.
-- Documentation-only migration; no schema change. Additive. Staging first.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 41: sample migration ZIP ships staff_map/branch_map templates + roundtrip notes; guided steps flag branch/staff usage.';
