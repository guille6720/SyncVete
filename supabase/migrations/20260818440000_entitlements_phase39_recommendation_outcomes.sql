-- Phase 39: Commercial outcome (won / lost / deferred / not_a_fit).
-- CRM-lite close of the advisory loop. Still NO automatic plan changes.
-- Depends on phase 31–38.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS commercial_outcome TEXT
    CHECK (
      commercial_outcome IS NULL
      OR commercial_outcome IN ('won', 'lost', 'deferred', 'not_a_fit')
    ),
  ADD COLUMN IF NOT EXISTS commercial_outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_outcome_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_outcome_note TEXT;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_outcome
  ON public.organization_plan_recommendations (commercial_outcome)
  WHERE commercial_outcome IS NOT NULL;

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
    'unfrozen',
    'assigned',
    'unassigned',
    'outcome_set',
    'outcome_cleared'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_outcome(
  p_organization_id UUID,
  p_outcome TEXT DEFAULT NULL,
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
  v_event TEXT;
  v_clear_follow_up BOOLEAN := false;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost', 'deferred', 'not_a_fit') THEN
    RAISE EXCEPTION 'invalid commercial outcome';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF FOUND
     AND v_prev.commercial_outcome IS NOT DISTINCT FROM p_outcome
     AND COALESCE(v_prev.commercial_outcome_note, '') IS NOT DISTINCT FROM COALESCE(v_note, '')
  THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'commercial_outcome', v_prev.commercial_outcome,
      'commercial_outcome_at', v_prev.commercial_outcome_at,
      'commercial_outcome_note', v_prev.commercial_outcome_note,
      'unchanged', true
    );
  END IF;

  -- Closed outcomes leave the active follow-up queue; deferred keeps the date.
  IF p_outcome IN ('won', 'lost', 'not_a_fit') THEN
    v_clear_follow_up := true;
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_outcome,
    commercial_outcome_at,
    commercial_outcome_by,
    commercial_outcome_note,
    follow_up_at,
    follow_up_by,
    follow_up_set_at,
    follow_up_set_by
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    p_outcome,
    CASE WHEN p_outcome IS NULL THEN NULL ELSE now() END,
    CASE WHEN p_outcome IS NULL THEN NULL ELSE v_uid END,
    CASE WHEN p_outcome IS NULL THEN NULL ELSE v_note END,
    CASE WHEN v_clear_follow_up THEN NULL ELSE v_prev.follow_up_at END,
    CASE WHEN v_clear_follow_up THEN NULL ELSE v_prev.follow_up_by END,
    CASE WHEN v_clear_follow_up THEN NULL ELSE v_prev.follow_up_set_at END,
    CASE WHEN v_clear_follow_up THEN NULL ELSE v_prev.follow_up_set_by END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_outcome = EXCLUDED.commercial_outcome,
    commercial_outcome_at = EXCLUDED.commercial_outcome_at,
    commercial_outcome_by = EXCLUDED.commercial_outcome_by,
    commercial_outcome_note = EXCLUDED.commercial_outcome_note,
    follow_up_at = CASE
      WHEN v_clear_follow_up THEN NULL
      ELSE r.follow_up_at
    END,
    follow_up_by = CASE
      WHEN v_clear_follow_up THEN NULL
      ELSE r.follow_up_by
    END,
    follow_up_set_at = CASE
      WHEN v_clear_follow_up THEN NULL
      ELSE r.follow_up_set_at
    END,
    follow_up_set_by = CASE
      WHEN v_clear_follow_up THEN NULL
      ELSE r.follow_up_set_by
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  IF p_outcome IS NULL AND v_prev.commercial_outcome IS NOT NULL THEN
    v_event := 'outcome_cleared';
  ELSIF p_outcome IS NOT NULL THEN
    v_event := 'outcome_set';
  ELSE
    v_event := NULL;
  END IF;

  IF v_event IS NOT NULL THEN
    PERFORM public.append_plan_recommendation_event(
      p_organization_id,
      v_event,
      'superadmin',
      v_uid,
      v_row.current_plan_key,
      v_row.recommended_plan_key,
      v_row.severity,
      v_row.score,
      v_row.usage_level,
      v_row.reasons,
      v_row.fingerprint,
      CASE
        WHEN p_outcome IS NULL THEN 'Commercial outcome cleared'
        ELSE 'Outcome ' || p_outcome || COALESCE(' · ' || v_note, '')
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_outcome', v_row.commercial_outcome,
    'commercial_outcome_at', v_row.commercial_outcome_at,
    'commercial_outcome_note', v_row.commercial_outcome_note,
    'follow_up_cleared', v_clear_follow_up,
    'unchanged', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_outcome(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_outcome(UUID, TEXT, TEXT) TO authenticated;

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
  v_email TEXT;
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
      'assigned_to', NULL,
      'assigned_at', NULL,
      'assigned_email', NULL,
      'commercial_outcome', NULL,
      'commercial_outcome_at', NULL,
      'commercial_outcome_note', NULL,
      'status', NULL
    );
  END IF;

  SELECT pa.email INTO v_email
  FROM public.platform_admins pa
  WHERE pa.user_id = v_row.assigned_to
  LIMIT 1;

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
    'assigned_to', v_row.assigned_to,
    'assigned_at', v_row.assigned_at,
    'assigned_email', v_email,
    'commercial_outcome', v_row.commercial_outcome,
    'commercial_outcome_at', v_row.commercial_outcome_at,
    'commercial_outcome_note', v_row.commercial_outcome_note,
    'status', v_row.status
  );
END;
$$;

-- Active follow-ups exclude closed outcomes (won / lost / not_a_fit).
DROP FUNCTION IF EXISTS public.superadmin_list_recommendation_follow_ups(INT, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_follow_ups(
  p_limit INT DEFAULT 25,
  p_assigned_to UUID DEFAULT NULL,
  p_unassigned_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  follow_up_at TIMESTAMPTZ,
  commercial_note TEXT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    r.follow_up_at,
    r.commercial_note,
    r.assigned_to,
    pa.email AS assigned_email,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.follow_up_at IS NOT NULL
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_unassigned_only, false) = false
      OR r.assigned_to IS NULL
    )
    AND (
      p_assigned_to IS NULL
      OR r.assigned_to = p_assigned_to
    )
  ORDER BY r.follow_up_at ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT, UUID, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_outcomes(
  p_limit INT DEFAULT 25,
  p_outcome TEXT DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  commercial_outcome TEXT,
  commercial_outcome_at TIMESTAMPTZ,
  commercial_outcome_note TEXT,
  assigned_to UUID,
  assigned_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost', 'deferred', 'not_a_fit') THEN
    RAISE EXCEPTION 'invalid commercial outcome filter';
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    r.commercial_outcome,
    r.commercial_outcome_at,
    r.commercial_outcome_note,
    r.assigned_to,
    pa.email AS assigned_email
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.commercial_outcome IS NOT NULL
    AND (p_outcome IS NULL OR r.commercial_outcome = p_outcome)
  ORDER BY r.commercial_outcome_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_outcomes(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_outcomes(INT, TEXT) TO authenticated;

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
  v_uid UUID;
BEGIN
  v_uid := public.require_platform_admin();

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
    'follow_ups_open', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'follow_ups_overdue', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND r.follow_up_at < timezone('utc', now())
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'unassigned_recommended', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_to_me', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to = v_uid
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'outcome_won', COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    'outcome_lost', COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    'outcome_deferred', COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    'outcome_not_a_fit', COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit')
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON COLUMN public.organization_plan_recommendations.commercial_outcome IS
  'CRM-lite commercial result. Does not change plans; won is not an automatic upgrade.';
