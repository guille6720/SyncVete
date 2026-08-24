-- Data Import/Export Phase 48: focused single-entity ZIP (no empty full-clinic dump).
-- Non-specialty / non-bundle ZIP exports only include the requested entity (+ companions:
-- cash_movements, invoice_items/payments, staff_memberships). full_clinic / patient_clinical
-- unchanged. Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 48: focused single-entity ZIP (companions only; no empty clinic dump).';
