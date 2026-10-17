-- STAGING ONLY — DO NOT RUN AGAINST PRODUCTION.
-- Project: owmcrqvnfubyjxrlyhlc (SyncVete-Staging)
-- Purpose: create an isolated fictional clinic for Academia demos.
-- Status: PREPARED / NOT EXECUTED (Phase 2 preflight).
--
-- Before running:
-- 1. Confirm session/project-ref is owmcrqvnfubyjxrlyhlc.
-- 2. Wrap in a transaction and review row counts.
-- 3. Prefer creating auth users via Auth Admin API (invite/createUser), then link profiles.
--
-- This script is a PLAN outline. Adjust column lists to match live staging schema
-- before any execution. Prefer additive inserts with a unique demo email domain
-- like @academia-demo.invalid so they never collide with real clinics.

BEGIN;

-- Example markers only — replace with real inserts after schema verification.
-- SELECT count(*) FROM public.organizations WHERE name ILIKE 'Academia Demo%';
-- INSERT INTO public.organizations (...) VALUES (... 'Academia Demo SyncVete', ...);
-- INSERT INTO public.branches (...);
-- Create auth.users via service role (not raw SQL) for:
--   owner.demo@academia-demo.invalid
--   vet.demo@academia-demo.invalid
--   recepcion.demo@academia-demo.invalid
-- Then profiles + branch_members with appointments:read/write as needed.
-- Insert fictional owners/patients only under that organization_id.
-- NEVER update/delete existing production-like clinic rows.

ROLLBACK; -- keep as ROLLBACK until an explicit staging apply is approved.
