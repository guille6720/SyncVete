-- Security harness for tutorial_progress (run inside disposable DB after migration).
-- Expects roles: anon, authenticated, service_role (created by harness).
-- Expects two orgs, two users with memberships; user A also membership in org B but
-- profiles.organization_id points to org A.

DO $$
DECLARE
  v_org_a UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_org_b UUID := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  v_user_a UUID := '11111111-1111-1111-1111-111111111111';
  v_user_b UUID := '22222222-2222-2222-2222-222222222222';
  v_pass INT := 0;
  v_fail INT := 0;
  v_row public.tutorial_progress;
  v_cnt INT;
  v_err TEXT;
BEGIN
  -- 1) authorized org follows profile, not first membership
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.tutorial_progress_authorized_org_id() = v_org_a THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL authorized org should be profile org A';
  END IF;

  -- 2) upsert writes only own org/user
  v_row := public.upsert_tutorial_progress('agenda-basico', 1, 2, 'in_progress');
  IF v_row.user_id = v_user_a AND v_row.organization_id = v_org_a AND v_row.current_step = 2 THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL upsert own progress';
  END IF;

  -- 3) cannot see other user's progress via RLS select
  SELECT count(*) INTO v_cnt
  FROM public.tutorial_progress
  WHERE user_id = v_user_b;
  IF v_cnt = 0 THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL RLS leaked other user rows';
  END IF;

  -- 4) spoof insert other user rejected
  BEGIN
    INSERT INTO public.tutorial_progress (organization_id, user_id, tutorial_id, tutorial_version, current_step, status)
    VALUES (v_org_a, v_user_b, 'spoof', 1, 0, 'in_progress');
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL spoof insert allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    v_pass := v_pass + 1;
  END;

  -- 5) spoof insert other org rejected
  BEGIN
    INSERT INTO public.tutorial_progress (organization_id, user_id, tutorial_id, tutorial_version, current_step, status)
    VALUES (v_org_b, v_user_a, 'spoof-org', 1, 0, 'in_progress');
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL cross-org insert allowed';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR others THEN
    v_pass := v_pass + 1;
  END;

  -- 6) get_my only returns own
  v_row := public.get_my_tutorial_progress('agenda-basico');
  IF v_row.id IS NOT NULL AND v_row.user_id = v_user_a THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL get_my';
  END IF;

  -- 7) switch profile org to B → authorized org becomes B; cannot read org A progress via get_my
  RESET ROLE;
  UPDATE public.profiles SET organization_id = v_org_b WHERE id = v_user_a;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF public.tutorial_progress_authorized_org_id() = v_org_b THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL multi-org switch';
  END IF;
  v_row := public.get_my_tutorial_progress('agenda-basico');
  IF v_row.id IS NULL THEN
    v_pass := v_pass + 1;
  ELSE
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL still saw org A progress after switch';
  END IF;

  -- 8) anon cannot execute privileged RPCs
  RESET ROLE;
  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM public.upsert_tutorial_progress('x', 1, 0, 'in_progress');
    v_fail := v_fail + 1;
    RAISE NOTICE 'FAIL anon execute upsert';
  EXCEPTION WHEN insufficient_privilege OR others THEN
    v_pass := v_pass + 1;
  END;

  RESET ROLE;
  RAISE NOTICE 'TUTORIAL_PROGRESS_SECURITY pass=% fail=%', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE EXCEPTION 'TUTORIAL_PROGRESS_SECURITY_FAILED pass=% fail=%', v_pass, v_fail;
  END IF;
END $$;
