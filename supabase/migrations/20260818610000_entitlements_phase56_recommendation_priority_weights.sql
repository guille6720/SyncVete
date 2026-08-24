-- Phase 56: Configurable priority weights for the advisory work queue.
-- Still NO automatic plan changes.
-- Depends on phase 31–55.

ALTER TABLE public.commercial_recommendation_settings
  ADD COLUMN IF NOT EXISTS priority_weights JSONB NOT NULL DEFAULT jsonb_build_object(
    'critical', 40,
    'warning', 20,
    'info', 8,
    'usage_100', 25,
    'usage_90', 15,
    'usage_80', 8,
    'age_31', 30,
    'age_15', 18,
    'age_8', 10,
    'never_contacted', 15,
    'overdue_follow_up', 22,
    'unassigned', 12,
    'frozen_penalty', 35
  );

CREATE OR REPLACE FUNCTION public.default_recommendation_priority_weights()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'critical', 40,
    'warning', 20,
    'info', 8,
    'usage_100', 25,
    'usage_90', 15,
    'usage_80', 8,
    'age_31', 30,
    'age_15', 18,
    'age_8', 10,
    'never_contacted', 15,
    'overdue_follow_up', 22,
    'unassigned', 12,
    'frozen_penalty', 35
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_recommendation_priority_weights(p_weights JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_defaults JSONB := public.default_recommendation_priority_weights();
  v_key TEXT;
  v_val NUMERIC;
  v_out JSONB := '{}'::JSONB;
BEGIN
  IF p_weights IS NULL OR jsonb_typeof(p_weights) <> 'object' THEN
    RETURN v_defaults;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_defaults) LOOP
    BEGIN
      v_val := NULLIF(p_weights ->> v_key, '')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_val := NULL;
    END;
    IF v_val IS NULL OR v_val < 0 OR v_val > 200 THEN
      v_val := (v_defaults ->> v_key)::NUMERIC;
    END IF;
    v_out := v_out || jsonb_build_object(v_key, ROUND(v_val)::INT);
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.recommendation_commercial_priority(
  p_now TIMESTAMPTZ,
  p_severity TEXT,
  p_usage_level NUMERIC,
  p_age_days INT,
  p_last_contacted_at TIMESTAMPTZ,
  p_follow_up_at TIMESTAMPTZ,
  p_is_frozen BOOLEAN,
  p_assigned_to UUID,
  p_weights JSONB DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_w JSONB := public.normalize_recommendation_priority_weights(p_weights);
  v_priority INT := 0;
BEGIN
  IF p_severity = 'critical' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'critical')::INT, 40);
  ELSIF p_severity = 'warning' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'warning')::INT, 20);
  ELSIF p_severity = 'info' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'info')::INT, 8);
  END IF;

  IF p_usage_level IS NOT NULL THEN
    IF p_usage_level >= 1.0 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_100')::INT, 25);
    ELSIF p_usage_level >= 0.9 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_90')::INT, 15);
    ELSIF p_usage_level >= 0.8 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_80')::INT, 8);
    END IF;
  END IF;

  IF p_age_days IS NOT NULL THEN
    IF p_age_days >= 31 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_31')::INT, 30);
    ELSIF p_age_days >= 15 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_15')::INT, 18);
    ELSIF p_age_days >= 8 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_8')::INT, 10);
    END IF;
  END IF;

  IF p_last_contacted_at IS NULL THEN
    v_priority := v_priority + COALESCE((v_w ->> 'never_contacted')::INT, 15);
  END IF;

  IF p_follow_up_at IS NOT NULL AND p_follow_up_at < p_now THEN
    v_priority := v_priority + COALESCE((v_w ->> 'overdue_follow_up')::INT, 22);
  END IF;

  IF p_assigned_to IS NULL THEN
    v_priority := v_priority + COALESCE((v_w ->> 'unassigned')::INT, 12);
  END IF;

  IF COALESCE(p_is_frozen, false) THEN
    v_priority := GREATEST(
      0,
      v_priority - COALESCE((v_w ->> 'frozen_penalty')::INT, 35)
    );
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

-- Drop old 8-arg priority signature from phase 55 if present.
DROP FUNCTION IF EXISTS public.recommendation_commercial_priority(
  TIMESTAMPTZ, TEXT, NUMERIC, INT, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, UUID
);

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
  v_weights JSONB;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  SELECT public.normalize_recommendation_priority_weights(s.priority_weights)
  INTO v_weights
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;

  IF v_weights IS NULL THEN
    v_weights := public.default_recommendation_priority_weights();
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
      r.assigned_to,
      v_weights
    ) DESC,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_get_recommendation_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  PERFORM public.require_platform_admin();
  SELECT * INTO v_row FROM public.commercial_recommendation_settings WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.commercial_recommendation_settings (id) VALUES (1)
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'stale_days', v_row.stale_days,
    'priority_weights', public.normalize_recommendation_priority_weights(v_row.priority_weights),
    'updated_at', v_row.updated_at
  );
END;
$$;

DROP FUNCTION IF EXISTS public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT);

CREATE OR REPLACE FUNCTION public.superadmin_set_recommendation_settings(
  p_threshold_info NUMERIC DEFAULT NULL,
  p_threshold_warning NUMERIC DEFAULT NULL,
  p_threshold_critical NUMERIC DEFAULT NULL,
  p_clinic_snooze_days INT DEFAULT NULL,
  p_stale_days INT DEFAULT NULL,
  p_priority_weights JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_row public.commercial_recommendation_settings%ROWTYPE;
  v_weights JSONB;
BEGIN
  v_uid := public.require_platform_admin();
  v_weights := CASE
    WHEN p_priority_weights IS NULL THEN NULL
    ELSE public.normalize_recommendation_priority_weights(p_priority_weights)
  END;

  INSERT INTO public.commercial_recommendation_settings AS s (
    id,
    threshold_info,
    threshold_warning,
    threshold_critical,
    clinic_snooze_days,
    stale_days,
    priority_weights,
    updated_at,
    updated_by
  )
  VALUES (
    1,
    COALESCE(p_threshold_info, 0.70),
    COALESCE(p_threshold_warning, 0.85),
    COALESCE(p_threshold_critical, 1.00),
    COALESCE(p_clinic_snooze_days, 14),
    COALESCE(p_stale_days, 14),
    COALESCE(v_weights, public.default_recommendation_priority_weights()),
    now(),
    v_uid
  )
  ON CONFLICT (id) DO UPDATE SET
    threshold_info = COALESCE(p_threshold_info, s.threshold_info),
    threshold_warning = COALESCE(p_threshold_warning, s.threshold_warning),
    threshold_critical = COALESCE(p_threshold_critical, s.threshold_critical),
    clinic_snooze_days = COALESCE(p_clinic_snooze_days, s.clinic_snooze_days),
    stale_days = COALESCE(p_stale_days, s.stale_days),
    priority_weights = COALESCE(v_weights, s.priority_weights),
    updated_at = now(),
    updated_by = v_uid
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'stale_days', v_row.stale_days,
    'priority_weights', public.normalize_recommendation_priority_weights(v_row.priority_weights),
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;

COMMENT ON COLUMN public.commercial_recommendation_settings.priority_weights IS
  'Configurable advisory priority weights for Superadmin work queue. Never auto-changes plans.';
