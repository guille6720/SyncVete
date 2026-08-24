-- Phase 43: Commercial conversion funnel metrics (advisory analytics).
-- Still NO automatic plan changes.
-- Depends on phase 31–42.

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_funnel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_open INT := 0;
  v_contacted_open INT := 0;
  v_with_follow_up INT := 0;
  v_with_assignee INT := 0;
  v_frozen_open INT := 0;
  v_won INT := 0;
  v_lost INT := 0;
  v_deferred INT := 0;
  v_not_a_fit INT := 0;
  v_closed INT := 0;
  v_accepted INT := 0;
  v_avg_days_to_contact NUMERIC;
  v_avg_days_to_outcome NUMERIC;
  v_avg_days_open NUMERIC;
  v_contact_rate NUMERIC;
  v_win_rate NUMERIC;
  v_close_rate NUMERIC;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.last_contacted_at IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.follow_up_at IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.assigned_to IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.is_frozen = true
    ),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit'),
    COUNT(*) FILTER (WHERE r.status = 'accepted'),
    AVG(
      EXTRACT(EPOCH FROM (r.last_contacted_at - COALESCE(r.recommended_at, r.created_at))) / 86400.0
    ) FILTER (
      WHERE r.last_contacted_at IS NOT NULL
        AND COALESCE(r.recommended_at, r.created_at) IS NOT NULL
        AND r.last_contacted_at >= COALESCE(r.recommended_at, r.created_at)
    ),
    AVG(
      EXTRACT(EPOCH FROM (r.commercial_outcome_at - COALESCE(r.recommended_at, r.created_at))) / 86400.0
    ) FILTER (
      WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
        AND r.commercial_outcome_at IS NOT NULL
        AND COALESCE(r.recommended_at, r.created_at) IS NOT NULL
        AND r.commercial_outcome_at >= COALESCE(r.recommended_at, r.created_at)
    ),
    AVG(
      EXTRACT(EPOCH FROM (
        v_now - public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        )
      )) / 86400.0
    ) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) IS NOT NULL
    )
  INTO
    v_open,
    v_contacted_open,
    v_with_follow_up,
    v_with_assignee,
    v_frozen_open,
    v_won,
    v_lost,
    v_deferred,
    v_not_a_fit,
    v_accepted,
    v_avg_days_to_contact,
    v_avg_days_to_outcome,
    v_avg_days_open
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE o.deleted_at IS NULL;

  v_closed := v_won + v_lost + v_not_a_fit;
  v_contact_rate := CASE
    WHEN v_open > 0 THEN ROUND((v_contacted_open::NUMERIC / v_open::NUMERIC) * 100, 1)
    ELSE NULL
  END;
  v_win_rate := CASE
    WHEN v_closed > 0 THEN ROUND((v_won::NUMERIC / v_closed::NUMERIC) * 100, 1)
    ELSE NULL
  END;
  v_close_rate := CASE
    WHEN (v_open + v_closed) > 0 THEN ROUND((v_closed::NUMERIC / (v_open + v_closed)::NUMERIC) * 100, 1)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'open_pipeline', v_open,
    'contacted_open', v_contacted_open,
    'with_follow_up', v_with_follow_up,
    'with_assignee', v_with_assignee,
    'frozen_open', v_frozen_open,
    'outcome_won', v_won,
    'outcome_lost', v_lost,
    'outcome_deferred', v_deferred,
    'outcome_not_a_fit', v_not_a_fit,
    'closed_decisions', v_closed,
    'accepted_plan_changes', v_accepted,
    'contact_rate_pct', v_contact_rate,
    'win_rate_pct', v_win_rate,
    'close_rate_pct', v_close_rate,
    'avg_days_to_first_contact', CASE
      WHEN v_avg_days_to_contact IS NULL THEN NULL
      ELSE ROUND(v_avg_days_to_contact, 1)
    END,
    'avg_days_to_outcome', CASE
      WHEN v_avg_days_to_outcome IS NULL THEN NULL
      ELSE ROUND(v_avg_days_to_outcome, 1)
    END,
    'avg_days_open', CASE
      WHEN v_avg_days_open IS NULL THEN NULL
      ELSE ROUND(v_avg_days_open, 1)
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_funnel() TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_funnel() IS
  'Advisory commercial funnel metrics. Never changes plans. win_rate excludes deferred.';
