-- Data Import/Export Phase 35: optional external_assigned_user_id on appointments.
-- Resolves via staff map / existing org profile ids. Never creates auth users.
-- Additive. Staging first. Tenant-safe. App-driven (no schema type-check change).

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 35: appointments may map external_assigned_user_id via staff map (no auth import).';
