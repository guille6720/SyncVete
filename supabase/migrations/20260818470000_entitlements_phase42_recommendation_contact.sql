-- Phase 42: Commercial contact touch (last contacted).
-- Still NO automatic plan changes.
-- Depends on phase 31–41.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_contacted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_contact_note TEXT;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_last_contacted
  ON public.organization_plan_recommendations (last_contacted_at DESC NULLS LAST);

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
    'outcome_cleared',
    'contacted'
  ));

CREATE OR REPLACE FUNCTION public.recommendation_commercial_touch_at(
  p_last_contacted_at TIMESTAMPTZ,
  p_last_refreshed_at TIMESTAMPTZ,
  p_recommended_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at);
$$;

CREATE OR REPLACE FUNCTION public.superadmin_touch_plan_recommendation_contact(
  p_organization_id UUID,
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
    last_contacted_at,
    last_contacted_by,
    last_contact_note
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    now(),
    v_uid,
    v_note
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    last_contacted_at = now(),
    last_contacted_by = v_uid,
    last_contact_note = COALESCE(v_note, r.last_contact_note),
    updated_at = now()
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    'contacted',
    'superadmin',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    COALESCE(v_note, 'Commercial contact registered')
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'last_contacted_at', v_row.last_contacted_at,
    'last_contact_note', v_row.last_contact_note
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_touch_plan_recommendation_contact(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_touch_plan_recommendation_contact(UUID, TEXT) TO authenticated;

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
      'last_contacted_at', NULL,
      'last_contact_note', NULL,
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
    'last_contacted_at', v_row.last_contacted_at,
    'last_contact_note', v_row.last_contact_note,
    'status', v_row.status
  );
END;
$$;

DROP FUNCTION IF EXISTS public.superadmin_list_recommendation_stale(INT);

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_stale(
  p_limit INT DEFAULT 25
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
  last_touch_at TIMESTAMPTZ,
  stale_days INT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  last_contacted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_stale INT := 14;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  SELECT s.stale_days INTO v_stale
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

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
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    v_stale AS stale_days,
    r.assigned_to,
    pa.email AS assigned_email,
    r.commercial_outcome,
    r.last_contacted_at
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) < timezone('utc', now()) - make_interval(days => v_stale)
  ORDER BY public.recommendation_commercial_touch_at(
    r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
  ) ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_stale(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_stale(INT) TO authenticated;

-- Patch summary stale_open to honor last contact.
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
  v_stale INT := 14;
  v_uid UUID;
BEGIN
  v_uid := public.require_platform_admin();

  SELECT threshold_warning, threshold_critical, stale_days
  INTO v_warn, v_crit, v_stale
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_warn IS NULL THEN v_warn := 0.85; END IF;
  IF v_crit IS NULL THEN v_crit := 1.00; END IF;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  SELECT jsonb_build_object(
    'upgrade_recommended', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'reviewed', COUNT(*) FILTER (WHERE r.status = 'reviewed'),
    'dismissed', COUNT(*) FILTER (WHERE r.status = 'dismissed'),
    'accepted', COUNT(*) FILTER (WHERE r.status = 'accepted'),
    'basic_to_pro', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'basic'
        AND r.recommended_plan_key = 'pro'
    ),
    'pro_to_premium', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'pro'
        AND r.recommended_plan_key = 'premium'
    ),
    'premium_to_enterprise', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'premium'
        AND r.recommended_plan_key = 'enterprise'
    ),
    'trial_conversion', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
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
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.usage_level >= v_warn
        AND r.usage_level < v_crit
    ),
    'at_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
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
    'outcome_not_a_fit', COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit'),
    'stale_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) < timezone('utc', now()) - make_interval(days => v_stale)
    ),
    'stale_days', v_stale,
    'never_contacted_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.last_contacted_at IS NULL
    )
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- Digest: stale uses contact touch; add never_contacted section.
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
  v_never_contacted JSONB;
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
      public.recommendation_commercial_touch_at(
        r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ) AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      CASE WHEN v_mine IS NOT NULL THEN 'stale_mine' ELSE 'stale_unassigned' END AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND public.recommendation_commercial_touch_at(
        r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ) < v_now - make_interval(days => v_stale)
      AND (
        (v_mine IS NULL AND r.assigned_to IS NULL)
        OR (v_mine IS NOT NULL AND r.assigned_to = v_mine)
      )
    ORDER BY public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) ASC NULLS FIRST
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
      CASE WHEN v_mine IS NOT NULL THEN 'critical_mine' ELSE 'critical_unassigned' END AS kind
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

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC NULLS FIRST), '[]'::jsonb)
  INTO v_never_contacted
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
      COALESCE(r.recommended_at, r.updated_at) AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'never_contacted'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND r.last_contacted_at IS NULL
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY COALESCE(r.recommended_at, r.updated_at) ASC NULLS FIRST
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
      'recent_outcomes', jsonb_array_length(v_recent_outcomes),
      'never_contacted', jsonb_array_length(v_never_contacted)
    ),
    'overdue_follow_ups', v_overdue,
    'due_today', v_due_today,
    'stale_unassigned', v_stale_unassigned,
    'critical_unassigned', v_critical_unassigned,
    'recent_outcomes', v_recent_outcomes,
    'never_contacted', v_never_contacted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) TO authenticated;

COMMENT ON COLUMN public.organization_plan_recommendations.last_contacted_at IS
  'Last Superadmin commercial contact. Resets stale clock. Never auto-changes plans.';
