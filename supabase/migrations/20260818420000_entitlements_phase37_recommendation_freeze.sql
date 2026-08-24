-- Phase 37: Freeze advisory recommendations + overdue follow-up metrics.
-- Still NO automatic plan changes.
-- Depends on phase 31–36.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frozen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS frozen_note TEXT;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_frozen
  ON public.organization_plan_recommendations (is_frozen)
  WHERE is_frozen = true;

DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'organization_plan_recommendation_events'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_plan_recommendation_events DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.organization_plan_recommendation_events
  ADD CONSTRAINT organization_plan_recommendation_events_event_type_check
  CHECK (event_type IN (
    'recommended',
    'reviewed',
    'dismissed',
    'accepted',
    'reopened',
    'clinic_dismissed',
    'clinic_viewed',
    'cleared',
    'noted',
    'follow_up_set',
    'follow_up_cleared',
    'frozen',
    'unfrozen'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_freeze(
  p_organization_id UUID,
  p_frozen BOOLEAN DEFAULT true,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_note TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    is_frozen,
    frozen_at,
    frozen_by,
    frozen_note
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    COALESCE(p_frozen, true),
    CASE WHEN COALESCE(p_frozen, true) THEN now() ELSE NULL END,
    CASE WHEN COALESCE(p_frozen, true) THEN v_uid ELSE NULL END,
    CASE WHEN COALESCE(p_frozen, true) THEN v_note ELSE NULL END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    is_frozen = EXCLUDED.is_frozen,
    frozen_at = EXCLUDED.frozen_at,
    frozen_by = EXCLUDED.frozen_by,
    frozen_note = EXCLUDED.frozen_note,
    updated_at = now()
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    CASE WHEN v_row.is_frozen THEN 'frozen' ELSE 'unfrozen' END,
    'superadmin',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    COALESCE(v_note, CASE WHEN v_row.is_frozen THEN 'Recommendation frozen' ELSE 'Recommendation unfrozen' END)
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'is_frozen', v_row.is_frozen,
    'frozen_at', v_row.frozen_at,
    'frozen_note', v_row.frozen_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_freeze(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_freeze(UUID, BOOLEAN, TEXT) TO authenticated;

-- Do not clear frozen recommendations on bulk refresh.
CREATE OR REPLACE FUNCTION public.superadmin_clear_idle_plan_recommendation(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF NOT FOUND OR v_prev.status NOT IN ('recommended', 'reviewed') THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'not_active');
  END IF;

  IF v_prev.is_frozen THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'frozen');
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    status = 'none',
    recommended_plan_key = NULL,
    severity = 'none',
    score = 0,
    reasons = '[]'::jsonb,
    fingerprint = NULL,
    clinic_dismissed_at = NULL,
    clinic_dismissed_fingerprint = NULL,
    clinic_dismissed_by = NULL,
    clinic_snooze_until = NULL,
    updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    'cleared',
    'superadmin',
    v_uid,
    v_prev.current_plan_key,
    v_prev.recommended_plan_key,
    v_prev.severity,
    v_prev.score,
    v_prev.usage_level,
    v_prev.reasons,
    v_prev.fingerprint,
    'Bulk refresh cleared idle recommendation'
  );

  RETURN jsonb_build_object(
    'cleared', true,
    'organization_id', v_row.organization_id
  );
END;
$$;

-- Extend get-note payload with freeze fields.
CREATE OR REPLACE FUNCTION public.superadmin_get_plan_recommendation_note(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'commercial_note', NULL,
      'commercial_note_updated_at', NULL,
      'last_refreshed_at', NULL,
      'follow_up_at', NULL,
      'follow_up_by', NULL,
      'is_frozen', false,
      'frozen_at', NULL,
      'frozen_note', NULL,
      'status', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_note', v_row.commercial_note,
    'commercial_note_updated_at', v_row.commercial_note_updated_at,
    'last_refreshed_at', v_row.last_refreshed_at,
    'follow_up_at', v_row.follow_up_at,
    'follow_up_by', v_row.follow_up_by,
    'is_frozen', v_row.is_frozen,
    'frozen_at', v_row.frozen_at,
    'frozen_note', v_row.frozen_note,
    'status', v_row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_warn NUMERIC := 0.85;
  v_crit NUMERIC := 1.00;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT threshold_warning, threshold_critical
  INTO v_warn, v_crit
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_warn IS NULL THEN v_warn := 0.85; END IF;
  IF v_crit IS NULL THEN v_crit := 1.00; END IF;

  SELECT jsonb_build_object(
    'upgrade_recommended', COUNT(*) FILTER (WHERE r.status = 'recommended'),
    'reviewed', COUNT(*) FILTER (WHERE r.status = 'reviewed'),
    'dismissed', COUNT(*) FILTER (WHERE r.status = 'dismissed'),
    'accepted', COUNT(*) FILTER (WHERE r.status = 'accepted'),
    'basic_to_pro', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND r.current_plan_key = 'basic'
        AND r.recommended_plan_key = 'pro'
    ),
    'pro_to_premium', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND r.current_plan_key = 'pro'
        AND r.recommended_plan_key = 'premium'
    ),
    'premium_to_enterprise', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND r.current_plan_key = 'premium'
        AND r.recommended_plan_key = 'enterprise'
    ),
    'trial_conversion', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND r.current_plan_key = 'trial'
    ),
    'legacy_rows', (
      SELECT COUNT(*)
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE p.key = 'legacy'
        AND s.cancelled_at IS NULL
        AND s.status IN ('trialing', 'active', 'past_due')
    ),
    'near_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.usage_level >= v_warn
        AND r.usage_level < v_crit
    ),
    'at_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.usage_level >= v_crit
    ),
    'clinic_dismissed_active', COUNT(*) FILTER (
      WHERE r.clinic_dismissed_at IS NOT NULL
        AND r.clinic_dismissed_fingerprint IS NOT DISTINCT FROM r.fingerprint
        AND r.status IN ('recommended', 'reviewed')
        AND (r.clinic_snooze_until IS NULL OR r.clinic_snooze_until > timezone('utc', now()))
    ),
    'frozen', COUNT(*) FILTER (WHERE r.is_frozen = true),
    'follow_ups_open', COUNT(*) FILTER (WHERE r.follow_up_at IS NOT NULL),
    'follow_ups_overdue', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND r.follow_up_at < timezone('utc', now())
    )
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON COLUMN public.organization_plan_recommendations.is_frozen IS
  'When true, bulk refresh will not clear this advisory recommendation. Never auto-changes plans.';
