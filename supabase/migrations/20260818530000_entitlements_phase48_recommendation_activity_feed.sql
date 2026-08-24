-- Phase 48: Global recent commercial activity feed (advisory timeline).
-- Still NO automatic plan changes.
-- Depends on phase 31–47.

CREATE INDEX IF NOT EXISTS idx_org_plan_rec_events_created
  ON public.organization_plan_recommendation_events (created_at DESC);

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
      'cleared'
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

COMMENT ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) IS
  'Recent advisory commercial events across orgs. Never changes plans. Excludes noisy clinic/system refresh noise.';
