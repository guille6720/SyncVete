-- Data Import/Export Phase 42: optional per-attachment branch/staff metadata.
-- attachments_meta.csv (embedded in ZIP) maps external_patient_id+filename -> external_branch_id /
-- external_assigned_user_id. Empty -> session branch / importer user. Unmapped -> fails that row only.
-- Documentation-only migration; no schema change. Additive. Staging first.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 42: attachments_meta.csv gives per-file branch/staff mapping for ZIP attachment import.';
