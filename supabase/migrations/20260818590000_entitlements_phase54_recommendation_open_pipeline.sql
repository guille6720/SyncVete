-- Phase 54: Full open commercial pipeline list + export.
-- Still NO automatic plan changes.
-- Depends on phase 31–53.

CREATE OR REPLACE FUNCTION public.superadmin_list_open_recommendation_pipeline(
  p_limit INT DEFAULT 100,
  p_mine_only BOOLEAN DEFAULT false,
  p_sort TEXT DEFAULT 'age_desc'
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  score INT,
  usage_level NUMERIC,
  age_days INT,
  last_touch_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  is_frozen BOOLEAN,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  commercial_tags TEXT[],
  commercial_note TEXT,
  recommended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_uid UUID;
  v_sort TEXT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
  v_sort := lower(COALESCE(NULLIF(btrim(p_sort), ''), 'age_desc'));
  IF v_sort NOT IN ('age_desc', 'age_asc', 'severity', 'name', 'follow_up') THEN
    v_sort := 'age_desc';
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.score,
    r.usage_level,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS age_days,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    r.last_contacted_at,
    r.follow_up_at,
    COALESCE(r.is_frozen, false) AS is_frozen,
    r.assigned_to,
    pa.email,
    r.commercial_outcome,
    r.commercial_tags,
    r.commercial_note,
    r.recommended_at
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
    )
  ORDER BY
    CASE
      WHEN v_sort = 'severity' AND r.severity = 'critical' THEN 0
      WHEN v_sort = 'severity' AND r.severity = 'warning' THEN 1
      WHEN v_sort = 'severity' THEN 2
      ELSE 0
    END,
    CASE
      WHEN v_sort = 'age_asc' THEN public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      )
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN v_sort = 'age_desc' THEN public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      )
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN v_sort = 'follow_up' THEN r.follow_up_at
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN v_sort = 'name' THEN o.name
      ELSE NULL
    END ASC,
    o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) IS
  'Full open advisory pipeline with commercial meta for board/export. Never changes plans.';
