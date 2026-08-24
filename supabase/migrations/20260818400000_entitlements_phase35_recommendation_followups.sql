-- Phase 35: Recommendation follow-ups (Superadmin CRM-lite).
-- Still NO automatic plan changes.
-- Depends on phase 31–34.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS follow_up_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS follow_up_set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_follow_up
  ON public.organization_plan_recommendations (follow_up_at ASC NULLS LAST)
  WHERE follow_up_at IS NOT NULL;

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
    'follow_up_cleared'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_follow_up(
  p_organization_id UUID,
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL
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

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    follow_up_at,
    follow_up_by,
    follow_up_set_at,
    follow_up_set_by
  )
  VALUES (
    p_organization_id,
    'none',
    p_follow_up_at,
    CASE WHEN p_follow_up_at IS NULL THEN NULL ELSE v_uid END,
    CASE WHEN p_follow_up_at IS NULL THEN NULL ELSE now() END,
    CASE WHEN p_follow_up_at IS NULL THEN NULL ELSE v_uid END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    follow_up_at = EXCLUDED.follow_up_at,
    follow_up_by = EXCLUDED.follow_up_by,
    follow_up_set_at = EXCLUDED.follow_up_set_at,
    follow_up_set_by = EXCLUDED.follow_up_set_by,
    updated_at = now()
  RETURNING * INTO v_row;

  IF p_follow_up_at IS NULL AND v_prev.follow_up_at IS NOT NULL THEN
    v_event := 'follow_up_cleared';
  ELSIF p_follow_up_at IS NOT NULL AND (v_prev.follow_up_at IS DISTINCT FROM p_follow_up_at) THEN
    v_event := 'follow_up_set';
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
        WHEN p_follow_up_at IS NULL THEN 'Follow-up cleared'
        ELSE 'Follow-up set to ' || p_follow_up_at::text
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'follow_up_at', v_row.follow_up_at,
    'follow_up_by', v_row.follow_up_by
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_follow_up(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_follow_up(UUID, TIMESTAMPTZ) TO authenticated;

-- Patch get-note helper to also return follow-up fields.
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
    'status', v_row.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_follow_ups(
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
  follow_up_at TIMESTAMPTZ,
  commercial_note TEXT
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
    r.commercial_note
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE o.deleted_at IS NULL
    AND r.follow_up_at IS NOT NULL
  ORDER BY r.follow_up_at ASC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT) TO authenticated;

COMMENT ON COLUMN public.organization_plan_recommendations.follow_up_at IS
  'Superadmin commercial follow-up deadline. Advisory only; never auto-changes plans.';
