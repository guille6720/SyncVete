-- Protect academia_demo / academia_demo_key in organizations.settings
-- Only service_role may add, change, or remove these keys.
-- STAGING apply only with seed authorization (separate from DELETE harden).
-- Idempotent CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.trg_protect_academia_demo_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text := coalesce(auth.jwt()->>'role', current_setting('role', true));
  v_old_demo text;
  v_new_demo text;
  v_old_key text;
  v_new_key text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_old_demo := coalesce(OLD.settings->>'academia_demo', '');
  v_new_demo := coalesce(NEW.settings->>'academia_demo', '');
  v_old_key := coalesce(OLD.settings->>'academia_demo_key', '');
  v_new_key := coalesce(NEW.settings->>'academia_demo_key', '');

  IF v_old_demo IS NOT DISTINCT FROM v_new_demo
     AND v_old_key IS NOT DISTINCT FROM v_new_key THEN
    RETURN NEW;
  END IF;

  -- Allow service_role (JWT) or postgres/supabase_admin maintenance
  IF v_role IN ('service_role', 'supabase_admin', 'postgres') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ACADEMIA_DEMO_MARKER_LOCKED: academia_demo settings are service_role only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_academia_demo_marker ON public.organizations;
CREATE TRIGGER trg_protect_academia_demo_marker
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_academia_demo_marker();

COMMENT ON FUNCTION public.trg_protect_academia_demo_marker() IS
  'Prevents clinic users from forging or clearing Academia Demo marker via org rename/settings update';
