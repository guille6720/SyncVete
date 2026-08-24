-- Phase 55: Priority work queue for open advisory recommendations.
-- Still NO automatic plan changes.
-- Depends on phase 31–54.

CREATE OR REPLACE FUNCTION public.recommendation_commercial_priority(
  p_now TIMESTAMPTZ,
  p_severity TEXT,
  p_usage_level NUMERIC,
  p_age_days INT,
  p_last_contacted_at TIMESTAMPTZ,
  p_follow_up_at TIMESTAMPTZ,
  p_is_frozen BOOLEAN,
  p_assigned_to UUID
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_priority INT := 0;
BEGIN
  -- Base severity
  IF p_severity = 'critical' THEN
    v_priority := v_priority + 40;
  ELSIF p_severity = 'warning' THEN
    v_priority := v_priority + 20;
  ELSIF p_severity = 'info' THEN
    v_priority := v_priority + 8;
  END IF;

  -- Usage pressure
  IF p_usage_level IS NOT NULL THEN
    IF p_usage_level >= 1.0 THEN
      v_priority := v_priority + 25;
    ELSIF p_usage_level >= 0.9 THEN
      v_priority := v_priority + 15;
    ELSIF p_usage_level >= 0.8 THEN
      v_priority := v_priority + 8;
    END IF;
  END IF;

  -- Aging
  IF p_age_days IS NOT NULL THEN
    IF p_age_days >= 31 THEN
      v_priority := v_priority + 30;
    ELSIF p_age_days >= 15 THEN
      v_priority := v_priority + 18;
    ELSIF p_age_days >= 8 THEN
      v_priority := v_priority + 10;
    END IF;
  END IF;

  -- Never contacted
  IF p_last_contacted_at IS NULL THEN
    v_priority := v_priority + 15;
  END IF;

  -- Overdue follow-up
  IF p_follow_up_at IS NOT NULL AND p_follow_up_at < p_now THEN
    v_priority := v_priority + 22;
  END IF;

  -- Unassigned open work
  IF p_assigned_to IS NULL THEN
    v_priority := v_priority + 12;
  END IF;

  -- Frozen items are parked: deprioritize
  IF COALESCE(p_is_frozen, false) THEN
    v_priority := GREATEST(0, v_priority - 35);
  END IF;

  RETURN v_priority;
END;
$$;

CREATE OR REPLACE FUNCTION public.recommendation_commercial_priority_reasons(
  p_now TIMESTAMPTZ,
  p_severity TEXT,
  p_usage_level NUMERIC,
  p_age_days INT,
  p_last_contacted_at TIMESTAMPTZ,
  p_follow_up_at TIMESTAMPTZ,
  p_is_frozen BOOLEAN,
  p_assigned_to UUID
)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_reasons TEXT[] := '{}'::TEXT[];
BEGIN
  IF p_severity = 'critical' THEN
    v_reasons := array_append(v_reasons, 'critical');
  ELSIF p_severity = 'warning' THEN
    v_reasons := array_append(v_reasons, 'warning');
  END IF;

  IF p_usage_level IS NOT NULL AND p_usage_level >= 1.0 THEN
    v_reasons := array_append(v_reasons, 'uso >= 100%');
  ELSIF p_usage_level IS NOT NULL AND p_usage_level >= 0.9 THEN
    v_reasons := array_append(v_reasons, 'uso >= 90%');
  END IF;

  IF p_age_days IS NOT NULL AND p_age_days >= 31 THEN
    v_reasons := array_append(v_reasons, '31+ días');
  ELSIF p_age_days IS NOT NULL AND p_age_days >= 15 THEN
    v_reasons := array_append(v_reasons, '15–30 días');
  END IF;

  IF p_last_contacted_at IS NULL THEN
    v_reasons := array_append(v_reasons, 'sin contacto');
  END IF;

  IF p_follow_up_at IS NOT NULL AND p_follow_up_at < p_now THEN
    v_reasons := array_append(v_reasons, 'follow-up vencido');
  END IF;

  IF p_assigned_to IS NULL THEN
    v_reasons := array_append(v_reasons, 'sin responsable');
  END IF;

  IF COALESCE(p_is_frozen, false) THEN
    v_reasons := array_append(v_reasons, 'congelada');
  END IF;

  RETURN v_reasons;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_priority_queue(
  p_limit INT DEFAULT 25,
  p_mine_only BOOLEAN DEFAULT false,
  p_include_frozen BOOLEAN DEFAULT false
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
  priority INT,
  priority_reasons TEXT[],
  last_touch_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  is_frozen BOOLEAN,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  commercial_tags TEXT[],
  commercial_note TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_uid UUID;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

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
    public.recommendation_commercial_priority(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to
    ) AS priority,
    public.recommendation_commercial_priority_reasons(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to
    ) AS priority_reasons,
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
    r.commercial_note
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_include_frozen, false) = true
      OR COALESCE(r.is_frozen, false) = false
    )
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
    )
  ORDER BY
    public.recommendation_commercial_priority(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to
    ) DESC,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN) IS
  'Advisory priority work queue. Scoring is heuristic only. Never changes plans.';
