-- Data Import/Export Phase 38: round-trip staff/branch IDs in exports + payments staff map.
-- Format 1.4. Empty payment staff → importer. Unmapped → fail. Never creates auth users.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 38: export external_branch_id + external_assigned_user_id for round-trip; payments staff map; format 1.4.';
