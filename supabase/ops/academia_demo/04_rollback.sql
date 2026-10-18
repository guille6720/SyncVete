-- Academia Demo — compensating cleanup — Phase 5C.2 ownership fix
-- Soft-deletes ONLY seed-owned rows verified via an intact registry.
-- Rejects missing, altered, inconsistent, or unauthorized registry entries.
-- Never soft-deletes tester-created records (even if listed in a forged registry).
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
  c_managed_by text := 'syncvete_ops';
  v_ok         boolean;
  v_registry   jsonb;
  v_sched_ids  jsonb;
  v_profile_ids jsonb;
  v_member_uids jsonb;
  v_vet_uid    uuid;
  v_non_seed_appts int;
  v_non_seed_patients int;
  v_non_seed_owners int;
  v_foreign_members int;
  v_can_remove_org boolean := true;
  v_id text;
  v_sched_uuid uuid;
  v_profile_uuid uuid;
  v_member_uuid uuid;
  v_qa_emails text[] := ARRAY[
    'owner.demo@academia-demo.invalid',
    'vet.demo@academia-demo.invalid',
    'recepcion.demo@academia-demo.invalid'
  ];
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

  SELECT settings -> 'academia_demo_registry'
  INTO v_registry
  FROM public.organizations WHERE id = c_org_id;

  IF v_registry IS NULL OR jsonb_typeof(v_registry) <> 'object' OR v_registry = '{}'::jsonb THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: missing academia_demo_registry (ambiguous ownership)';
  END IF;
  IF coalesce(v_registry->>'source', '') IS DISTINCT FROM c_source THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: registry source mismatch';
  END IF;
  IF coalesce(v_registry->>'managed_by', '') IS DISTINCT FROM c_managed_by THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: registry managed_by unauthorized/missing';
  END IF;

  -- Fixed seed IDs must match constants (detect altered registry)
  IF coalesce(v_registry->>'branch_id', '') IS DISTINCT FROM c_branch_id::text
     OR coalesce(v_registry->>'owner_id', '') IS DISTINCT FROM c_owner_id::text
     OR coalesce(v_registry->>'patient_id', '') IS DISTINCT FROM c_patient_id::text
     OR coalesce(v_registry->>'professional_id', '') IS DISTINCT FROM c_prof_id::text
  THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: registry fixed ids altered/inconsistent';
  END IF;

  v_sched_ids := coalesce(v_registry -> 'schedule_ids', '[]'::jsonb);
  v_profile_ids := coalesce(v_registry -> 'profile_ids', '[]'::jsonb);
  v_member_uids := coalesce(v_registry -> 'member_user_ids', '[]'::jsonb);

  IF jsonb_typeof(v_sched_ids) <> 'array'
     OR jsonb_typeof(v_profile_ids) <> 'array'
     OR jsonb_typeof(v_member_uids) <> 'array'
  THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: registry array fields malformed';
  END IF;

  SELECT id INTO v_vet_uid
  FROM auth.users WHERE email = 'vet.demo@academia-demo.invalid' LIMIT 1;

  -- Verify every registered profile is a QA demo identity in the demo org
  FOR v_id IN SELECT jsonb_array_elements_text(v_profile_ids)
  LOOP
    BEGIN
      v_profile_uuid := v_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: invalid profile id in registry';
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.id = v_profile_uuid
        AND p.organization_id = c_org_id
        AND u.email = ANY (v_qa_emails)
    ) THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: unauthorized/inconsistent profile_id % in registry', v_id;
    END IF;
  END LOOP;

  -- Verify every registered membership user is a QA demo identity in the demo org
  FOR v_id IN SELECT jsonb_array_elements_text(v_member_uids)
  LOOP
    BEGIN
      v_member_uuid := v_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: invalid member id in registry';
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.branch_members bm
      JOIN auth.users u ON u.id = bm.user_id
      WHERE bm.user_id = v_member_uuid
        AND bm.organization_id = c_org_id
        AND bm.deleted_at IS NULL
        AND u.email = ANY (v_qa_emails)
    ) AND NOT EXISTS (
      -- Allow already soft-deleted seed members on idempotent re-run
      SELECT 1
      FROM public.branch_members bm
      JOIN auth.users u ON u.id = bm.user_id
      WHERE bm.user_id = v_member_uuid
        AND bm.organization_id = c_org_id
        AND u.email = ANY (v_qa_emails)
    ) THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: unauthorized/inconsistent member_user_id % in registry', v_id;
    END IF;
  END LOOP;

  -- Verify every registered schedule belongs to demo org/branch/seed vet
  FOR v_id IN SELECT jsonb_array_elements_text(v_sched_ids)
  LOOP
    BEGIN
      v_sched_uuid := v_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: invalid schedule id in registry';
    END;
    IF v_vet_uid IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.professional_schedules s
      WHERE s.id = v_sched_uuid
        AND s.organization_id = c_org_id
        AND s.branch_id = c_branch_id
        AND s.user_id = v_vet_uid
    ) THEN
      RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: unauthorized/inconsistent schedule_id % in registry', v_id;
    END IF;
  END LOOP;

  -- Detect non-seed dependents (tester artifacts) — block org teardown only
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

  -- Seed appointments only (source_system verified — never tester rows)
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

  -- Registry schedules only after verification above
  UPDATE public.professional_schedules s
  SET deleted_at = coalesce(s.deleted_at, now()), updated_at = now()
  WHERE s.organization_id = c_org_id
    AND s.branch_id = c_branch_id
    AND s.user_id = v_vet_uid
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

  -- Non-owner seed memberships / profiles only (QA-verified registry entries).
  -- LAST_CENTRAL_ADMIN refuses demoting the final owner — retain intentionally.
  UPDATE public.branch_members bm
  SET deleted_at = coalesce(bm.deleted_at, now()), is_active = false, updated_at = now()
  WHERE bm.organization_id = c_org_id AND bm.deleted_at IS NULL
    AND v_member_uids @> jsonb_build_array(bm.user_id::text)
    AND bm.role IS DISTINCT FROM 'owner'
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = bm.user_id AND u.email = ANY (v_qa_emails)
    );

  UPDATE public.profiles p
  SET deleted_at = coalesce(p.deleted_at, now()), is_active = false, updated_at = now()
  WHERE p.organization_id = c_org_id AND p.deleted_at IS NULL
    AND v_profile_ids @> jsonb_build_array(p.id::text)
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = p.id AND u.email = ANY (v_qa_emails)
    )
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
