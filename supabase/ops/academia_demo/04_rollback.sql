-- Academia Demo — compensating cleanup (STAGING ONLY)
-- Soft-deletes demo-scoped rows. Does NOT delete auth.users (use Auth Admin separately).
-- Does NOT touch any organization without academia_demo_key = sv-academia-demo-v1.
-- Wrap with BEGIN; ... ROLLBACK; until authorized.

DO $$
DECLARE
  c_org_id uuid := 'a0a0a0a0-d0e0-4000-8000-000000000001';
  c_marker text := 'sv-academia-demo-v1';
  v_ok boolean;
BEGIN
  SELECT coalesce((settings->>'academia_demo')::boolean, false)
     AND settings->>'academia_demo_key' = c_marker
  INTO v_ok
  FROM public.organizations
  WHERE id = c_org_id;

  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'ACADEMIA_DEMO rollback refused: org missing or marker mismatch';
  END IF;

  UPDATE public.appointments
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.professional_schedules
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.professionals
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.patients
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.owners
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.branch_members
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.profiles
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.notifications
  SET deleted_at = coalesce(deleted_at, now())
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  UPDATE public.branches
  SET deleted_at = coalesce(deleted_at, now()), is_active = false, updated_at = now()
  WHERE organization_id = c_org_id AND deleted_at IS NULL;

  -- Cancel trial subscription (do not delete billing history)
  UPDATE public.organization_subscriptions
  SET status = 'cancelled',
      cancelled_at = coalesce(cancelled_at, timezone('utc', now())),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('academia_demo_rolled_back', true)
  WHERE organization_id = c_org_id
    AND cancelled_at IS NULL;

  UPDATE public.organizations
  SET deleted_at = coalesce(deleted_at, now()), updated_at = now()
  WHERE id = c_org_id AND deleted_at IS NULL;

  RAISE NOTICE 'ACADEMIA_DEMO rollback soft-deleted org %', c_org_id;
END $$;

-- Auth users remain; disable via Auth Admin if needed (banned / delete).
-- Example (manual): DELETE via Admin API for @academia-demo.invalid emails only.
