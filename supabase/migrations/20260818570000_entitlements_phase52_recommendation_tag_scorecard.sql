-- Phase 52: Per-tag commercial scorecard (advisory analytics).
-- Still NO automatic plan changes.
-- Depends on phase 31–51.

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_tag_scorecard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_rows JSONB := '[]'::JSONB;
  v_untagged JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_open DESC, sort_tag ASC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'tag', t.tag,
        'open_pipeline', COALESCE(s.open_pipeline, 0),
        'contacted_open', COALESCE(s.contacted_open, 0),
        'with_follow_up', COALESCE(s.with_follow_up, 0),
        'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
        'frozen_open', COALESCE(s.frozen_open, 0),
        'aging_31_plus', COALESCE(s.aging_31_plus, 0),
        'outcome_won', COALESCE(s.outcome_won, 0),
        'outcome_lost', COALESCE(s.outcome_lost, 0),
        'outcome_deferred', COALESCE(s.outcome_deferred, 0),
        'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
        'closed_decisions', COALESCE(s.closed_decisions, 0),
        'contact_rate_pct', CASE
          WHEN COALESCE(s.open_pipeline, 0) > 0
            THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'win_rate_pct', CASE
          WHEN COALESCE(s.closed_decisions, 0) > 0
            THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'avg_days_open', CASE
          WHEN s.avg_days_open IS NULL THEN NULL
          ELSE ROUND(s.avg_days_open, 1)
        END
      ) AS row_data,
      COALESCE(s.open_pipeline, 0) AS sort_open,
      t.tag AS sort_tag
    FROM (
      SELECT DISTINCT x AS tag
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      CROSS JOIN LATERAL unnest(COALESCE(r.commercial_tags, '{}'::TEXT[])) AS x
      WHERE o.deleted_at IS NULL
        AND x IS NOT NULL
        AND x <> ''
    ) t
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        ) AS open_pipeline,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.last_contacted_at IS NOT NULL
        ) AS contacted_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
        ) AS with_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
            AND r.follow_up_at < v_now
        ) AS overdue_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.is_frozen = true
        ) AS frozen_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_open_age_days(
              v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) >= 31
        ) AS aging_31_plus,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
        COUNT(*) FILTER (
          WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
        ) AS closed_decisions,
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
        ) AS avg_days_open
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE o.deleted_at IS NULL
        AND t.tag = ANY (COALESCE(r.commercial_tags, '{}'::TEXT[]))
    ) s ON true
    WHERE (
      COALESCE(s.open_pipeline, 0)
      + COALESCE(s.closed_decisions, 0)
      + COALESCE(s.outcome_deferred, 0)
    ) > 0
  ) scored;

  SELECT jsonb_build_object(
    'tag', NULL,
    'open_pipeline', COALESCE(s.open_pipeline, 0),
    'contacted_open', COALESCE(s.contacted_open, 0),
    'with_follow_up', COALESCE(s.with_follow_up, 0),
    'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
    'frozen_open', COALESCE(s.frozen_open, 0),
    'aging_31_plus', COALESCE(s.aging_31_plus, 0),
    'outcome_won', COALESCE(s.outcome_won, 0),
    'outcome_lost', COALESCE(s.outcome_lost, 0),
    'outcome_deferred', COALESCE(s.outcome_deferred, 0),
    'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
    'closed_decisions', COALESCE(s.closed_decisions, 0),
    'contact_rate_pct', CASE
      WHEN COALESCE(s.open_pipeline, 0) > 0
        THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'win_rate_pct', CASE
      WHEN COALESCE(s.closed_decisions, 0) > 0
        THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'avg_days_open', CASE
      WHEN s.avg_days_open IS NULL THEN NULL
      ELSE ROUND(s.avg_days_open, 1)
    END
  )
  INTO v_untagged
  FROM (
    SELECT
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      ) AS open_pipeline,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.last_contacted_at IS NOT NULL
      ) AS contacted_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
      ) AS with_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
          AND r.follow_up_at < v_now
      ) AS overdue_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.is_frozen = true
      ) AS frozen_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_open_age_days(
            v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) >= 31
      ) AS aging_31_plus,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
      COUNT(*) FILTER (
        WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      ) AS closed_decisions,
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
      ) AS avg_days_open
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND cardinality(COALESCE(r.commercial_tags, '{}'::TEXT[])) = 0
  ) s;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'tags', v_rows,
    'untagged', v_untagged
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_tag_scorecard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_tag_scorecard() TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_tag_scorecard() IS
  'Per-tag advisory scorecard. An org with multiple tags counts in each tag. Never changes plans.';
