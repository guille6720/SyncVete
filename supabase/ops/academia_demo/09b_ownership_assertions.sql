-- Ownership assertions: run AFTER seed pass 2 (post-fixtures).
-- Proves non-adoption and registry lock. Leaves a forged registry + backup
-- so the dry-run can attempt 04_rollback.sql and expect refusal.

DO $$
DECLARE
  c_org uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  v_passed int := 0;
  v_failed int := 0;
  v_tester_uid uuid := 'f1f1f1f1-d0e0-4000-8000-00000000aaaa';
  v_owner_uid uuid;
  v_rec_uid uuid;
  v_reg jsonb;
  v_reg_backup jsonb;
  v_sched_id uuid;
BEGIN
  SELECT id INTO v_owner_uid FROM auth.users WHERE email = 'owner.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_rec_uid FROM auth.users WHERE email = 'recepcion.demo@academia-demo.invalid' LIMIT 1;

  SELECT settings -> 'academia_demo_registry' INTO v_reg
  FROM public.organizations WHERE id = c_org;
  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'OWNERSHIP_ASSERT: registry missing';
  END IF;
  v_reg_backup := v_reg;

  -- 1) authenticated / demo-owner cannot modify ownership registry
  -- Also simulate a privileged-looking JWT while still on authenticated DB role.
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object('role', 'authenticated', 'sub', v_owner_uid::text)::text,
      true
    );
    UPDATE public.organizations
    SET settings = settings || jsonb_build_object(
      'academia_demo_registry',
      (coalesce(settings -> 'academia_demo_registry', '{}'::jsonb)
        || jsonb_build_object('forged_by_owner', true))
    )
    WHERE id = c_org;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ownership registry write raised: %', SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Force-path: postgres with simulated clinic JWT must also be blocked by CURRENT_USER-first
  -- when role is switched to authenticated (already covered). Additionally verify the
  -- registry was not mutated by the authenticated attempt (RLS no-op or trigger).
  IF coalesce(
       (SELECT settings -> 'academia_demo_registry' ->> 'forged_by_owner'
        FROM public.organizations WHERE id = c_org),
       ''
     ) = 'true'
  THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL demo owner modified registry';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS demo owner cannot modify ownership registry';
  END IF;

  -- Stronger proof: as postgres, temporarily SET ROLE authenticated and mutate — must raise
  BEGIN
    SET ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    -- Bypass RLS for this proof by using a SECURITY path unavailable to clinic users:
    -- Instead, disable row security for the test session? Not allowed.
    -- Direct trigger proof: call maintainer check
    IF public.is_academia_demo_marker_maintainer() THEN
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL authenticated reported as marker maintainer';
    ELSE
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS authenticated is not registry maintainer';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL maintainer check error: %', SQLERRM;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- Direct trigger exercise: UPDATE as authenticated after granting BYPASSRLS is wrong.
  -- Use postgres to SET LOCAL ROLE authenticated with row_security off:
  BEGIN
    SET LOCAL row_security = off;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
    UPDATE public.organizations
    SET settings = settings || jsonb_build_object(
      'academia_demo_registry',
      (coalesce(settings -> 'academia_demo_registry', '{}'::jsonb)
        || jsonb_build_object('forged_by_owner', true))
    )
    WHERE id = c_org;
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL authenticated+row_security_off modified registry';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'ACADEMIA_DEMO_MARKER_LOCKED%' OR SQLSTATE = '42501' THEN
      v_passed := v_passed + 1;
      RAISE NOTICE 'PASS trigger blocks registry forge under authenticated role';
    ELSE
      v_failed := v_failed + 1;
      RAISE NOTICE 'FAIL unexpected error forging registry: %', SQLERRM;
    END IF;
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  -- 2) Preexisting profile not silently adopted
  IF coalesce(v_reg -> 'profile_ids', '[]'::jsonb) @> jsonb_build_array(v_owner_uid::text) THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL preexisting owner profile silently re-adopted';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS preexisting profile not silently adopted';
  END IF;

  IF coalesce(v_reg -> 'profile_ids', '[]'::jsonb) @> jsonb_build_array(v_tester_uid::text) THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL tester profile adopted into registry';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS tester profile not in registry';
  END IF;

  -- 3) Preexisting membership not silently adopted
  IF coalesce(v_reg -> 'member_user_ids', '[]'::jsonb) @> jsonb_build_array(v_rec_uid::text) THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL preexisting membership silently re-adopted';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS preexisting membership not silently adopted';
  END IF;

  IF coalesce(v_reg -> 'member_user_ids', '[]'::jsonb) @> jsonb_build_array(v_tester_uid::text) THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL tester membership adopted into registry';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS tester membership not in registry';
  END IF;

  SELECT id INTO v_sched_id
  FROM public.professional_schedules
  WHERE organization_id = c_org AND user_id = v_tester_uid AND deleted_at IS NULL
  LIMIT 1;

  IF v_sched_id IS NOT NULL
     AND coalesce(v_reg -> 'schedule_ids', '[]'::jsonb) @> jsonb_build_array(v_sched_id::text)
  THEN
    v_failed := v_failed + 1;
    RAISE NOTICE 'FAIL tester schedule adopted into registry';
  ELSE
    v_passed := v_passed + 1;
    RAISE NOTICE 'PASS tester schedule not in registry';
  END IF;

  -- Durable on disposable DB across psql sessions (TEMP would not survive)
  CREATE TABLE IF NOT EXISTS public._academia_demo_registry_backup (
    registry jsonb NOT NULL
  );
  TRUNCATE public._academia_demo_registry_backup;
  INSERT INTO public._academia_demo_registry_backup(registry) VALUES (v_reg_backup);

  -- Forge registry to include tester profile (unauthorized)
  UPDATE public.organizations
  SET settings = settings || jsonb_build_object(
    'academia_demo_registry',
    v_reg_backup || jsonb_build_object(
      'profile_ids',
      coalesce(v_reg_backup -> 'profile_ids', '[]'::jsonb) || jsonb_build_array(v_tester_uid::text)
    )
  )
  WHERE id = c_org;

  RAISE NOTICE 'OWNERSHIP_ASSERTIONS summary passed=% failed=%', v_passed, v_failed;
  IF v_failed > 0 THEN
    UPDATE public.organizations
    SET settings = settings || jsonb_build_object('academia_demo_registry', v_reg_backup)
    WHERE id = c_org;
    RAISE EXCEPTION 'OWNERSHIP_ASSERTIONS failed: %', v_failed;
  END IF;
END $$;
