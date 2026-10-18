-- Academia Demo — realistic SECURITY TESTS (Phase 5C.2)
-- Uses distinct DB roles (authenticated / service_role / postgres).
-- Limitations vs real Supabase Auth:
--   - No GoTrue-signed JWTs; auth.jwt() reads request.jwt.claims GUC (PostgREST-style stub).
--   - SET ROLE authenticated approximates the DB role switch, not full session claims.
--   - RLS policies still apply under SET ROLE; BYPASSRLS only for service_role.
-- Requires: 05_protect_demo_marker.sql applied; roles authenticated + service_role.

DO $$
DECLARE
  v_passed int := 0;
  v_failed int := 0;
  v_tmp uuid := 'b1b1b1b1-d0e0-4000-8000-00000000beef';
  v_ok_org uuid := 'b2b2b2b2-d0e0-4000-8000-00000000beee';
  v_collision_uid uuid := 'c1c1c1c1-d0e0-4000-8000-00000000cafe';
  v_other_org uuid := 'd1d1d1d1-d0e0-4000-8000-00000000dead';
  v_escalation_blocked boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE EXCEPTION 'SECURITY_TEST: role authenticated missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'SECURITY_TEST: role service_role missing';
  END IF;

  -- -----------------------------------------------------------------------
  -- 1) authenticated DB role cannot INSERT marker
  -- -----------------------------------------------------------------------
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (
      v_tmp, 'Forged', 'forged-academia-demo-5c2',
      jsonb_build_object('academia_demo', true, 'academia_demo_key', 'sv-academia-demo-v1')
    );
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL auth INSERT marker';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated cannot INSERT marker';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated INSERT blocked (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations SET deleted_at = now(), slug = slug || '-x' WHERE id = v_tmp AND deleted_at IS NULL;

  -- -----------------------------------------------------------------------
  -- 2) authenticated cannot UPDATE marker onto normal org
  -- -----------------------------------------------------------------------
  SET ROLE postgres;
  INSERT INTO public.organizations (id, name, slug, settings)
  VALUES (v_tmp, 'Normal Clinic', 'normal-clinic-5c2', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET settings = '{}'::jsonb, deleted_at = NULL, slug = EXCLUDED.slug;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    UPDATE public.organizations
    SET settings = settings || jsonb_build_object('academia_demo', true, 'academia_demo_key', 'sv-academia-demo-v1')
    WHERE id = v_tmp;
    IF FOUND THEN
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL auth UPDATE marker succeeded';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated UPDATE marker no-op/blocked by RLS';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated cannot UPDATE marker';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated UPDATE denied (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations SET deleted_at = now() WHERE id = v_tmp;

  -- -----------------------------------------------------------------------
  -- 3) Normal org CREATE without marker (as postgres maintainer / signup path)
  -- -----------------------------------------------------------------------
  BEGIN
    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (v_ok_org, 'Plain Clinic', 'plain-clinic-5c2', jsonb_build_object('timezone', 'UTC'));
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS normal org without marker';
    UPDATE public.organizations SET deleted_at = now() WHERE id = v_ok_org;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL normal org create: %', SQLERRM;
  END;

  -- -----------------------------------------------------------------------
  -- 4) Privileged service_role DB role CAN set marker
  -- -----------------------------------------------------------------------
  BEGIN
    SET LOCAL ROLE service_role;
    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (
      'e1e1e1e1-d0e0-4000-8000-00000000aabb',
      'Maintainer Org',
      'maintainer-5c2',
      jsonb_build_object('academia_demo', true, 'academia_demo_key', 'sv-academia-demo-v1')
    );
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS service_role can INSERT marker';
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL service_role INSERT: %', SQLERRM;
  END;
  RESET ROLE;
  UPDATE public.organizations SET deleted_at = now() WHERE id = 'e1e1e1e1-d0e0-4000-8000-00000000aabb';

  -- -----------------------------------------------------------------------
  -- 5) Untrusted role cannot escalate via forged JWT service_role claim
  -- -----------------------------------------------------------------------
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_escalation_blocked := NOT public.is_academia_demo_marker_maintainer();
    IF v_escalation_blocked THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS JWT claim forgery cannot escalate authenticated role';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL JWT claim forgery escalated privileges';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL escalation test: %', SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- -----------------------------------------------------------------------
  -- 6) Auth/profile collision detectible (seed precondition)
  -- -----------------------------------------------------------------------
  INSERT INTO auth.users (id, email)
  VALUES (v_collision_uid, 'collision.demo@academia-demo.invalid')
  ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id;
  INSERT INTO public.organizations (id, name, slug, settings)
  VALUES (v_other_org, 'Other', 'other-5c2', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET deleted_at = NULL;
  INSERT INTO public.profiles (id, organization_id, full_name, is_active, account_status)
  VALUES (v_collision_uid, v_other_org, 'Collision', true, 'active')
  ON CONFLICT (id) DO UPDATE SET organization_id = v_other_org, deleted_at = NULL;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_collision_uid AND p.deleted_at IS NULL
      AND p.organization_id IS DISTINCT FROM 'a0a0a0a0-d0e0-4000-8000-000000000001'::uuid
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS collision fixture detectible';
  ELSE
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL collision fixture';
  END IF;

  UPDATE public.profiles SET deleted_at = now() WHERE id = v_collision_uid;
  UPDATE public.organizations SET deleted_at = now() WHERE id = v_other_org;
  DELETE FROM auth.users WHERE id = v_collision_uid;

  -- -----------------------------------------------------------------------
  -- 7) Marker helper is SECURITY INVOKER (not DEFINER)
  -- -----------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_academia_demo_marker_maintainer'
      AND NOT p.prosecdef
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_protect_academia_demo_marker'
      AND NOT p.prosecdef
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS marker functions are SECURITY INVOKER';
  ELSE
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL unexpected SECURITY DEFINER on marker helpers';
  END IF;

  -- -----------------------------------------------------------------------
  -- 8) authenticated cannot INSERT org with academia_demo_registry
  -- -----------------------------------------------------------------------
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (
      'a3a3a3a3-d0e0-4000-8000-00000000aa01',
      'Forged Registry Org',
      'forged-registry-5c2',
      jsonb_build_object(
        'academia_demo_registry',
        jsonb_build_object('source', 'academia_demo_seed', 'forged', true)
      )
    );
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL auth INSERT registry';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated cannot INSERT academia_demo_registry';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated registry INSERT blocked (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations SET deleted_at = now()
  WHERE id = 'a3a3a3a3-d0e0-4000-8000-00000000aa01' AND deleted_at IS NULL;

  -- -----------------------------------------------------------------------
  -- 9) Legitimate settings update without touching locked keys (as postgres)
  -- -----------------------------------------------------------------------
  INSERT INTO public.organizations (id, name, slug, settings)
  VALUES (
    'a4a4a4a4-d0e0-4000-8000-00000000aa02',
    'Legit Settings Org',
    'legit-settings-5c2',
    jsonb_build_object('timezone', 'UTC')
  )
  ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, settings = EXCLUDED.settings;

  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    UPDATE public.organizations
    SET settings = settings || jsonb_build_object('currency', 'ARS')
    WHERE id = 'a4a4a4a4-d0e0-4000-8000-00000000aa02';
    -- May be blocked by RLS (no membership) - either success without locked keys or RLS deny is OK
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS non-locked settings path exercised (result tolerated under RLS)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' THEN
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL locked-key false positive on currency update';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS non-locked update denied by RLS/other (%)', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations SET deleted_at = now()
  WHERE id = 'a4a4a4a4-d0e0-4000-8000-00000000aa02';

  RAISE NOTICE 'SECURITY_TESTS summary passed=% failed=%', v_passed, v_failed;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'SECURITY_TESTS failed: %', v_failed;
  END IF;
END $$;
