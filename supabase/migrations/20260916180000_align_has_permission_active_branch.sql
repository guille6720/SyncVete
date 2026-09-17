-- Align PostgreSQL has_permission with app session membership selection.
-- Session uses: membership for profiles.active_branch_id, else earliest membership.
-- Previously has_permission always used ORDER BY created_at ASC LIMIT 1, ignoring
-- active_branch_id — causing UI/app authz (active branch) to diverge from RLS.
--
-- Also: safe staging repair for clinic founders incorrectly stored as non-owner
-- when the organization has NO owner membership at all.
--
-- STAGING ONLY intent for the data repair section (idempotent; safe if already correct).
-- Does NOT promote veterinarians when an owner already exists.
-- Does NOT disable RLS or broaden veterinarian defaults.

CREATE OR REPLACE FUNCTION public.has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role public.user_role;
  custom_perms JSONB;
  role_perms TEXT[];
BEGIN
  -- Canonical membership: prefer active_branch_id, else earliest created_at.
  -- Must match apps/web getSessionContext / get_session_bootstrap consumers.
  SELECT bm.role, bm.permissions
  INTO user_role, custom_perms
  FROM public.profiles p
  INNER JOIN public.branch_members bm
    ON bm.user_id = p.id
   AND bm.is_active = true
   AND bm.deleted_at IS NULL
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL
    AND p.is_active = true
  ORDER BY
    CASE
      WHEN p.active_branch_id IS NOT NULL AND bm.branch_id = p.active_branch_id THEN 0
      ELSE 1
    END,
    bm.created_at ASC
  LIMIT 1;

  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Empty custom permissions array means "use role defaults" (matches TS getPermissionsForRole).
  IF custom_perms IS NOT NULL AND jsonb_typeof(custom_perms) = 'array' AND jsonb_array_length(custom_perms) > 0 THEN
    RETURN custom_perms ? required_permission;
  END IF;

  -- Keep in sync with packages/shared ROLE_PERMISSIONS (see shared permission parity tests).
  role_perms := CASE user_role
    WHEN 'owner' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay'
    ]
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'professional_settlements:read','professional_settlements:pay'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;

  RETURN required_permission = ANY(role_perms);
END;
$$;

COMMENT ON FUNCTION public.has_permission(TEXT) IS
  'Effective staff permission for auth.uid(). Uses active_branch_id membership (else earliest). Mirrors shared ROLE_PERMISSIONS; empty custom permissions fall back to role defaults.';

-- ---------------------------------------------------------------------------
-- Deterministic founder repair (orgs with ZERO owners only)
-- Candidate = earliest active profile in the org that has an active membership.
-- Ambiguous orgs (no candidate) are left untouched; see ops report query below.
-- ---------------------------------------------------------------------------
WITH orgs_without_owner AS (
  SELECT o.id AS organization_id
  FROM public.organizations o
  WHERE o.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.branch_members bm
      WHERE bm.organization_id = o.id
        AND bm.role = 'owner'
        AND bm.is_active = true
        AND bm.deleted_at IS NULL
    )
),
founder_candidate AS (
  SELECT DISTINCT ON (p.organization_id)
    p.organization_id,
    p.id AS user_id
  FROM public.profiles p
  INNER JOIN orgs_without_owner owo ON owo.organization_id = p.organization_id
  INNER JOIN public.branch_members bm
    ON bm.user_id = p.id
   AND bm.organization_id = p.organization_id
   AND bm.is_active = true
   AND bm.deleted_at IS NULL
  WHERE p.deleted_at IS NULL
    AND p.is_active = true
  ORDER BY p.organization_id, p.created_at ASC, p.id ASC
)
UPDATE public.branch_members bm
SET
  role = 'owner',
  permissions = NULL,
  updated_at = now()
FROM founder_candidate f
WHERE bm.user_id = f.user_id
  AND bm.organization_id = f.organization_id
  AND bm.is_active = true
  AND bm.deleted_at IS NULL
  AND bm.role IS DISTINCT FROM 'owner';

-- Report helper for ops (read-only view of remaining orgs still without owner after repair).
CREATE OR REPLACE VIEW public.ops_orgs_missing_owner AS
SELECT
  o.id AS organization_id,
  o.name,
  o.slug,
  o.created_at,
  (
    SELECT COUNT(*)::INT
    FROM public.profiles p
    WHERE p.organization_id = o.id
      AND p.deleted_at IS NULL
  ) AS profile_count,
  (
    SELECT COUNT(*)::INT
    FROM public.branch_members bm
    WHERE bm.organization_id = o.id
      AND bm.is_active = true
      AND bm.deleted_at IS NULL
  ) AS active_membership_count
FROM public.organizations o
WHERE o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.branch_members bm
    WHERE bm.organization_id = o.id
      AND bm.role = 'owner'
      AND bm.is_active = true
      AND bm.deleted_at IS NULL
  );

COMMENT ON VIEW public.ops_orgs_missing_owner IS
  'Orgs still without an active owner membership after deterministic founder repair. Manual review only — do not auto-escalate.';

REVOKE ALL ON public.ops_orgs_missing_owner FROM PUBLIC;
GRANT SELECT ON public.ops_orgs_missing_owner TO service_role;

-- Include created_at on memberships for clients that sort/pick explicitly.
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
        'permissions', bm.permissions,
        'created_at', bm.created_at
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
