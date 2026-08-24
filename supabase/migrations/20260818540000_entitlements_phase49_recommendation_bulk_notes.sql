-- Phase 49: Bulk commercial notes on advisory recommendations.
-- Still NO automatic plan changes.
-- Depends on phase 31–48.

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_note(
  p_organization_ids UUID[],
  p_note TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'replace'
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
  v_mode TEXT;
  v_incoming TEXT;
  v_existing TEXT;
  v_final TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'replace'));
  IF v_mode NOT IN ('replace', 'append', 'clear') THEN
    RAISE EXCEPTION 'invalid note mode';
  END IF;

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

  v_incoming := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_mode = 'clear' THEN
    v_incoming := NULL;
  ELSIF v_mode IN ('replace', 'append') AND v_incoming IS NULL THEN
    RAISE EXCEPTION 'note required for replace/append';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      IF v_mode = 'append' THEN
        SELECT r.commercial_note INTO v_existing
        FROM public.organization_plan_recommendations r
        WHERE r.organization_id = v_id;
        IF v_existing IS NULL OR btrim(v_existing) = '' THEN
          v_final := v_incoming;
        ELSE
          v_final := left(v_existing || E'\n' || v_incoming, 2000);
        END IF;
      ELSE
        v_final := v_incoming;
      END IF;

      PERFORM public.superadmin_set_plan_recommendation_note(v_id, v_final);
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
    'mode', CASE WHEN v_mode = 'clear' THEN 'clear' ELSE v_mode END,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) IS
  'Bulk set/append/clear commercial notes. Max 50 orgs. Never changes plans.';
