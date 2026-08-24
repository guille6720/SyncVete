-- Phase 51: Open-pipeline aging buckets (advisory analytics).
-- Still NO automatic plan changes.
-- Depends on phase 31–50.

CREATE OR REPLACE FUNCTION public.recommendation_open_age_days(
  p_now TIMESTAMPTZ,
  p_last_contacted_at TIMESTAMPTZ,
  p_last_refreshed_at TIMESTAMPTZ,
  p_recommended_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.recommendation_commercial_touch_at(
      p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at
    ) IS NULL THEN NULL
    ELSE GREATEST(
      0,
      FLOOR(
        EXTRACT(EPOCH FROM (
          p_now - public.recommendation_commercial_touch_at(
            p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at
          )
        )) / 86400.0
      )::INT
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_aging()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_open INT := 0;
  v_d0_7 INT := 0;
  v_d8_14 INT := 0;
  v_d15_30 INT := 0;
  v_d31_plus INT := 0;
  v_unknown INT := 0;
  v_avg_age NUMERIC;
  v_median_age NUMERIC;
BEGIN
  PERFORM public.require_platform_admin();

  WITH open_rows AS (
    SELECT
      public.recommendation_open_age_days(
        v_now,
        r.last_contacted_at,
        r.last_refreshed_at,
        r.recommended_at,
        r.updated_at
      ) AS age_days
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days <= 7),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days BETWEEN 8 AND 14),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days BETWEEN 15 AND 30),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days >= 31),
    COUNT(*) FILTER (WHERE age_days IS NULL),
    AVG(age_days) FILTER (WHERE age_days IS NOT NULL)
  INTO
    v_open,
    v_d0_7,
    v_d8_14,
    v_d15_30,
    v_d31_plus,
    v_unknown,
    v_avg_age
  FROM open_rows;

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days)
  INTO v_median_age
  FROM (
    SELECT
      public.recommendation_open_age_days(
        v_now,
        r.last_contacted_at,
        r.last_refreshed_at,
        r.recommended_at,
        r.updated_at
      ) AS age_days
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
  ) aged
  WHERE age_days IS NOT NULL;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'open_pipeline', v_open,
    'bucket_0_7', v_d0_7,
    'bucket_8_14', v_d8_14,
    'bucket_15_30', v_d15_30,
    'bucket_31_plus', v_d31_plus,
    'bucket_unknown', v_unknown,
    'avg_age_days', CASE WHEN v_avg_age IS NULL THEN NULL ELSE ROUND(v_avg_age, 1) END,
    'median_age_days', CASE WHEN v_median_age IS NULL THEN NULL ELSE ROUND(v_median_age::NUMERIC, 1) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_aging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_aging() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_aging(
  p_bucket TEXT,
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
  age_days INT,
  last_touch_at TIMESTAMPTZ,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_tags TEXT[],
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket TEXT;
  v_limit INT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  PERFORM public.require_platform_admin();
  v_bucket := lower(COALESCE(NULLIF(btrim(p_bucket), ''), ''));
  IF v_bucket NOT IN ('0-7', '8-14', '15-30', '31-plus', 'unknown') THEN
    RAISE EXCEPTION 'invalid aging bucket';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS age_days,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    r.assigned_to,
    pa.email,
    r.commercial_tags,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      (
        v_bucket = '0-7'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 0 AND 7
      )
      OR (
        v_bucket = '8-14'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 8 AND 14
      )
      OR (
        v_bucket = '15-30'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 15 AND 30
      )
      OR (
        v_bucket = '31-plus'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) >= 31
      )
      OR (
        v_bucket = 'unknown'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) IS NULL
      )
    )
  ORDER BY
    CASE WHEN v_bucket = 'unknown' THEN 0 ELSE 1 END,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) TO authenticated;

COMMENT ON FUNCTION public.superadmin_recommendation_aging() IS
  'Open pipeline aging buckets by commercial touch age. Never changes plans.';
COMMENT ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) IS
  'List open orgs in an aging bucket. Never changes plans.';
