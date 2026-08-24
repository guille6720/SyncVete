-- Phase 36: Configurable recommendation thresholds + clinic notice snooze.
-- Still NO automatic plan changes.
-- Depends on phase 31–35.

CREATE TABLE IF NOT EXISTS public.commercial_recommendation_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  threshold_info NUMERIC(6, 4) NOT NULL DEFAULT 0.70
    CHECK (threshold_info > 0 AND threshold_info < 1),
  threshold_warning NUMERIC(6, 4) NOT NULL DEFAULT 0.85
    CHECK (threshold_warning > 0 AND threshold_warning <= 1),
  threshold_critical NUMERIC(6, 4) NOT NULL DEFAULT 1.00
    CHECK (threshold_critical >= 0.85 AND threshold_critical <= 2),
  clinic_snooze_days INT NOT NULL DEFAULT 14
    CHECK (clinic_snooze_days >= 1 AND clinic_snooze_days <= 90),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (threshold_info < threshold_warning),
  CHECK (threshold_warning <= threshold_critical)
);

INSERT INTO public.commercial_recommendation_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.commercial_recommendation_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_recommendation_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_recommendation_settings TO service_role;

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS clinic_snooze_until TIMESTAMPTZ;

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
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_set_recommendation_settings(
  p_threshold_info NUMERIC DEFAULT NULL,
  p_threshold_warning NUMERIC DEFAULT NULL,
  p_threshold_critical NUMERIC DEFAULT NULL,
  p_clinic_snooze_days INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();

  INSERT INTO public.commercial_recommendation_settings AS s (
    id,
    threshold_info,
    threshold_warning,
    threshold_critical,
    clinic_snooze_days,
    updated_at,
    updated_by
  )
  VALUES (
    1,
    COALESCE(p_threshold_info, 0.70),
    COALESCE(p_threshold_warning, 0.85),
    COALESCE(p_threshold_critical, 1.00),
    COALESCE(p_clinic_snooze_days, 14),
    now(),
    v_uid
  )
  ON CONFLICT (id) DO UPDATE SET
    threshold_info = COALESCE(p_threshold_info, s.threshold_info),
    threshold_warning = COALESCE(p_threshold_warning, s.threshold_warning),
    threshold_critical = COALESCE(p_threshold_critical, s.threshold_critical),
    clinic_snooze_days = COALESCE(p_clinic_snooze_days, s.clinic_snooze_days),
    updated_at = now(),
    updated_by = v_uid
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT) TO authenticated;

-- Authenticated clinics can read thresholds only via this helper (for engine parity if needed).
CREATE OR REPLACE FUNCTION public.get_recommendation_thresholds()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.commercial_recommendation_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'info', 0.70,
      'warning', 0.85,
      'critical', 1.00,
      'clinic_snooze_days', 14
    );
  END IF;
  RETURN jsonb_build_object(
    'info', v_row.threshold_info,
    'warning', v_row.threshold_warning,
    'critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_recommendation_thresholds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommendation_thresholds() TO authenticated;

-- Clinic notice respects snooze window; after snooze expires, notice can reappear.
CREATE OR REPLACE FUNCTION public.list_own_plan_recommendation_notice()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = v_org;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.status NOT IN ('recommended', 'reviewed') THEN
    RETURN NULL;
  END IF;
  IF v_row.recommended_plan_key IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_row.clinic_dismissed_at IS NOT NULL
     AND v_row.clinic_dismissed_fingerprint IS NOT DISTINCT FROM v_row.fingerprint THEN
    IF v_row.clinic_snooze_until IS NULL OR v_row.clinic_snooze_until > timezone('utc', now()) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'current_plan_key', v_row.current_plan_key,
    'recommended_plan_key', v_row.recommended_plan_key,
    'severity', v_row.severity,
    'score', v_row.score,
    'usage_level', v_row.usage_level,
    'reasons', v_row.reasons,
    'fingerprint', v_row.fingerprint,
    'recommended_at', v_row.recommended_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_own_plan_recommendation_notice()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_uid UUID;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_days INT;
BEGIN
  v_uid := auth.uid();
  v_org := public.get_user_organization_id();
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = v_org;

  IF NOT FOUND OR v_row.recommended_plan_key IS NULL THEN
    RETURN jsonb_build_object('dismissed', false);
  END IF;

  SELECT clinic_snooze_days INTO v_days
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_days IS NULL THEN
    v_days := 14;
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    clinic_dismissed_at = now(),
    clinic_dismissed_fingerprint = fingerprint,
    clinic_dismissed_by = v_uid,
    clinic_snooze_until = timezone('utc', now()) + make_interval(days => v_days),
    updated_at = now()
  WHERE organization_id = v_org
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    v_org,
    'clinic_dismissed',
    'clinic',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    'Clinic owner snoozed soft upgrade notice for ' || v_days::text || ' days'
  );

  RETURN jsonb_build_object(
    'dismissed', true,
    'clinic_snooze_until', v_row.clinic_snooze_until,
    'clinic_snooze_days', v_days
  );
END;
$$;

COMMENT ON TABLE public.commercial_recommendation_settings IS
  'Singleton commercial recommendation thresholds and clinic snooze. Never auto-changes plans.';
COMMENT ON COLUMN public.organization_plan_recommendations.clinic_snooze_until IS
  'Soft clinic notice hidden until this time even if fingerprint matches. Advisory only.';
