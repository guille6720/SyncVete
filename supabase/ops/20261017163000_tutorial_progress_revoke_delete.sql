-- STAGING FIRST — DO NOT APPLY until explicitly authorized.
-- Narrow hardening: revoke unnecessary DELETE on tutorial_progress from authenticated.
-- Does not alter RLS policies, RPCs, or other tables.
-- Rollback: GRANT DELETE ON TABLE public.tutorial_progress TO authenticated; (not recommended)

REVOKE DELETE ON TABLE public.tutorial_progress FROM authenticated;

-- Keep existing grants explicit for clarity (idempotent with prior migration intent).
GRANT SELECT, INSERT, UPDATE ON TABLE public.tutorial_progress TO authenticated;

NOTIFY pgrst, 'reload schema';
