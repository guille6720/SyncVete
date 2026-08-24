-- Data Import/Export Phase 40: branch map parity (parse/upload + known internal UUIDs).
-- Format 1.5. Empty branch → session default. Unmapped → fail. Never creates branches silently.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 40: branch map upload + accept known internal branch UUIDs for round-trip; format 1.5.';
