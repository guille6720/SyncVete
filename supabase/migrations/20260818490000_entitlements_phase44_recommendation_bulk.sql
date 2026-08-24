-- Phase 44: Bulk commercial assignee + contact actions.
-- Still NO automatic plan changes.
-- Depends on phase 31–43.

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(
  p_organization_ids UUID[],
  p_assigned_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      WHERE pa.user_id = p_assigned_to
        AND pa.is_active = true
    ) THEN
      RAISE EXCEPTION 'assignee must be an active platform admin';
    END IF;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      v_result := public.superadmin_set_plan_recommendation_assignee(v_id, p_assigned_to);
      IF COALESCE((v_result ->> 'unchanged')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'assigned_to', p_assigned_to,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(
  p_organization_ids UUID[],
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_touch_plan_recommendation_contact(v_id, p_note);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'errors', v_errors,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) IS
  'Bulk assign Superadmin owner for advisory recommendations. Max 50 orgs. Never changes plans.';
COMMENT ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) IS
  'Bulk register commercial contact. Max 50 orgs. Never changes plans.';
