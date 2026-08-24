-- Data Import/Export Phase 36: staff mapping on consultations, surgeries, hospitalizations.
-- Same map as phase 35. Empty external → importer user (clinical default). Unmapped → fail.
-- Never creates auth users. Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 36: clinical imports may map external_assigned_user_id (consultations/surgeries/hospitalizations).';
