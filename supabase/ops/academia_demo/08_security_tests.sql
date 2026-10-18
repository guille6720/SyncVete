-- Academia Demo — local/disposable SECURITY TESTS (Phase 5C.1)
-- Expects protect trigger already applied (05_protect_demo_marker.sql).
-- Simulates clinic JWT via request.jwt.claims while running as postgres
-- (so RLS does not hide rows; the marker trigger still sees authenticated).

DO $$
DECLARE
  v_passed int := 0;
  v_failed int := 0;
  v_tmp_id uuid := 'b1b1b1b1-d0e0-4000-8000-00000000beef';
  v_collision_uid uuid := 'c1c1c1c1-d0e0-4000-8000-00000000cafe';
  v_other_org uuid := 'd1d1d1d1-d0e0-4000-8000-00000000dead';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_academia_demo_marker_maintainer'
  ) THEN
    RAISE EXCEPTION 'SECURITY_TEST: protect marker functions missing — apply 05_protect_demo_marker.sql first';
  END IF;

  -- Helper: soft-clean fixture org (avoid audit_logs FK hard-delete issues)
  -- Soft-delete is enough for uniqueness of slug/id reuse in later steps.

  -- -------------------------------------------------------------------------
  -- 1) Unauthorized marker INSERT (JWT role=authenticated)
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM set_config(
      'request.jwt.claims',
      '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000099"}',
      true
    );

    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (
      v_tmp_id,
      'Forged Demo Clinic',
      'forged-academia-demo',
      jsonb_build_object('academia_demo', true, 'academia_demo_key', 'sv-academia-demo-v1')
    );

    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL UNAUTHORIZED_INSERT_MARKER: expected exception';
    UPDATE public.organizations SET deleted_at = now() WHERE id = v_tmp_id;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS unauthorized marker INSERT blocked';
      ELSE
        v_failed := v_failed + 1;
        RAISE NOTICE 'FAIL unauthorized INSERT unexpected: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations SET deleted_at = now(), slug = slug || '-x' WHERE id = v_tmp_id;

  -- -------------------------------------------------------------------------
  -- 2) Unauthorized marker UPDATE (JWT authenticated; DB role remains postgres)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.organizations (id, name, slug, settings)
  VALUES (v_tmp_id, 'Normal Clinic', 'normal-clinic-sec-test', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        settings = '{}'::jsonb,
        deleted_at = NULL;

  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);

    UPDATE public.organizations
    SET settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'academia_demo', true,
      'academia_demo_key', 'sv-academia-demo-v1'
    )
    WHERE id = v_tmp_id;

    IF FOUND THEN
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL UNAUTHORIZED_UPDATE_MARKER: expected exception';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL UNAUTHORIZED_UPDATE_MARKER: no row updated and no exception';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
        v_passed := v_passed + 1;
        RAISE NOTICE 'PASS unauthorized marker UPDATE blocked';
      ELSE
        v_failed := v_failed + 1;
        RAISE NOTICE 'FAIL unauthorized UPDATE unexpected: %', SQLERRM;
      END IF;
  END;

  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE public.organizations
  SET deleted_at = now(), slug = 'normal-clinic-sec-test-done'
  WHERE id = v_tmp_id;

  -- -------------------------------------------------------------------------
  -- 3) Existing Auth / profile collision detection
  -- -------------------------------------------------------------------------
  INSERT INTO auth.users (id, email)
  VALUES (v_collision_uid, 'collision.demo@academia-demo.invalid')
  ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id;

  INSERT INTO public.organizations (id, name, slug, settings)
  VALUES (v_other_org, 'Other Clinic', 'other-clinic-sec-test', '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, slug = EXCLUDED.slug;

  INSERT INTO public.profiles (id, organization_id, full_name, is_active, account_status)
  VALUES (v_collision_uid, v_other_org, 'Collision User', true, 'active')
  ON CONFLICT (id) DO UPDATE SET organization_id = v_other_org, deleted_at = NULL;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_collision_uid
      AND p.deleted_at IS NULL
      AND p.organization_id IS DISTINCT FROM 'a0a0a0a0-d0e0-4000-8000-000000000001'::uuid
  ) THEN
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS auth/profile collision detectible before seed UPSERT';
  ELSE
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL collision fixture not detectible';
  END IF;

  UPDATE public.profiles SET deleted_at = now() WHERE id = v_collision_uid;
  UPDATE public.organizations SET deleted_at = now() WHERE id = v_other_org;
  DELETE FROM auth.users WHERE id = v_collision_uid;

  -- -------------------------------------------------------------------------
  -- 4) Authorized maintainer CAN set marker (service_role JWT)
  -- -------------------------------------------------------------------------
  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    INSERT INTO public.organizations (id, name, slug, settings)
    VALUES (
      'e1e1e1e1-d0e0-4000-8000-00000000aabb',
      'Maintainer Demo Org',
      'maintainer-demo-sec-test',
      jsonb_build_object('academia_demo', true, 'academia_demo_key', 'sv-academia-demo-v1')
    );
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS maintainer marker INSERT allowed';
    UPDATE public.organizations
    SET deleted_at = now()
    WHERE id = 'e1e1e1e1-d0e0-4000-8000-00000000aabb';
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL maintainer INSERT: %', SQLERRM;
    UPDATE public.organizations
    SET deleted_at = now()
    WHERE id = 'e1e1e1e1-d0e0-4000-8000-00000000aabb';
  END;

  PERFORM set_config('request.jwt.claims', '', true);

  RAISE NOTICE 'SECURITY_TESTS summary passed=% failed=%', v_passed, v_failed;
  IF v_failed > 0 THEN
    RAISE EXCEPTION 'SECURITY_TESTS failed: % assertion(s)', v_failed;
  END IF;
END $$;
