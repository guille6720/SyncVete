-- Phase 57: Commercial activity trends (flow metrics from events + outcomes).
-- Still NO automatic plan changes.
-- Depends on phase 31–56.

CREATE OR REPLACE FUNCTION public.recommendation_trends_window(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacted INT := 0;
  v_noted INT := 0;
  v_assigned INT := 0;
  v_unassigned INT := 0;
  v_tagged INT := 0;
  v_follow_up_set INT := 0;
  v_frozen INT := 0;
  v_unfrozen INT := 0;
  v_outcome_won INT := 0;
  v_outcome_lost INT := 0;
  v_outcome_deferred INT := 0;
  v_outcome_not_a_fit INT := 0;
  v_closed INT := 0;
  v_win_rate NUMERIC;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'invalid trend window';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'contacted'),
    COUNT(*) FILTER (WHERE e.event_type = 'noted'),
    COUNT(*) FILTER (WHERE e.event_type = 'assigned'),
    COUNT(*) FILTER (WHERE e.event_type = 'unassigned'),
    COUNT(*) FILTER (WHERE e.event_type = 'tagged'),
    COUNT(*) FILTER (WHERE e.event_type = 'follow_up_set'),
    COUNT(*) FILTER (WHERE e.event_type = 'frozen'),
    COUNT(*) FILTER (WHERE e.event_type = 'unfrozen')
  INTO
    v_contacted,
    v_noted,
    v_assigned,
    v_unassigned,
    v_tagged,
    v_follow_up_set,
    v_frozen,
    v_unfrozen
  FROM public.organization_plan_recommendation_events e
  JOIN public.organizations o ON o.id = e.organization_id
  WHERE o.deleted_at IS NULL
    AND e.created_at >= p_from
    AND e.created_at < p_to;

  SELECT
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit')
  INTO
    v_outcome_won,
    v_outcome_lost,
    v_outcome_deferred,
    v_outcome_not_a_fit
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE o.deleted_at IS NULL
    AND r.commercial_outcome_at IS NOT NULL
    AND r.commercial_outcome_at >= p_from
    AND r.commercial_outcome_at < p_to
    AND r.commercial_outcome IN ('won', 'lost', 'deferred', 'not_a_fit');

  v_closed := COALESCE(v_outcome_won, 0) + COALESCE(v_outcome_lost, 0) + COALESCE(v_outcome_not_a_fit, 0);
  v_win_rate := CASE
    WHEN v_closed > 0 THEN ROUND((COALESCE(v_outcome_won, 0)::NUMERIC / v_closed::NUMERIC) * 100, 1)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'contacted', COALESCE(v_contacted, 0),
    'noted', COALESCE(v_noted, 0),
    'assigned', COALESCE(v_assigned, 0),
    'unassigned', COALESCE(v_unassigned, 0),
    'tagged', COALESCE(v_tagged, 0),
    'follow_up_set', COALESCE(v_follow_up_set, 0),
    'frozen', COALESCE(v_frozen, 0),
    'unfrozen', COALESCE(v_unfrozen, 0),
    'outcome_won', COALESCE(v_outcome_won, 0),
    'outcome_lost', COALESCE(v_outcome_lost, 0),
    'outcome_deferred', COALESCE(v_outcome_deferred, 0),
    'outcome_not_a_fit', COALESCE(v_outcome_not_a_fit, 0),
    'closed_decisions', v_closed,
    'win_rate_pct', v_win_rate
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recommendation_trends_window(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
-- Not granted to authenticated: only called by superadmin_recommendation_trends (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_trends()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_d7 TIMESTAMPTZ := v_now - interval '7 days';
  v_d14 TIMESTAMPTZ := v_now - interval '14 days';
  v_d30 TIMESTAMPTZ := v_now - interval '30 days';
  v_d7_cur JSONB;
  v_d7_prev JSONB;
  v_d30_cur JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  v_d7_cur := public.recommendation_trends_window(v_d7, v_now);
  v_d7_prev := public.recommendation_trends_window(v_d14, v_d7);
  v_d30_cur := public.recommendation_trends_window(v_d30, v_now);

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'd7', v_d7_cur,
    'd7_prev', v_d7_prev,
    'd30', v_d30_cur
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_trends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_trends() TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_trends() IS
  'Advisory commercial flow trends (7d vs prior 7d, 30d). Never changes plans.';
COMMENT ON FUNCTION public.recommendation_trends_window(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Internal window aggregator for commercial trend metrics.';
