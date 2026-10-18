-- Protect academia_demo / academia_demo_key in organizations.settings
-- INSERT and UPDATE: only trusted DB roles may set/change/remove markers.
--
-- Authorization is CURRENT_USER-first (cannot escalate via set_config JWT claims):
--   - authenticated / anon DB roles → never
--   - service_role DB role → yes
--   - postgres / supabase_admin → yes, unless JWT claim simulates clinic role
--
-- SECURITY INVOKER; fixed search_path. Idempotent.

CREATE OR REPLACE FUNCTION public.is_academia_demo_marker_maintainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
  SELECT
    CASE
      WHEN CURRENT_USER IN ('authenticated', 'anon') THEN false
      WHEN CURRENT_USER = 'service_role' THEN true
      WHEN CURRENT_USER IN ('postgres', 'supabase_admin') THEN
        -- Ops/maintenance allowed unless explicitly simulating a clinic JWT.
        COALESCE(
          NULLIF(auth.jwt() ->> 'role', ''),
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          ''
        ) NOT IN ('authenticated', 'anon')
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.is_academia_demo_marker_maintainer() IS
  'Marker maintainer: service_role or postgres/supabase_admin; never authenticated/anon; JWT claims cannot escalate an unprivileged DB role';

REVOKE ALL ON FUNCTION public.is_academia_demo_marker_maintainer() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_academia_demo_marker_maintainer()
  TO authenticated, anon, service_role, postgres;

CREATE OR REPLACE FUNCTION public.trg_protect_academia_demo_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_old_demo text;
  v_new_demo text;
  v_old_key text;
  v_new_key text;
  v_new_has_marker boolean;
  v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_has_marker :=
      (COALESCE(NEW.settings, '{}'::jsonb) ? 'academia_demo')
      OR (COALESCE(NEW.settings, '{}'::jsonb) ? 'academia_demo_key')
      OR NULLIF(COALESCE(NEW.settings, '{}'::jsonb) ->> 'academia_demo', '') IS NOT NULL
      OR NULLIF(COALESCE(NEW.settings, '{}'::jsonb) ->> 'academia_demo_key', '') IS NOT NULL;

    IF v_new_has_marker AND NOT public.is_academia_demo_marker_maintainer() THEN
      RAISE EXCEPTION
        'ACADEMIA_DEMO_MARKER_LOCKED: cannot INSERT organization with academia_demo marker'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_demo := COALESCE(OLD.settings ->> 'academia_demo', '');
    v_new_demo := COALESCE(NEW.settings ->> 'academia_demo', '');
    v_old_key := COALESCE(OLD.settings ->> 'academia_demo_key', '');
    v_new_key := COALESCE(NEW.settings ->> 'academia_demo_key', '');
    v_changed :=
      (v_old_demo IS DISTINCT FROM v_new_demo)
      OR (v_old_key IS DISTINCT FROM v_new_key)
      OR (
        (COALESCE(OLD.settings, '{}'::jsonb) ? 'academia_demo')
        IS DISTINCT FROM (COALESCE(NEW.settings, '{}'::jsonb) ? 'academia_demo')
      )
      OR (
        (COALESCE(OLD.settings, '{}'::jsonb) ? 'academia_demo_key')
        IS DISTINCT FROM (COALESCE(NEW.settings, '{}'::jsonb) ? 'academia_demo_key')
      );

    IF v_changed AND NOT public.is_academia_demo_marker_maintainer() THEN
      RAISE EXCEPTION
        'ACADEMIA_DEMO_MARKER_LOCKED: academia_demo settings are maintainer-only'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_protect_academia_demo_marker() IS
  'Blocks INSERT/UPDATE forgery or clearing of Academia Demo marker by non-maintainers';

REVOKE ALL ON FUNCTION public.trg_protect_academia_demo_marker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_protect_academia_demo_marker() TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_protect_academia_demo_marker ON public.organizations;
CREATE TRIGGER trg_protect_academia_demo_marker
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_academia_demo_marker();
