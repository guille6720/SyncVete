-- Data Import/Export Phase 30 (milestone): owners/patients external_branch_id + format 1.3.
-- Completes multi-branch for core entities. Same rule: empty → default; unmapped → fail.
-- Additive. Staging first. Tenant-safe. No automatic plan changes.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 30 milestone: multi-branch complete for owners/patients + specialty; format 1.3.';
