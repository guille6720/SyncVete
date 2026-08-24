-- Phase 46: Bulk freeze / unfreeze advisory recommendations.
-- Still NO automatic plan changes.
-- Depends on phase 31–45.

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(
  p_organization_ids UUID[],
  p_frozen BOOLEAN DEFAULT true,
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
      PERFORM public.superadmin_set_plan_recommendation_freeze(
        v_id,
        COALESCE(p_frozen, true),
        p_note
      );
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
    'frozen', COALESCE(p_frozen, true),
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) IS
  'Bulk freeze/unfreeze advisory recommendations. Max 50 orgs. Never changes plans.';
