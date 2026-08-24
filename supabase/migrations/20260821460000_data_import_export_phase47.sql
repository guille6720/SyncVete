-- Data Import/Export Phase 47: specialty ZIP child parity (lab_order_items + prescription_items).
-- Completes Phase 45 pattern: specialty ZIP for lab_orders/prescriptions includes parent CSV +
-- child CSV/JSON (same as hospitalizations + notes). Surgeries specialty ZIP gets parent CSV.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 47: specialty ZIP includes lab/rx child items (+ surgeries parent CSV); export-only children.';
