-- Data Import/Export Phase 43: inventory_movements export-only (stock ledger history).
-- Read-only. Never imported (stock quantities stay derived from real operations, not migration).
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 43: inventory_movements export type (stock ledger audit trail), export-only, no import.';
