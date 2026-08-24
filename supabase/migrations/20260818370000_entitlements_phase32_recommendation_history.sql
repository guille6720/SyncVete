-- Phase 32: Plan recommendation history + clinic-facing soft notice support.
-- Still NO automatic plan changes.

-- ---------------------------------------------------------------------------
-- History events (append-only commercial timeline)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_plan_recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'recommended',
      'reviewed',
      'dismissed',
      'accepted',
      'reopened',
      'clinic_dismissed',
      'clinic_viewed'
    )),
  actor_kind TEXT NOT NULL DEFAULT 'superadmin'
    CHECK (actor_kind IN ('superadmin', 'clinic', 'system')),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  severity TEXT,
  score INT,
  usage_level NUMERIC(8, 4),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  fingerprint TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_plan_rec_events_org_created
  ON public.organization_plan_recommendation_events (organization_id, created_at DESC);

ALTER TABLE public.organization_plan_recommendation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_plan_recommendation_events FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.organization_plan_recommendation_events TO service_role;

-- Clinic-facing dismiss (soft notice only; does not clear Superadmin recommendation)
ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS clinic_dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clinic_dismissed_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS clinic_dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Allow authenticated to read own recommendation row via SECURITY DEFINER helpers only.
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_plan_recommendations TO service_role;

CREATE OR REPLACE FUNCTION public.append_plan_recommendation_event(
  p_organization_id UUID,
  p_event_type TEXT,
  p_actor_kind TEXT,
  p_actor_user_id UUID,
  p_current_plan_key TEXT,
  p_recommended_plan_key TEXT,
  p_severity TEXT,
  p_score INT,
  p_usage_level NUMERIC,
  p_reasons JSONB,
  p_fingerprint TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.organization_plan_recommendation_events (
    organization_id,
    event_type,
    actor_kind,
    actor_user_id,
    current_plan_key,
    recommended_plan_key,
    severity,
    score,
    usage_level,
    reasons,
    fingerprint,
    note
  )
  VALUES (
    p_organization_id,
    p_event_type,
    COALESCE(p_actor_kind, 'system'),
    p_actor_user_id,
    p_current_plan_key,
    p_recommended_plan_key,
    p_severity,
    p_score,
    p_usage_level,
    COALESCE(p_reasons, '[]'::jsonb),
    p_fingerprint,
    p_note
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.append_plan_recommendation_event(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.append_plan_recommendation_event(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, TEXT) TO service_role;

-- Patch Superadmin upsert to write history
CREATE OR REPLACE FUNCTION public.superadmin_upsert_plan_recommendation(
  p_organization_id UUID,
  p_status TEXT,
  p_current_plan_key TEXT DEFAULT NULL,
  p_recommended_plan_key TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'none',
  p_score INT DEFAULT 0,
  p_usage_level NUMERIC DEFAULT 0,
  p_reasons JSONB DEFAULT '[]'::jsonb,
  p_fingerprint TEXT DEFAULT NULL,
  p_max_usage_ratio_at_dismiss NUMERIC DEFAULT NULL
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
  v_event TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('none', 'recommended', 'reviewed', 'dismissed', 'accepted') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('none', 'info', 'warning', 'critical') THEN
    p_severity := 'none';
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    current_plan_key,
    recommended_plan_key,
    severity,
    score,
    usage_level,
    reasons,
    fingerprint,
    max_usage_ratio_at_dismiss,
    recommended_at,
    reviewed_at,
    dismissed_at,
    accepted_at,
    reviewed_by,
    dismissed_by,
    accepted_by
  )
  VALUES (
    p_organization_id,
    p_status,
    p_current_plan_key,
    p_recommended_plan_key,
    p_severity,
    COALESCE(p_score, 0),
    COALESCE(p_usage_level, 0),
    COALESCE(p_reasons, '[]'::jsonb),
    p_fingerprint,
    p_max_usage_ratio_at_dismiss,
    CASE WHEN p_status = 'recommended' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'reviewed' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'dismissed' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'accepted' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'reviewed' THEN v_uid ELSE NULL END,
    CASE WHEN p_status = 'dismissed' THEN v_uid ELSE NULL END,
    CASE WHEN p_status = 'accepted' THEN v_uid ELSE NULL END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_plan_key = EXCLUDED.current_plan_key,
    recommended_plan_key = EXCLUDED.recommended_plan_key,
    severity = EXCLUDED.severity,
    score = EXCLUDED.score,
    usage_level = EXCLUDED.usage_level,
    reasons = EXCLUDED.reasons,
    fingerprint = EXCLUDED.fingerprint,
    max_usage_ratio_at_dismiss = COALESCE(EXCLUDED.max_usage_ratio_at_dismiss, r.max_usage_ratio_at_dismiss),
    recommended_at = CASE
      WHEN EXCLUDED.status = 'recommended' THEN COALESCE(r.recommended_at, now())
      ELSE r.recommended_at
    END,
    reviewed_at = CASE WHEN EXCLUDED.status = 'reviewed' THEN now() ELSE r.reviewed_at END,
    dismissed_at = CASE WHEN EXCLUDED.status = 'dismissed' THEN now() ELSE r.dismissed_at END,
    accepted_at = CASE WHEN EXCLUDED.status = 'accepted' THEN now() ELSE r.accepted_at END,
    reviewed_by = CASE WHEN EXCLUDED.status = 'reviewed' THEN v_uid ELSE r.reviewed_by END,
    dismissed_by = CASE WHEN EXCLUDED.status = 'dismissed' THEN v_uid ELSE r.dismissed_by END,
    accepted_by = CASE WHEN EXCLUDED.status = 'accepted' THEN v_uid ELSE r.accepted_by END,
    -- Reopen clinic dismiss when fingerprint materially changes
    clinic_dismissed_at = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_at
    END,
    clinic_dismissed_fingerprint = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_fingerprint
    END,
    clinic_dismissed_by = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_by
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  v_event := CASE
    WHEN v_prev.organization_id IS NULL AND p_status = 'recommended' THEN 'recommended'
    WHEN v_prev.status IS DISTINCT FROM p_status THEN p_status
    WHEN v_prev.fingerprint IS DISTINCT FROM p_fingerprint AND p_status = 'recommended' THEN 'reopened'
    ELSE NULL
  END;

  IF v_event IS NOT NULL THEN
    PERFORM public.append_plan_recommendation_event(
      p_organization_id,
      v_event,
      'superadmin',
      v_uid,
      p_current_plan_key,
      p_recommended_plan_key,
      p_severity,
      p_score,
      p_usage_level,
      p_reasons,
      p_fingerprint,
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'recommended_plan_key', v_row.recommended_plan_key,
    'fingerprint', v_row.fingerprint,
    'clinic_dismissed_at', v_row.clinic_dismissed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) TO authenticated;

-- Clinic: read own soft recommendation notice
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
    RETURN NULL;
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

REVOKE ALL ON FUNCTION public.list_own_plan_recommendation_notice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_own_plan_recommendation_notice() TO authenticated;

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
BEGIN
  v_uid := auth.uid();
  v_org := public.get_user_organization_id();
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  -- Only org managers should dismiss commercial notices.
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = v_org;

  IF NOT FOUND OR v_row.recommended_plan_key IS NULL THEN
    RETURN jsonb_build_object('dismissed', false);
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    clinic_dismissed_at = now(),
    clinic_dismissed_fingerprint = fingerprint,
    clinic_dismissed_by = v_uid,
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
    'Clinic owner dismissed soft upgrade notice'
  );

  RETURN jsonb_build_object('dismissed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.dismiss_own_plan_recommendation_notice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_own_plan_recommendation_notice() TO authenticated;

-- Global Superadmin recommendation dashboard (not page-scoped)
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.require_platform_admin();

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
        AND r.usage_level >= 0.85
        AND r.usage_level < 1
    ),
    'at_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.usage_level >= 1
    ),
    'clinic_dismissed_active', COUNT(*) FILTER (
      WHERE r.clinic_dismissed_at IS NOT NULL
        AND r.clinic_dismissed_fingerprint IS NOT DISTINCT FROM r.fingerprint
        AND r.status IN ('recommended', 'reviewed')
    )
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_summary() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_plan_recommendation_events(
  p_organization_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  event_type TEXT,
  actor_kind TEXT,
  actor_user_id UUID,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  severity TEXT,
  score INT,
  usage_level NUMERIC,
  reasons JSONB,
  fingerprint TEXT,
  note TEXT,
  created_at TIMESTAMPTZ
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
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  RETURN QUERY
  SELECT
    e.id,
    e.event_type,
    e.actor_kind,
    e.actor_user_id,
    e.current_plan_key,
    e.recommended_plan_key,
    e.severity,
    e.score,
    e.usage_level,
    e.reasons,
    e.fingerprint,
    e.note,
    e.created_at
  FROM public.organization_plan_recommendation_events e
  WHERE e.organization_id = p_organization_id
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_plan_recommendation_events(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_plan_recommendation_events(UUID, INT) TO authenticated;

COMMENT ON TABLE public.organization_plan_recommendation_events IS
  'Append-only commercial recommendation timeline for Superadmin. No clinical payloads.';
COMMENT ON FUNCTION public.list_own_plan_recommendation_notice() IS
  'Soft clinic upgrade notice for org managers. Hidden after clinic dismiss until fingerprint changes.';
