-- Protect Academia Demo marker AND ownership registry in organizations.settings
-- Keys locked for non-maintainers:
--   academia_demo, academia_demo_key, academia_demo_registry
--
-- Authorization is CURRENT_USER-first (cannot escalate via set_config JWT claims):
--   - authenticated / anon DB roles → never
--   - service_role DB role → yes
--   - postgres / supabase_admin → yes, unless JWT claim simulates clinic role
--
-- Legitimate clinic settings updates (timezone, currency, etc.) remain allowed
-- as long as locked keys are unchanged.
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
        COALESCE(
          NULLIF(auth.jwt() ->> 'role', ''),
          NULLIF(current_setting('request.jwt.claim.role', true), ''),
          ''
        ) NOT IN ('authenticated', 'anon')
      ELSE false
    END;
$$;

COMMENT ON FUNCTION public.is_academia_demo_marker_maintainer() IS
  'Marker/registry maintainer: service_role or postgres/supabase_admin; never authenticated/anon; JWT claims cannot escalate an unprivileged DB role';

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
  v_old jsonb;
  v_new jsonb;
  v_new_has_locked boolean;
  v_changed boolean;
BEGIN
  v_old := COALESCE(OLD.settings, '{}'::jsonb);
  v_new := COALESCE(NEW.settings, '{}'::jsonb);

  IF TG_OP = 'INSERT' THEN
    v_new_has_locked :=
      (v_new ? 'academia_demo')
      OR (v_new ? 'academia_demo_key')
      OR (v_new ? 'academia_demo_registry')
      OR NULLIF(v_new ->> 'academia_demo', '') IS NOT NULL
      OR NULLIF(v_new ->> 'academia_demo_key', '') IS NOT NULL
      OR (v_new -> 'academia_demo_registry') IS NOT NULL;

    IF v_new_has_locked AND NOT public.is_academia_demo_marker_maintainer() THEN
      RAISE EXCEPTION
        'ACADEMIA_DEMO_MARKER_LOCKED: cannot INSERT organization with academia_demo marker/registry'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Any change to locked keys (add/remove/replace/mutate) requires maintainer.
    v_changed :=
      (v_old ->> 'academia_demo') IS DISTINCT FROM (v_new ->> 'academia_demo')
      OR (v_old ->> 'academia_demo_key') IS DISTINCT FROM (v_new ->> 'academia_demo_key')
      OR (v_old -> 'academia_demo_registry') IS DISTINCT FROM (v_new -> 'academia_demo_registry')
      OR ((v_old ? 'academia_demo') IS DISTINCT FROM (v_new ? 'academia_demo'))
      OR ((v_old ? 'academia_demo_key') IS DISTINCT FROM (v_new ? 'academia_demo_key'))
      OR ((v_old ? 'academia_demo_registry') IS DISTINCT FROM (v_new ? 'academia_demo_registry'));

    IF v_changed AND NOT public.is_academia_demo_marker_maintainer() THEN
      RAISE EXCEPTION
        'ACADEMIA_DEMO_MARKER_LOCKED: academia_demo marker/registry are maintainer-only'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_protect_academia_demo_marker() IS
  'Blocks INSERT/UPDATE forgery, clearing, or replacement of Academia Demo marker and academia_demo_registry by non-maintainers';

REVOKE ALL ON FUNCTION public.trg_protect_academia_demo_marker() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trg_protect_academia_demo_marker() TO postgres, service_role;

DROP TRIGGER IF EXISTS trg_protect_academia_demo_marker ON public.organizations;
CREATE TRIGGER trg_protect_academia_demo_marker
  BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_protect_academia_demo_marker();
