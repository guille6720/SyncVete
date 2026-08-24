-- Phase 45: Bulk follow-up + bulk commercial outcome.
-- Still NO automatic plan changes.
-- Depends on phase 31–44.

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(
  p_organization_ids UUID[],
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL
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
      PERFORM public.superadmin_set_plan_recommendation_follow_up(v_id, p_follow_up_at);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', 0,
    'errors', v_errors,
    'follow_up_at', p_follow_up_at,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(
  p_organization_ids UUID[],
  p_outcome TEXT DEFAULT NULL,
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
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost', 'deferred', 'not_a_fit') THEN
    RAISE EXCEPTION 'invalid commercial outcome';
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
      v_result := public.superadmin_set_plan_recommendation_outcome(v_id, p_outcome, p_note);
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
    'outcome', p_outcome,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) IS
  'Bulk set/clear follow-up dates. Max 50 orgs. Never changes plans.';
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) IS
  'Bulk set/clear commercial outcomes. Max 50 orgs. Won does not auto-upgrade plans.';
