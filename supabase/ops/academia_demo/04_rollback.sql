-- Academia Demo — compensating cleanup (STAGING ONLY) — Phase 5C.1
-- Soft-deletes ONLY seed-managed rows (source_system / fixed IDs / QA emails).
-- Does NOT delete auth.users (Auth Admin separately).
-- Does NOT touch rows outside the verified demo organization.
--
-- Approval gate (same transaction):
--   SELECT set_config('app.academia_demo_seed_approved', 'yes', true);
-- Wrap with BEGIN; ... ROLLBACK; until authorized COMMIT.

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
  v_owner_uid  uuid;
  v_vet_uid    uuid;
  v_rec_uid    uuid;
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

  SELECT id INTO v_owner_uid FROM auth.users WHERE email = 'owner.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_vet_uid   FROM auth.users WHERE email = 'vet.demo@academia-demo.invalid' LIMIT 1;
  SELECT id INTO v_rec_uid   FROM auth.users WHERE email = 'recepcion.demo@academia-demo.invalid' LIMIT 1;

  -- Seed appointments only
  UPDATE public.appointments
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id
    AND source_system = c_source
    AND deleted_at IS NULL;

  -- Notifications tied to those appointments
  UPDATE public.notifications n
  SET deleted_at = coalesce(n.deleted_at, now())
  WHERE n.organization_id = c_org_id
    AND n.deleted_at IS NULL
    AND n.related_type = 'appointment'
    AND n.related_id IN (
      SELECT a.id FROM public.appointments a
      WHERE a.organization_id = c_org_id AND a.source_system = c_source
    );

  -- Schedules for demo vet on demo branch only
  IF v_vet_uid IS NOT NULL THEN
    UPDATE public.professional_schedules
    SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
    WHERE organization_id = c_org_id
      AND branch_id = c_branch_id
      AND user_id = v_vet_uid
      AND deleted_at IS NULL;
  END IF;

  UPDATE public.professionals
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE id = c_prof_id
    AND organization_id = c_org_id
    AND deleted_at IS NULL;

  UPDATE public.patients
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id
    AND (
      id = c_patient_id
      OR (source_system = c_source AND source_record_id = 'patient-luna')
    )
    AND deleted_at IS NULL;

  UPDATE public.owners
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id
    AND (
      id = c_owner_id
      OR (source_system = c_source AND source_record_id = 'owner-maria')
    )
    AND deleted_at IS NULL;

  -- QA memberships / profiles only for the three demo emails
  UPDATE public.branch_members
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE organization_id = c_org_id
    AND deleted_at IS NULL
    AND user_id IN (v_owner_uid, v_vet_uid, v_rec_uid);

  UPDATE public.profiles
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE organization_id = c_org_id
    AND deleted_at IS NULL
    AND id IN (v_owner_uid, v_vet_uid, v_rec_uid);

  UPDATE public.branches
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE id = c_branch_id
    AND organization_id = c_org_id
    AND deleted_at IS NULL;

  -- Cancel only demo-tagged trial subscriptions (preserve other billing history)
  UPDATE public.organization_subscriptions
  SET status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('academia_demo_rolled_back', true)
  WHERE organization_id = c_org_id
    AND cancelled_at IS NULL
    AND coalesce((metadata->>'academia_demo')::boolean, false);

  UPDATE public.organizations
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE id = c_org_id
    AND deleted_at IS NULL
    AND settings->>'academia_demo_key' = c_marker;

  RAISE NOTICE 'ACADEMIA_DEMO rollback soft-deleted seed-managed rows for org %', c_org_id;
END $$;
