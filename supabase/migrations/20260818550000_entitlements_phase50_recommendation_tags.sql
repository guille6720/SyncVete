-- Phase 50: Commercial tags for advisory recommendations (segmentation).
-- Still NO automatic plan changes.
-- Depends on phase 31–49.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS commercial_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_commercial_tags
  ON public.organization_plan_recommendations
  USING GIN (commercial_tags);

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
    'untagged'
  ));

CREATE OR REPLACE FUNCTION public.normalize_commercial_tags(p_tags TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT;
  v_tag TEXT;
  v_out TEXT[] := '{}'::TEXT[];
BEGIN
  IF p_tags IS NULL THEN
    RETURN '{}'::TEXT[];
  END IF;

  FOREACH v_raw IN ARRAY p_tags LOOP
    v_tag := lower(btrim(COALESCE(v_raw, '')));
    v_tag := regexp_replace(v_tag, '\s+', '-', 'g');
    v_tag := regexp_replace(v_tag, '[^a-z0-9_-]', '', 'g');
    v_tag := left(v_tag, 32);
    IF v_tag <> '' AND NOT (v_tag = ANY (v_out)) THEN
      v_out := array_append(v_out, v_tag);
    END IF;
    EXIT WHEN cardinality(v_out) >= 12;
  END LOOP;

  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_tags(
  p_organization_id UUID,
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_mode TEXT DEFAULT 'replace'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev TEXT[];
  v_incoming TEXT[];
  v_next TEXT[];
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_mode TEXT;
  v_event TEXT;
  v_note TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'replace'));
  IF v_mode NOT IN ('replace', 'add', 'remove') THEN
    RAISE EXCEPTION 'invalid tag mode';
  END IF;

  v_incoming := public.normalize_commercial_tags(p_tags);

  SELECT COALESCE(r.commercial_tags, '{}'::TEXT[]) INTO v_prev
  FROM public.organization_plan_recommendations r
  WHERE r.organization_id = p_organization_id;

  IF NOT FOUND THEN
    v_prev := '{}'::TEXT[];
  END IF;

  IF v_mode = 'replace' THEN
    v_next := v_incoming;
  ELSIF v_mode = 'add' THEN
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(v_prev || v_incoming) AS x
      WHERE x IS NOT NULL AND x <> ''
      LIMIT 12
    ) INTO v_next;
  ELSE
    SELECT COALESCE(ARRAY(
      SELECT x
      FROM unnest(v_prev) AS x
      WHERE NOT (x = ANY (v_incoming))
    ), '{}'::TEXT[]) INTO v_next;
  END IF;

  v_next := COALESCE(v_next, '{}'::TEXT[]);

  IF v_prev IS NOT DISTINCT FROM v_next THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'commercial_tags', to_jsonb(v_prev),
      'unchanged', true
    );
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_tags
  )
  VALUES (p_organization_id, 'none', v_next)
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_tags = EXCLUDED.commercial_tags,
    updated_at = now()
  RETURNING * INTO v_row;

  IF cardinality(v_next) > cardinality(v_prev)
     OR EXISTS (
       SELECT 1 FROM unnest(v_next) t WHERE NOT (t = ANY (v_prev))
     ) THEN
    v_event := 'tagged';
  ELSE
    v_event := 'untagged';
  END IF;

  v_note := left(
    CASE
      WHEN v_mode = 'add' THEN 'Tags +: ' || array_to_string(v_incoming, ', ')
      WHEN v_mode = 'remove' THEN 'Tags -: ' || array_to_string(v_incoming, ', ')
      ELSE 'Tags: ' || COALESCE(NULLIF(array_to_string(v_next, ', '), ''), '(vacío)')
    END,
    500
  );

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
    v_note
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_tags', to_jsonb(v_row.commercial_tags),
    'unchanged', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(
  p_organization_ids UUID[],
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_mode TEXT DEFAULT 'add'
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
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
  v_mode TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'add'));
  IF v_mode NOT IN ('replace', 'add', 'remove') THEN
    RAISE EXCEPTION 'invalid tag mode';
  END IF;

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF v_mode <> 'replace' AND (p_tags IS NULL OR cardinality(public.normalize_commercial_tags(p_tags)) = 0) THEN
    RAISE EXCEPTION 'tags required';
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
      v_result := public.superadmin_set_plan_recommendation_tags(v_id, p_tags, v_mode);
      IF COALESCE((v_result ->> 'unchanged')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'mode', v_mode,
    'actor_user_id', v_uid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_tag_catalog()
RETURNS TABLE (
  tag TEXT,
  org_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  RETURN QUERY
  SELECT t.tag, COUNT(DISTINCT r.organization_id) AS org_count
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  CROSS JOIN LATERAL unnest(COALESCE(r.commercial_tags, '{}'::TEXT[])) AS t(tag)
  WHERE o.deleted_at IS NULL
    AND cardinality(COALESCE(r.commercial_tags, '{}'::TEXT[])) > 0
  GROUP BY t.tag
  ORDER BY org_count DESC, t.tag ASC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_tag_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_tag_catalog() TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_by_tag(
  p_tag TEXT,
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
  commercial_tags TEXT[],
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
  v_tag TEXT;
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_tag := (public.normalize_commercial_tags(ARRAY[p_tag]))[1];
  IF v_tag IS NULL THEN
    RAISE EXCEPTION 'tag required';
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
    r.commercial_tags,
    r.assigned_to,
    pa.email,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND v_tag = ANY (COALESCE(r.commercial_tags, '{}'::TEXT[]))
  ORDER BY o.name ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_by_tag(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_by_tag(TEXT, INT) TO authenticated;

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
      'commercial_tags', '[]'::jsonb,
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
    'status', v_row.status
  );
END;
$$;

-- Include tag events in the global activity feed.
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
  v_limit INT;
  v_uid UUID;
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
      'untagged'
    )
    AND (
      COALESCE(p_mine_only, false) = false
      OR e.actor_user_id = v_uid
    )
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;

COMMENT ON COLUMN public.organization_plan_recommendations.commercial_tags IS
  'Internal Superadmin commercial tags for segmentation. Never auto-changes plans.';
COMMENT ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) IS
  'Set/add/remove commercial tags on one org. Never changes plans.';
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) IS
  'Bulk tag ops. Max 50 orgs. Never changes plans.';
