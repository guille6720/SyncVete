-- Phase 34: Recommendation ops — commercial notes + refresh timestamps.
-- Still NO automatic plan changes.
-- Depends on phase 31–33.

ALTER TABLE public.organization_plan_recommendations
  ADD COLUMN IF NOT EXISTS commercial_note TEXT,
  ADD COLUMN IF NOT EXISTS commercial_note_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_note_updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

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
    'noted'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_note(
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
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_note TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_note,
    commercial_note_updated_at,
    commercial_note_updated_by
  )
  VALUES (
    p_organization_id,
    'none',
    v_note,
    CASE WHEN v_note IS NULL THEN NULL ELSE now() END,
    CASE WHEN v_note IS NULL THEN NULL ELSE v_uid END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_note = EXCLUDED.commercial_note,
    commercial_note_updated_at = EXCLUDED.commercial_note_updated_at,
    commercial_note_updated_by = EXCLUDED.commercial_note_updated_by,
    updated_at = now()
  RETURNING * INTO v_row;

  IF v_note IS NOT NULL THEN
    PERFORM public.append_plan_recommendation_event(
      p_organization_id,
      'noted',
      'superadmin',
      v_uid,
      v_row.current_plan_key,
      v_row.recommended_plan_key,
      v_row.severity,
      v_row.score,
      v_row.usage_level,
      v_row.reasons,
      v_row.fingerprint,
      left('Nota comercial: ' || v_note, 500)
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_note', v_row.commercial_note,
    'commercial_note_updated_at', v_row.commercial_note_updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_note(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_note(UUID, TEXT) TO authenticated;

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
      'last_refreshed_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_note', v_row.commercial_note,
    'commercial_note_updated_at', v_row.commercial_note_updated_at,
    'last_refreshed_at', v_row.last_refreshed_at,
    'status', v_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_get_plan_recommendation_note(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_plan_recommendation_note(UUID) TO authenticated;

-- Stamp refresh time after advisory recompute (does not change plan).
CREATE OR REPLACE FUNCTION public.superadmin_touch_plan_recommendation_refresh(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
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

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    last_refreshed_at
  )
  VALUES (p_organization_id, 'none', now())
  ON CONFLICT (organization_id) DO UPDATE SET
    last_refreshed_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'last_refreshed_at', v_row.last_refreshed_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_touch_plan_recommendation_refresh(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_touch_plan_recommendation_refresh(UUID) TO authenticated;

COMMENT ON COLUMN public.organization_plan_recommendations.commercial_note IS
  'Internal Superadmin commercial note. Not shown to clinics. No clinical data.';
COMMENT ON COLUMN public.organization_plan_recommendations.last_refreshed_at IS
  'When Superadmin last recomputed this advisory recommendation. Never auto-changes plans.';
