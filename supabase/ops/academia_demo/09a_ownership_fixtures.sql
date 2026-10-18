-- Ownership fixtures: run AFTER seed pass 1, BEFORE seed pass 2.
-- Creates independent tester rows and strips prior seed ownership claims
-- so re-seed must NOT silently re-adopt them.

DO $$
DECLARE
  c_org uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  c_branch uuid := 'a0a0a0a0-d0e0-4000-8000-000000000002';
  v_tester_uid uuid := 'f1f1f1f1-d0e0-4000-8000-00000000aaaa';
  v_owner_uid uuid;
  v_rec_uid uuid;
  v_reg jsonb;
  v_profiles jsonb;
  v_members jsonb;
BEGIN
  SELECT id INTO v_owner_uid FROM auth.users WHERE email = 'owner.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_rec_uid FROM auth.users WHERE email = 'recepcion.demo@academia-demo.invalid' LIMIT 1;
  IF v_owner_uid IS NULL OR v_rec_uid IS NULL THEN
    RAISE EXCEPTION 'OWNERSHIP_FIXTURE: QA auth stubs missing';
  END IF;

  INSERT INTO auth.users (id, email)
  VALUES (v_tester_uid, 'tester.independent@example.com')
  ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id;

  INSERT INTO public.profiles (id, organization_id, full_name, active_branch_id, is_active, account_status)
  VALUES (v_tester_uid, c_org, 'Tester Independent', c_branch, true, 'active')
  ON CONFLICT (id) DO UPDATE
    SET organization_id = c_org, deleted_at = NULL, is_active = true,
        full_name = 'Tester Independent', active_branch_id = c_branch;

  IF NOT EXISTS (
    SELECT 1 FROM public.branch_members
    WHERE organization_id = c_org AND user_id = v_tester_uid AND deleted_at IS NULL
  ) THEN
    INSERT INTO public.branch_members (organization_id, branch_id, user_id, role, permissions, is_active)
    VALUES (c_org, c_branch, v_tester_uid, 'receptionist', '["appointments:read"]'::jsonb, true);
  END IF;

  -- Independent tester schedule (must never be registry-adopted / rolled back)
  INSERT INTO public.professional_schedules (
    organization_id, branch_id, user_id, weekday, start_time, end_time,
    slot_duration_minutes, is_active
  )
  SELECT c_org, c_branch, v_tester_uid, 1, '07:00', '08:00', 30, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.professional_schedules s
    WHERE s.organization_id = c_org AND s.user_id = v_tester_uid
      AND s.weekday = 1 AND s.deleted_at IS NULL
  );

  SELECT settings -> 'academia_demo_registry' INTO v_reg
  FROM public.organizations WHERE id = c_org;

  IF v_reg IS NULL THEN
    RAISE EXCEPTION 'OWNERSHIP_FIXTURE: registry missing after seed1';
  END IF;

  -- Strip owner profile + receptionist membership from registry (preexisting rows remain)
  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  INTO v_profiles
  FROM jsonb_array_elements_text(coalesce(v_reg -> 'profile_ids', '[]'::jsonb)) elem
  WHERE elem <> v_owner_uid::text;

  SELECT coalesce(jsonb_agg(elem), '[]'::jsonb)
  INTO v_members
  FROM jsonb_array_elements_text(coalesce(v_reg -> 'member_user_ids', '[]'::jsonb)) elem
  WHERE elem <> v_rec_uid::text;

  UPDATE public.organizations
  SET settings = settings || jsonb_build_object(
    'academia_demo_registry',
    v_reg || jsonb_build_object(
      'profile_ids', v_profiles,
      'member_user_ids', v_members
    )
  )
  WHERE id = c_org;

  RAISE NOTICE 'OWNERSHIP_FIXTURES ready (stripped owner profile + recepcion membership; tester rows present)';
END $$;
