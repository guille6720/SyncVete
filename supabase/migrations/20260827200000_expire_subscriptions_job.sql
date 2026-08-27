-- Phase 1 (global nav perf): move subscription expiry off the page-read path.
-- Authenticated clinic navigation must NOT call expire_due_subscriptions.
-- Expiry runs via service_role job (cron / scheduled runner) only.
--
-- STAGING: enable the schedule with supabase/ops/staging_enable_expire_cron.sql
-- PRODUCTION: do NOT enable until staging is validated; see docs in that ops file.

CREATE OR REPLACE FUNCTION public.expire_due_subscriptions_job()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN public.expire_due_subscriptions(NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_subscriptions_job() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_due_subscriptions_job() TO service_role;

COMMENT ON FUNCTION public.expire_due_subscriptions_job() IS
  'Service-role-only wrapper for scheduled subscription/add-on expiry. Not callable from browser or authenticated app sessions.';

-- Page navigation and entitlement reads must not write expiry. Keep the core
-- function available to SECURITY DEFINER admin RPCs, but revoke direct
-- authenticated EXECUTE so a normal clinic session cannot trigger writes.
REVOKE ALL ON FUNCTION public.expire_due_subscriptions(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_due_subscriptions(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_subscriptions(UUID) TO service_role;

COMMENT ON FUNCTION public.expire_due_subscriptions(UUID) IS
  'Expires due subscriptions/add-ons. Callable only as service_role (or via SECURITY DEFINER admin helpers). Not part of clinic page navigation.';
