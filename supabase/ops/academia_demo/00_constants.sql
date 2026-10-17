-- Academia Demo SyncVete — shared constants (documentation + copy/paste).
-- STAGING ONLY: owmcrqvnfubyjxrlyhlc
-- DO NOT EXECUTE against production (lhdksiptpsubktikdses).

-- Marker (organizations.settings) — server-validated; not name-based
--   academia_demo = true
--   academia_demo_key = 'sv-academia-demo-v1'

-- Deterministic public IDs (idempotent upserts)
--   org:     a0a0a0a0-d0e0-4000-8000-000000000001
--   branch:  a0a0a0a0-d0e0-4000-8000-000000000002
--   owner:   a0a0a0a0-d0e0-4000-8000-000000000003
--   patient: a0a0a0a0-d0e0-4000-8000-000000000004
--   professional: a0a0a0a0-d0e0-4000-8000-000000000005
--   appointments source_record_id: appt-1 .. appt-5

-- Auth emails (non-deliverable; Auth Admin API only)
--   owner.demo@academia-demo.invalid      role=owner
--   vet.demo@academia-demo.invalid        role=veterinarian
--   recepcion.demo@academia-demo.invalid   role=receptionist

-- Slug: academia-demo-syncvete
-- Branch code: DEMO
-- source_system for seed rows: academia_demo_seed

SELECT 'academia_demo constants — documentation only' AS notice;
