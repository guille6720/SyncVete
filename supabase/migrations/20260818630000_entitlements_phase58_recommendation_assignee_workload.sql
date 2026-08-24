-- Phase 58: Assignee workload board (current open load + priority pressure).
-- Still NO automatic plan changes.
-- Depends on phase 31–57.

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_assignee_workload()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_weights JSONB;
  v_rows JSONB := '[]'::JSONB;
  v_unassigned JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT public.normalize_recommendation_priority_weights(s.priority_weights)
  INTO v_weights
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;

  IF v_weights IS NULL THEN
    v_weights := public.default_recommendation_priority_weights();
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_priority DESC, sort_open DESC, sort_email ASC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'assignee_user_id', pa.user_id,
        'assignee_email', pa.email,
        'open_pipeline', COALESCE(s.open_pipeline, 0),
        'open_active', COALESCE(s.open_active, 0),
        'critical_open', COALESCE(s.critical_open, 0),
        'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
        'aging_31_plus', COALESCE(s.aging_31_plus, 0),
        'never_contacted', COALESCE(s.never_contacted, 0),
        'frozen_open', COALESCE(s.frozen_open, 0),
        'priority_sum', COALESCE(s.priority_sum, 0),
        'avg_priority', CASE
          WHEN COALESCE(s.open_active, 0) > 0
            THEN ROUND(s.priority_sum::NUMERIC / s.open_active::NUMERIC, 1)
          ELSE NULL
        END
      ) AS row_data,
      COALESCE(s.priority_sum, 0) AS sort_priority,
      COALESCE(s.open_pipeline, 0) AS sort_open,
      pa.email AS sort_email
    FROM public.platform_admins pa
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        ) AS open_pipeline,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = false
        ) AS open_active,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.severity = 'critical'
            AND COALESCE(r.is_frozen, false) = false
        ) AS critical_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
            AND r.follow_up_at < v_now
            AND COALESCE(r.is_frozen, false) = false
        ) AS overdue_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_open_age_days(
              v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) >= 31
            AND COALESCE(r.is_frozen, false) = false
        ) AS aging_31_plus,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.last_contacted_at IS NULL
            AND COALESCE(r.is_frozen, false) = false
        ) AS never_contacted,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = true
        ) AS frozen_open,
        COALESCE(SUM(
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
            r.assigned_to,
            v_weights
          )
        ) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = false
        ), 0) AS priority_sum
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE o.deleted_at IS NULL
        AND r.assigned_to = pa.user_id
    ) s ON true
    WHERE pa.is_active = true
      AND COALESCE(s.open_pipeline, 0) > 0
  ) scored;

  SELECT jsonb_build_object(
    'assignee_user_id', NULL,
    'assignee_email', NULL,
    'open_pipeline', COALESCE(s.open_pipeline, 0),
    'open_active', COALESCE(s.open_active, 0),
    'critical_open', COALESCE(s.critical_open, 0),
    'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
    'aging_31_plus', COALESCE(s.aging_31_plus, 0),
    'never_contacted', COALESCE(s.never_contacted, 0),
    'frozen_open', COALESCE(s.frozen_open, 0),
    'priority_sum', COALESCE(s.priority_sum, 0),
    'avg_priority', CASE
      WHEN COALESCE(s.open_active, 0) > 0
        THEN ROUND(s.priority_sum::NUMERIC / s.open_active::NUMERIC, 1)
      ELSE NULL
    END
  )
  INTO v_unassigned
  FROM (
    SELECT
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      ) AS open_pipeline,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = false
      ) AS open_active,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.severity = 'critical'
          AND COALESCE(r.is_frozen, false) = false
      ) AS critical_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
          AND r.follow_up_at < v_now
          AND COALESCE(r.is_frozen, false) = false
      ) AS overdue_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_open_age_days(
            v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) >= 31
          AND COALESCE(r.is_frozen, false) = false
      ) AS aging_31_plus,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.last_contacted_at IS NULL
          AND COALESCE(r.is_frozen, false) = false
      ) AS never_contacted,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = true
      ) AS frozen_open,
      COALESCE(SUM(
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
          r.assigned_to,
          v_weights
        )
      ) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = false
      ), 0) AS priority_sum
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.assigned_to IS NULL
  ) s;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'assignees', v_rows,
    'unassigned', v_unassigned
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_assignee_workload() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_assignee_workload() TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_assignee_workload() IS
  'Current open workload and priority pressure per assignee. Never changes plans.';
