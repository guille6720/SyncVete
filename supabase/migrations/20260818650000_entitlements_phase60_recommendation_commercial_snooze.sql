-- Phase 60: Commercial snooze for advisory recommendations (Superadmin).
-- Parks items out of priority + digest until a date. Distinct from clinic_snooze and freeze.
-- Still NO automatic plan changes.
-- Depends on phase 31–59.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS commercial_snooze_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_snooze_note TEXT,
  ADD COLUMN IF NOT EXISTS commercial_snoozed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_snoozed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_commercial_snooze_until
  ON public.organization_plan_recommendations (commercial_snooze_until ASC)
  WHERE commercial_snooze_until IS NOT NULL;

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
    'contacted',
    'tagged',
    'untagged',
    'commercial_snoozed',
    'commercial_unsnoozed'
  ));

CREATE OR REPLACE FUNCTION public.recommendation_is_commercially_snoozed(
  p_snooze_until TIMESTAMPTZ,
  p_now TIMESTAMPTZ DEFAULT timezone('utc', now())
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_snooze_until IS NOT NULL AND p_snooze_until > p_now;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(
  p_organization_id UUID,
  p_days INT DEFAULT NULL,
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
  v_until TIMESTAMPTZ;
  v_event TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long';
  END IF;

  IF p_days IS NULL THEN
    v_until := NULL;
  ELSE
    IF p_days < 1 OR p_days > 90 THEN
      RAISE EXCEPTION 'snooze days must be between 1 and 90';
    END IF;
    v_until := timezone('utc', now()) + make_interval(days => p_days);
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_snooze_until,
    commercial_snooze_note,
    commercial_snoozed_at,
    commercial_snoozed_by
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    v_until,
    CASE WHEN v_until IS NULL THEN NULL ELSE v_note END,
    CASE WHEN v_until IS NULL THEN NULL ELSE timezone('utc', now()) END,
    CASE WHEN v_until IS NULL THEN NULL ELSE v_uid END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_snooze_until = EXCLUDED.commercial_snooze_until,
    commercial_snooze_note = EXCLUDED.commercial_snooze_note,
    commercial_snoozed_at = EXCLUDED.commercial_snoozed_at,
    commercial_snoozed_by = EXCLUDED.commercial_snoozed_by,
    updated_at = timezone('utc', now())
  RETURNING * INTO v_row;

  IF v_until IS NULL THEN
    v_event := 'commercial_unsnoozed';
  ELSE
    v_event := 'commercial_snoozed';
  END IF;

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
    COALESCE(
      v_note,
      CASE
        WHEN v_until IS NULL THEN 'Commercial snooze cleared'
        ELSE format('Commercial snooze %s days until %s', p_days, v_until::TEXT)
      END
    )
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_snooze_until', v_row.commercial_snooze_until,
    'commercial_snooze_note', v_row.commercial_snooze_note,
    'commercial_snoozed_at', v_row.commercial_snoozed_at,
    'days', p_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(
  p_organization_ids UUID[],
  p_days INT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 90) THEN
    RAISE EXCEPTION 'snooze days must be between 1 and 90';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_set_plan_recommendation_commercial_snooze(v_id, p_days, p_note);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'errors', v_errors,
    'days', p_days
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(UUID[], INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(UUID[], INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_commercial_snoozed(
  p_limit INT DEFAULT 40,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  commercial_snooze_until TIMESTAMPTZ,
  commercial_snooze_note TEXT,
  commercial_snoozed_at TIMESTAMPTZ,
  snoozed_by UUID,
  snoozed_by_email TEXT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_tags TEXT[],
  is_frozen BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  v_uid := public.require_platform_admin();
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
    r.commercial_snooze_until,
    r.commercial_snooze_note,
    r.commercial_snoozed_at,
    r.commercial_snoozed_by,
    sb.email,
    r.assigned_to,
    pa.email,
    r.commercial_tags,
    COALESCE(r.is_frozen, false)
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  LEFT JOIN public.platform_admins sb ON sb.user_id = r.commercial_snoozed_by
  WHERE o.deleted_at IS NULL
    AND public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
      OR r.commercial_snoozed_by = v_uid
    )
  ORDER BY r.commercial_snooze_until ASC NULLS LAST, o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_commercial_snoozed(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_commercial_snoozed(INT, BOOLEAN) TO authenticated;

-- Priority queue: exclude active commercial snooze by default.
DROP FUNCTION IF EXISTS public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_priority_queue(
  p_limit INT DEFAULT 25,
  p_mine_only BOOLEAN DEFAULT false,
  p_include_frozen BOOLEAN DEFAULT false,
  p_include_snoozed BOOLEAN DEFAULT false
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
  commercial_snooze_until TIMESTAMPTZ,
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
    r.commercial_snooze_until,
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
      COALESCE(p_include_snoozed, false) = true
      OR NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;

-- Digest: hide actively snoozed items from actionable buckets.
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
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
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
  v_now TIMESTAMPTZ := timezone('utc', now());
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
      'commercial_tags', '[]'::jsonb,
      'commercial_snooze_until', NULL,
      'commercial_snooze_note', NULL,
      'commercial_snoozed_at', NULL,
      'is_commercially_snoozed', false,
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
    'commercial_tags', to_jsonb(COALESCE(v_row.commercial_tags, '{}'::TEXT[])),
    'commercial_snooze_until', v_row.commercial_snooze_until,
    'commercial_snooze_note', v_row.commercial_snooze_note,
    'commercial_snoozed_at', v_row.commercial_snoozed_at,
    'is_commercially_snoozed', public.recommendation_is_commercially_snoozed(
      v_row.commercial_snooze_until, v_now
    ),
    'status', v_row.status
  );
END;
$$;

-- Activity feed: include snooze events.
CREATE OR REPLACE FUNCTION public.superadmin_list_recent_recommendation_events(
  p_limit INT DEFAULT 40,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  event_type TEXT,
  actor_kind TEXT,
  actor_user_id UUID,
  actor_email TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  severity TEXT,
  score INT,
  note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    e.id,
    e.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    e.event_type,
    e.actor_kind,
    e.actor_user_id,
    pa.email AS actor_email,
    e.current_plan_key,
    e.recommended_plan_key,
    e.severity,
    e.score,
    e.note,
    e.created_at
  FROM public.organization_plan_recommendation_events e
  JOIN public.organizations o ON o.id = e.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = e.actor_user_id
  WHERE o.deleted_at IS NULL
    AND e.event_type IN (
      'noted',
      'follow_up_set',
      'follow_up_cleared',
      'frozen',
      'unfrozen',
      'assigned',
      'unassigned',
      'outcome_set',
      'outcome_cleared',
      'contacted',
      'accepted',
      'dismissed',
      'reopened',
      'cleared',
      'tagged',
      'untagged',
      'commercial_snoozed',
      'commercial_unsnoozed'
    )
    AND (
      COALESCE(p_mine_only, false) = false
      OR e.actor_user_id = v_uid
    )
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) TO authenticated;

COMMENT ON COLUMN public.organization_plan_recommendations.commercial_snooze_until IS
  'Superadmin commercial snooze. Hides from priority/digest until date. Never auto-changes plans.';
COMMENT ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) IS
  'Snooze or clear commercial advisory item for 1–90 days. Never changes plans.';

-- Allow saving psnooze in commercial views.
CREATE OR REPLACE FUNCTION public.sanitize_commercial_saved_view_params(p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out JSONB := '{}'::JSONB;
  v_key TEXT;
  v_val TEXT;
  v_allowed TEXT[] := ARRAY[
    'assignee',
    'outcome',
    'digest',
    'activity',
    'tag',
    'aging',
    'note',
    'pipeline',
    'psort',
    'priority',
    'pfrozen',
    'psnooze',
    'upgrade',
    'recommended'
  ];
BEGIN
  IF p_params IS NULL OR jsonb_typeof(p_params) <> 'object' THEN
    RETURN '{}'::JSONB;
  END IF;

  FOREACH v_key IN ARRAY v_allowed LOOP
    IF p_params ? v_key THEN
      v_val := NULLIF(btrim(COALESCE(p_params ->> v_key, '')), '');
      IF v_val IS NOT NULL AND char_length(v_val) <= 120 THEN
        v_out := v_out || jsonb_build_object(v_key, v_val);
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;
