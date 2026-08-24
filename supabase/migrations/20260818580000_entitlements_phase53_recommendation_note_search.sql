-- Phase 53: Search commercial notes across advisory recommendations.
-- Still NO automatic plan changes.
-- Depends on phase 31–52.
-- ILIKE over a small Superadmin table; no pg_trgm dependency.

CREATE OR REPLACE FUNCTION public.superadmin_search_recommendation_notes(
  p_query TEXT,
  p_limit INT DEFAULT 40
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  commercial_note TEXT,
  commercial_outcome_note TEXT,
  last_contact_note TEXT,
  frozen_note TEXT,
  commercial_tags TEXT[],
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  matched_in TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q TEXT;
  v_limit INT;
  v_pattern TEXT;
BEGIN
  PERFORM public.require_platform_admin();
  v_q := NULLIF(btrim(COALESCE(p_query, '')), '');
  IF v_q IS NULL OR char_length(v_q) < 2 THEN
    RAISE EXCEPTION 'query too short';
  END IF;
  IF char_length(v_q) > 80 THEN
    RAISE EXCEPTION 'query too long';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.commercial_note,
    r.commercial_outcome_note,
    r.last_contact_note,
    r.frozen_note,
    r.commercial_tags,
    r.assigned_to,
    pa.email,
    r.commercial_outcome,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN r.commercial_note ILIKE v_pattern ESCAPE '\' THEN 'commercial_note' END,
      CASE WHEN r.commercial_outcome_note ILIKE v_pattern ESCAPE '\' THEN 'outcome_note' END,
      CASE WHEN r.last_contact_note ILIKE v_pattern ESCAPE '\' THEN 'contact_note' END,
      CASE WHEN r.frozen_note ILIKE v_pattern ESCAPE '\' THEN 'frozen_note' END
    ], NULL) AS matched_in
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND (
      r.commercial_note ILIKE v_pattern ESCAPE '\'
      OR r.commercial_outcome_note ILIKE v_pattern ESCAPE '\'
      OR r.last_contact_note ILIKE v_pattern ESCAPE '\'
      OR r.frozen_note ILIKE v_pattern ESCAPE '\'
    )
  ORDER BY
    CASE
      WHEN r.commercial_note ILIKE v_pattern ESCAPE '\' THEN 0
      ELSE 1
    END,
    COALESCE(r.commercial_note_updated_at, r.updated_at) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) IS
  'Search Superadmin commercial notes (note/outcome/contact/freeze). Never changes plans.';
