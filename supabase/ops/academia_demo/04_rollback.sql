-- Academia Demo — compensating cleanup — Phase 5C.2
-- Soft-deletes ONLY seed-owned rows. Preserves tester-created demo-org data.
-- Refuses org soft-delete when non-seed dependents remain.
-- Approval gate (operator foot-gun only): set_config(...'yes', true) in same TX.
-- Idempotent: safe to run twice.

DO $$
DECLARE
  c_org_id     uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  c_branch_id  uuid := 'a0a0a0a0-d0e0-4000-8000-000000000002';
  c_owner_id   uuid := 'a0a0a0a0-d0e0-4000-8000-000000000003';
  c_patient_id uuid := 'a0a0a0a0-d0e0-4000-8000-000000000004';
  c_prof_id    uuid := 'a0a0a0a0-d0e0-4000-8000-000000000005';
  c_marker     text := 'sv-academia-demo-v1';
  c_source     text := 'academia_demo_seed';
  v_ok         boolean;
  v_registry   jsonb;
  v_sched_ids  jsonb;
  v_profile_ids jsonb;
  v_member_uids jsonb;
  v_non_seed_appts int;
  v_non_seed_patients int;
  v_non_seed_owners int;
  v_foreign_members int;
  v_can_remove_org boolean := true;
BEGIN
  IF coalesce(current_setting('app.academia_demo_seed_approved', true), '') IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback: approval gate missing';
  END IF;

  SELECT coalesce((settings->>'academia_demo')::boolean, false)
     AND settings->>'academia_demo_key' = c_marker
  INTO v_ok
  FROM public.organizations
  WHERE id = c_org_id;

  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: org missing or marker mismatch';
  END IF;

  SELECT coalesce(settings -> 'academia_demo_registry', '{}'::jsonb)
  INTO v_registry
  FROM public.organizations WHERE id = c_org_id;

  IF v_registry = '{}'::jsonb OR v_registry IS NULL THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: missing academia_demo_registry (ambiguous ownership)';
  END IF;
  IF coalesce(v_registry->>'source', '') IS DISTINCT FROM c_source THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: registry source mismatch';
  END IF;

  v_sched_ids := coalesce(v_registry -> 'schedule_ids', '[]'::jsonb);
  v_profile_ids := coalesce(v_registry -> 'profile_ids', '[]'::jsonb);
  v_member_uids := coalesce(v_registry -> 'member_user_ids', '[]'::jsonb);

  -- Detect non-seed dependents (tester artifacts)
  SELECT count(*) INTO v_non_seed_appts
  FROM public.appointments a
  WHERE a.organization_id = c_org_id AND a.deleted_at IS NULL
    AND coalesce(a.source_system, '') IS DISTINCT FROM c_source;

  SELECT count(*) INTO v_non_seed_patients
  FROM public.patients p
  WHERE p.organization_id = c_org_id AND p.deleted_at IS NULL
    AND coalesce(p.source_system, '') IS DISTINCT FROM c_source;

  SELECT count(*) INTO v_non_seed_owners
  FROM public.owners o
  WHERE o.organization_id = c_org_id AND o.deleted_at IS NULL
    AND coalesce(o.source_system, '') IS DISTINCT FROM c_source;

  SELECT count(*) INTO v_foreign_members
  FROM public.branch_members bm
  WHERE bm.organization_id = c_org_id AND bm.deleted_at IS NULL AND bm.is_active
    AND NOT (v_member_uids @> jsonb_build_array(bm.user_id::text));

  IF v_non_seed_appts > 0 OR v_non_seed_patients > 0 OR v_non_seed_owners > 0 OR v_foreign_members > 0 THEN
    v_can_remove_org := false;
    RAISE NOTICE 'ACADEMIA_DEMO rollback: non-seed dependents present (appts=% patients=% owners=% extra_members=%) — will NOT soft-delete org/branch',
      v_non_seed_appts, v_non_seed_patients, v_non_seed_owners, v_foreign_members;
  END IF;

  -- Seed appointments only
  UPDATE public.appointments
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND source_system = c_source AND deleted_at IS NULL;

  UPDATE public.notifications n
  SET deleted_at = coalesce(n.deleted_at, now())
  WHERE n.organization_id = c_org_id AND n.deleted_at IS NULL
    AND n.related_type = 'appointment'
    AND n.related_id IN (
      SELECT a.id FROM public.appointments a
      WHERE a.organization_id = c_org_id AND a.source_system = c_source
    );

  -- Registry schedules only (preserve unrelated professional schedules)
  UPDATE public.professional_schedules s
  SET deleted_at = coalesce(s.deleted_at, now()), updated_at = now()
  WHERE s.organization_id = c_org_id
    AND s.deleted_at IS NULL
    AND v_sched_ids @> jsonb_build_array(s.id::text);

  UPDATE public.professionals
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE id = c_prof_id AND organization_id = c_org_id
    AND coalesce(notes, '') = c_source AND deleted_at IS NULL;

  UPDATE public.patients
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND source_system = c_source
    AND (id = c_patient_id OR source_record_id = 'patient-luna')
    AND deleted_at IS NULL;

  UPDATE public.owners
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND source_system = c_source
    AND (id = c_owner_id OR source_record_id = 'owner-maria')
    AND deleted_at IS NULL;

  -- Non-owner seed memberships / profiles only.
  -- LAST_CENTRAL_ADMIN (profiles_guard + branch_members_guard) refuses demoting the final owner.
  -- Seed owner profile/membership are retained intentionally; under a soft-deleted org they are inert.
  UPDATE public.branch_members bm
  SET deleted_at = coalesce(bm.deleted_at, now()), is_active = false, updated_at = now()
  WHERE bm.organization_id = c_org_id AND bm.deleted_at IS NULL
    AND v_member_uids @> jsonb_build_array(bm.user_id::text)
    AND bm.role IS DISTINCT FROM 'owner';

  UPDATE public.profiles p
  SET deleted_at = coalesce(p.deleted_at, now()), is_active = false, updated_at = now()
  WHERE p.organization_id = c_org_id AND p.deleted_at IS NULL
    AND v_profile_ids @> jsonb_build_array(p.id::text)
    AND NOT EXISTS (
      SELECT 1 FROM public.branch_members bm
      WHERE bm.user_id = p.id AND bm.organization_id = c_org_id
        AND bm.deleted_at IS NULL AND bm.is_active AND bm.role = 'owner'
    );

  -- Billing: tag only; never delete history / audit
  UPDATE public.organization_subscriptions
  SET metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('academia_demo_rolled_back', true)
  WHERE organization_id = c_org_id
    AND coalesce((metadata->>'academia_demo_source'), '') = c_source;

  IF v_can_remove_org THEN
    UPDATE public.branches
    SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
    WHERE id = c_branch_id AND organization_id = c_org_id AND deleted_at IS NULL;

    UPDATE public.organizations
    SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE id = c_org_id AND deleted_at IS NULL
      AND settings->>'academia_demo_key' = c_marker;

    RAISE NOTICE 'ACADEMIA_DEMO rollback complete (org soft-deleted; seed owner rows retained per LAST_CENTRAL_ADMIN)';
  ELSE
    RAISE NOTICE 'ACADEMIA_DEMO rollback partial: seed domain rows cleaned; org retained due to non-seed dependents (BLOCKER for full teardown)';
    RAISE NOTICE 'ACADEMIA_DEMO rollback: seed owner membership/profile preserved (LAST_CENTRAL_ADMIN)';
  END IF;
END $$;
