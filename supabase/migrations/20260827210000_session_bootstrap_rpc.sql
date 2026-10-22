-- Phase 3 (global nav perf): one RPC for staff/portal session bootstrap.
-- Derives identity from auth.uid() only — never trusts client-supplied user IDs.

CREATE OR REPLACE FUNCTION public.get_session_bootstrap()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile JSONB;
  v_memberships JSONB;
  v_portal_owner_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', p.id,
    'organization_id', p.organization_id,
    'full_name', p.full_name,
    'avatar_url', p.avatar_url,
    'phone', p.phone,
    'active_branch_id', p.active_branch_id,
    'is_active', p.is_active,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'deleted_at', p.deleted_at
  )
  INTO v_profile
  FROM public.profiles p
  WHERE p.id = v_uid
    AND p.deleted_at IS NULL;

  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'branch_id', bm.branch_id,
        'role', bm.role,
        'permissions', bm.permissions
      )
      ORDER BY bm.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_memberships
  FROM public.branch_members bm
  WHERE bm.user_id = v_uid
    AND bm.is_active = true
    AND bm.deleted_at IS NULL;

  v_portal_owner_id := NULL;
  IF jsonb_array_length(v_memberships) = 0 THEN
    v_portal_owner_id := public.get_portal_owner_id();
  END IF;

  RETURN jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'profile', v_profile,
    'memberships', v_memberships,
    'portal_owner_id', v_portal_owner_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_bootstrap() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_bootstrap() TO authenticated;

COMMENT ON FUNCTION public.get_session_bootstrap() IS
  'Single round-trip session bootstrap for clinic/portal: profile, memberships, platform-admin flag, optional portal owner. Identity from auth.uid() only.';
