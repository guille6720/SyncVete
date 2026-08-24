-- Phase 41: Superadmin commercial digest (due today / overdue / stale / critical).
-- Still NO automatic plan changes.
-- Depends on phase 31–40.

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_digest(
  p_limit INT DEFAULT 12,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
  v_stale INT := 14;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_overdue JSONB;
  v_due_today JSONB;
  v_stale_unassigned JSONB;
  v_critical_unassigned JSONB;
  v_recent_outcomes JSONB;
  v_mine UUID;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50);
  v_mine := CASE WHEN COALESCE(p_mine_only, false) THEN v_uid ELSE NULL END;

  SELECT s.stale_days INTO v_stale
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  v_today_start := date_trunc('day', v_now);
  v_today_end := v_today_start + interval '1 day';

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC), '[]'::jsonb)
  INTO v_overdue
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.follow_up_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'overdue_follow_up'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.follow_up_at IS NOT NULL
      AND r.follow_up_at < v_today_start
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.follow_up_at ASC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC), '[]'::jsonb)
  INTO v_due_today
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.follow_up_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'due_today'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.follow_up_at IS NOT NULL
      AND r.follow_up_at >= v_today_start
      AND r.follow_up_at < v_today_end
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.follow_up_at ASC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC NULLS FIRST), '[]'::jsonb)
  INTO v_stale_unassigned
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at) AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      CASE
        WHEN v_mine IS NOT NULL THEN 'stale_mine'
        ELSE 'stale_unassigned'
      END AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at)
        < v_now - make_interval(days => v_stale)
      AND (
        (v_mine IS NULL AND r.assigned_to IS NULL)
        OR (v_mine IS NOT NULL AND r.assigned_to = v_mine)
      )
    ORDER BY COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at) ASC NULLS FIRST
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.usage_level DESC), '[]'::jsonb)
  INTO v_critical_unassigned
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.recommended_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      CASE
        WHEN v_mine IS NOT NULL THEN 'critical_mine'
        ELSE 'critical_unassigned'
      END AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status = 'recommended'
      AND r.severity = 'critical'
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND (
        (v_mine IS NULL AND r.assigned_to IS NULL)
        OR (v_mine IS NOT NULL AND r.assigned_to = v_mine)
      )
    ORDER BY r.usage_level DESC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_recent_outcomes
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.commercial_outcome_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_outcome_note AS commercial_note,
      ('outcome_' || r.commercial_outcome)::TEXT AS kind,
      r.commercial_outcome
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.commercial_outcome IS NOT NULL
      AND r.commercial_outcome_at IS NOT NULL
      AND r.commercial_outcome_at >= v_now - interval '7 days'
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.commercial_outcome_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'stale_days', v_stale,
    'mine_only', COALESCE(p_mine_only, false),
    'counts', jsonb_build_object(
      'overdue_follow_ups', jsonb_array_length(v_overdue),
      'due_today', jsonb_array_length(v_due_today),
      'stale_unassigned', jsonb_array_length(v_stale_unassigned),
      'critical_unassigned', jsonb_array_length(v_critical_unassigned),
      'recent_outcomes', jsonb_array_length(v_recent_outcomes)
    ),
    'overdue_follow_ups', v_overdue,
    'due_today', v_due_today,
    'stale_unassigned', v_stale_unassigned,
    'critical_unassigned', v_critical_unassigned,
    'recent_outcomes', v_recent_outcomes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) IS
  'Advisory commercial digest for Superadmin. Never changes plans.';
