-- STAGING ONLY — owmcrqvnfubyjxrlyhlc
-- Academia Demo SyncVete seed OUTLINE.
-- DO NOT EXECUTE until authorized. Ends in ROLLBACK.

BEGIN;

-- 1) Guard: refuse if not staging-shaped session (manual check).
-- SELECT current_database(), current_setting('request.jwt.claim.role', true);

-- 2) Organization (additive)
-- INSERT INTO public.organizations (id, name, ...)
-- VALUES (gen_random_uuid(), 'Academia Demo SyncVete', ...)
-- RETURNING id;

-- 3) Branch
-- INSERT INTO public.branches (organization_id, name, is_main, ...)
-- VALUES (:org_id, 'Sucursal Demo', true, ...);

-- 4) Auth users via Admin API only (see 02_auth_users.ps1):
--    owner.demo@academia-demo.invalid
--    vet.demo@academia-demo.invalid
--    recepcion.demo@academia-demo.invalid

-- 5) profiles + branch_members with appointments:read/write as needed
--    profiles.organization_id = :org_id

-- 6) Owner + patient (fictional)
-- INSERT owners: María Ejemplo
-- INSERT patients: Luna, species canine, owner_id = María

-- 7) Appointments across demo week (statuses: programada, confirmada, completed, cancelada)
--    organization_id MUST equal Academia Demo org only.
--    NEVER copy rows from other clinics.

-- 8) Verify
-- SELECT o.name, count(a.*)
-- FROM organizations o
-- LEFT JOIN appointments a ON a.organization_id = o.id AND a.deleted_at IS NULL
-- WHERE o.name ILIKE 'Academia Demo%'
-- GROUP BY o.name;

ROLLBACK;
