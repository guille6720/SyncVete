-- Phase 38: Assign a Superadmin owner to advisory recommendations (CRM-lite).
-- Still NO automatic plan changes.
-- Depends on phase 31–37.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_assigned_to
  ON public.organization_plan_recommendations (assigned_to)
  WHERE assigned_to IS NOT NULL;

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
    'unassigned'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_assignees()
RETURNS TABLE (
  user_id UUID,
  email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  RETURN QUERY
  SELECT pa.user_id, pa.email
  FROM public.platform_admins pa
  WHERE pa.is_active = true
  ORDER BY pa.email ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_assignees() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_assignee(
  p_organization_id UUID,
  p_assigned_to UUID DEFAULT NULL
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
  v_email TEXT;
  v_event TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    SELECT pa.email INTO v_email
    FROM public.platform_admins pa
    WHERE pa.user_id = p_assigned_to
      AND pa.is_active = true;
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'assignee must be an active platform admin';
    END IF;
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF FOUND AND v_prev.assigned_to IS NOT DISTINCT FROM p_assigned_to THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'assigned_to', v_prev.assigned_to,
      'assigned_at', v_prev.assigned_at,
      'assigned_email', (
        SELECT pa.email
        FROM public.platform_admins pa
        WHERE pa.user_id = v_prev.assigned_to
        LIMIT 1
      ),
      'unchanged', true
    );
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    assigned_to,
    assigned_at,
    assigned_by
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    p_assigned_to,
    CASE WHEN p_assigned_to IS NULL THEN NULL ELSE now() END,
    CASE WHEN p_assigned_to IS NULL THEN NULL ELSE v_uid END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    assigned_to = EXCLUDED.assigned_to,
    assigned_at = EXCLUDED.assigned_at,
    assigned_by = EXCLUDED.assigned_by,
    updated_at = now()
  RETURNING * INTO v_row;

  v_event := CASE WHEN v_row.assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END;

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
      WHEN v_row.assigned_to IS NULL THEN 'Assignee cleared'
      ELSE 'Assigned to ' || COALESCE(v_email, v_row.assigned_to::text)
    END
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'assigned_to', v_row.assigned_to,
    'assigned_at', v_row.assigned_at,
    'assigned_email', v_email,
    'unchanged', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_assignee(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_assignee(UUID, UUID) TO authenticated;

-- Extend get-note payload with assignee fields.
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
    'status', v_row.status
  );
END;
$$;

DROP FUNCTION IF EXISTS public.superadmin_list_recommendation_follow_ups(INT);

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
    pa.email AS assigned_email
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.follow_up_at IS NOT NULL
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
    'follow_ups_open', COUNT(*) FILTER (WHERE r.follow_up_at IS NOT NULL),
    'follow_ups_overdue', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND r.follow_up_at < timezone('utc', now())
    ),
    'unassigned_recommended', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NULL
    ),
    'assigned_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NOT NULL
    ),
    'assigned_to_me', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to = v_uid
    )
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON COLUMN public.organization_plan_recommendations.assigned_to IS
  'Platform admin responsible for commercial follow-up. Advisory only; never auto-changes plans.';
