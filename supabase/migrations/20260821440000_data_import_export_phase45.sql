-- Data Import/Export Phase 45: hospitalization_notes export parity.
-- Completes Phase 44: single-entity CSV/XLSX flattens notes; JSON body includes
-- hospitalizationNotes; specialty ZIP includes notes CSV+JSON. Never imported.
-- Additive. Staging first. Tenant-safe.

COMMENT ON FUNCTION public.own_data_migration_checklist() IS
  'Phase 45: hospitalization_notes parity (CSV flatten, JSON body, specialty ZIP); export-only.';
