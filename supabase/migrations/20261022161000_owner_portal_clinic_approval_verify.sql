-- Run in Supabase staging (owmcrqvnfubyjxrlyhlc) to confirm clinic-approval SQL landed.
-- Expected: has_pending_column = true, accept_is_new_version = true, grant_ok = true

SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'owners'
      AND column_name = 'portal_pending_user_id'
  ) AS has_pending_column,
  (
    SELECT p.prosrc LIKE '%pending_approval%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'accept_owner_portal_invite'
    ORDER BY p.oid DESC
    LIMIT 1
  ) AS accept_is_new_version,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_portal_pending_owner_id'
  ) AS has_pending_rpc,
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'approve_owner_portal_access'
  ) AS has_approve_rpc,
  HAS_FUNCTION_PRIVILEGE('authenticated', 'public.accept_owner_portal_invite(text, text)', 'EXECUTE')
    AS accept_grant_ok;

NOTIFY pgrst, 'reload schema';
