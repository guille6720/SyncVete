-- Central Admin / managed users.
--
-- Reuses organizations, branches, profiles, branch_members (role enum), organization_invitations,
-- has_permission() and audit_logs. Additive and reversible:
--   * Central Admin = active branch_members.role = 'owner' (existing role, no new auth model).
--   * Managed users = active staff of the organization that are not Central Admin.
--   * Per-user permission overrides can only RESTRICT role permissions (enabled = false).
--   * Granular keys (patients:delete, appointments:cancel, billing:cancel) are implied by their
--     parent write permission, so existing roles keep today's behaviour.
--   * Managed seat limit lives in managed_user_settings (default 10) and is enforced by triggers.

-- ─────────────────────────────────────────────
-- 1. Permission catalog
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.permission_catalog()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'org:manage','branch:manage','users:manage',
    'patients:read','patients:write','patients:delete',
    'appointments:read','appointments:write','appointments:cancel',
    'clinical:read','clinical:write',
    'billing:read','billing:write','billing:cancel',
    'inventory:read','inventory:write',
    'reports:read','audit:read','whatsapp:send','data:import','data:export',
    'waiting_room:read','waiting_room:write',
    'professionals:read','professionals:write',
    'professional_compensation:read','professional_compensation:write',
    'professional_settlements:read','professional_settlements:approve','professional_settlements:pay',
    'interconsultations:read','interconsultations:write','interconsultations:approve','interconsultations:billing'
  ]::TEXT[];
$$;

-- Granular child permission -> parent permission that implies it.
CREATE OR REPLACE FUNCTION public.permission_parent(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_key
    WHEN 'patients:delete' THEN 'patients:write'
    WHEN 'appointments:cancel' THEN 'appointments:write'
    WHEN 'billing:cancel' THEN 'billing:write'
    ELSE NULL
  END;
$$;

-- Keep in sync with packages/shared ROLE_PERMISSIONS (parity test in packages/shared).
CREATE OR REPLACE FUNCTION public.role_permissions(p_role public.user_role)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN public.permission_catalog()
    WHEN 'admin' THEN ARRAY[
      'org:manage','branch:manage','users:manage','patients:read','patients:write',
      'appointments:read','appointments:write','clinical:read','clinical:write',
      'billing:read','billing:write','inventory:read','inventory:write',
      'reports:read','audit:read','whatsapp:send','data:import','data:export',
      'waiting_room:read','waiting_room:write',
      'professionals:read','professionals:write',
      'professional_compensation:read','professional_compensation:write',
      'professional_settlements:read','professional_settlements:approve','professional_settlements:pay',
      'interconsultations:read','interconsultations:write','interconsultations:approve','interconsultations:billing'
    ]
    WHEN 'veterinarian' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','reports:read','whatsapp:send',
      'data:export','waiting_room:read','waiting_room:write',
      'interconsultations:read','interconsultations:write'
    ]
    WHEN 'nurse' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'receptionist' THEN ARRAY[
      'patients:read','patients:write','appointments:read','appointments:write',
      'billing:read','whatsapp:send','waiting_room:read','waiting_room:write',
      'interconsultations:read'
    ]
    WHEN 'cashier' THEN ARRAY[
      'patients:read','appointments:read','billing:read','billing:write','whatsapp:send',
      'waiting_room:read','waiting_room:write',
      'professional_settlements:read','professional_settlements:pay',
      'interconsultations:read','interconsultations:billing'
    ]
    WHEN 'lab_tech' THEN ARRAY[
      'patients:read','clinical:read','clinical:write','inventory:read','whatsapp:send',
      'waiting_room:read'
    ]
    WHEN 'readonly' THEN ARRAY[
      'patients:read','appointments:read','clinical:read','reports:read','waiting_room:read',
      'interconsultations:read'
    ]
    ELSE ARRAY[]::TEXT[]
  END;
$$;

-- ─────────────────────────────────────────────
-- 2. New tables
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_permission_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL CHECK (permission_key ~ '^[a-z_]+:[a-z_]+$'),
  -- Only restrictions are honoured: enabled = false removes a role permission.
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_denied
  ON public.user_permission_overrides (user_id, organization_id)
  WHERE enabled = false;

ALTER TABLE public.user_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.managed_user_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  managed_user_limit INT NOT NULL DEFAULT 10 CHECK (managed_user_limit BETWEEN 0 AND 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.managed_user_settings ENABLE ROW LEVEL SECURITY;

-- Writes only through SECURITY DEFINER RPCs (no INSERT/UPDATE/DELETE policies).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_permission_overrides FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.managed_user_settings FROM anon, authenticated;

DROP POLICY IF EXISTS "user_permission_overrides_select" ON public.user_permission_overrides;
CREATE POLICY "user_permission_overrides_select" ON public.user_permission_overrides
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND (user_id = auth.uid() OR public.has_permission('users:manage'))
  );

DROP POLICY IF EXISTS "managed_user_settings_select" ON public.managed_user_settings;
CREATE POLICY "managed_user_settings_select" ON public.managed_user_settings
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('users:manage')
  );

DROP TRIGGER IF EXISTS trg_audit_user_permission_overrides ON public.user_permission_overrides;
CREATE TRIGGER trg_audit_user_permission_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ─────────────────────────────────────────────
-- 3. Column additions (profiles / invitations)
-- ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_account_status_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_account_status_check
      CHECK (account_status IN ('active', 'suspended', 'disabled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_reason_length') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_reason_length CHECK (char_length(status_reason) <= 500);
  END IF;
END $$;

UPDATE public.profiles
SET account_status = 'disabled'
WHERE is_active = false AND account_status = 'active';

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS denied_permissions TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS send_count INT NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_user_created
  ON public.audit_logs (organization_id, user_id, created_at DESC);

-- ─────────────────────────────────────────────
-- 4. has_permission: canonical membership + implied granular keys + user restrictions
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(required_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role public.user_role;
  v_custom JSONB;
  v_parent TEXT := public.permission_parent(required_permission);
  v_granted BOOLEAN;
BEGIN
  -- Canonical membership: prefer active_branch_id, else earliest (matches getSessionContext).
  SELECT p.organization_id, bm.role, bm.permissions
  INTO v_org_id, v_role, v_custom
  FROM public.profiles p
  INNER JOIN public.branch_members bm
    ON bm.user_id = p.id
   AND bm.organization_id = p.organization_id
   AND bm.is_active = true
   AND bm.deleted_at IS NULL
  WHERE p.id = auth.uid()
    AND p.deleted_at IS NULL
    AND p.is_active = true
  ORDER BY
    CASE WHEN p.active_branch_id IS NOT NULL AND bm.branch_id = p.active_branch_id THEN 0 ELSE 1 END,
    bm.created_at ASC
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  IF v_custom IS NOT NULL AND jsonb_typeof(v_custom) = 'array' AND jsonb_array_length(v_custom) > 0 THEN
    v_granted := v_custom ? required_permission
      OR (v_parent IS NOT NULL AND v_custom ? v_parent);
  ELSE
    v_granted := required_permission = ANY(public.role_permissions(v_role))
      OR (v_parent IS NOT NULL AND v_parent = ANY(public.role_permissions(v_role)));
  END IF;

  IF NOT v_granted THEN
    RETURN false;
  END IF;

  -- Central Admin permissions cannot be restricted.
  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.user_permission_overrides o
    WHERE o.user_id = auth.uid()
      AND o.organization_id = v_org_id
      AND o.enabled = false
      AND (o.permission_key = required_permission OR o.permission_key = v_parent)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 5. Helpers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_org_central_admin(p_user_id UUID, p_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.branch_members bm
    INNER JOIN public.profiles p ON p.id = bm.user_id
    WHERE bm.user_id = p_user_id
      AND bm.organization_id = p_organization_id
      AND bm.role = 'owner'
      AND bm.is_active = true
      AND bm.deleted_at IS NULL
      AND p.organization_id = p_organization_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.managed_user_limit(p_organization_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.managed_user_limit FROM public.managed_user_settings s WHERE s.organization_id = p_organization_id),
    10
  );
$$;

-- Active managed users (active staff that is not Central Admin) + live pending invitations.
CREATE OR REPLACE FUNCTION public.managed_user_count(p_organization_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*)::INT
    FROM public.profiles p
    WHERE p.organization_id = p_organization_id
      AND p.is_active = true
      AND p.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.branch_members bm
        WHERE bm.user_id = p.id AND bm.organization_id = p_organization_id
          AND bm.is_active = true AND bm.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.branch_members bm
        WHERE bm.user_id = p.id AND bm.organization_id = p_organization_id
          AND bm.is_active = true AND bm.deleted_at IS NULL AND bm.role = 'owner'
      )
  ) + (
    SELECT COUNT(*)::INT
    FROM public.organization_invitations i
    WHERE i.organization_id = p_organization_id
      AND i.status = 'pending'
      AND i.deleted_at IS NULL
      AND i.expires_at > now()
      AND i.role <> 'owner'
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_managed_seat_available(p_organization_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('managed_users:' || p_organization_id::TEXT, 0));
  v_limit := public.managed_user_limit(p_organization_id);
  IF public.managed_user_count(p_organization_id) >= v_limit THEN
    RAISE EXCEPTION 'MANAGED_USER_LIMIT_REACHED:%', v_limit USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Actor may only hand out permissions they hold themselves (no privilege laundering).
CREATE OR REPLACE FUNCTION public.assert_actor_can_grant_role(p_role public.user_role, p_denied TEXT[])
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
  v_missing TEXT;
BEGIN
  IF p_role = 'owner' THEN
    IF NOT public.is_org_central_admin(auth.uid(), v_org_id) THEN
      RAISE EXCEPTION 'ONLY_CENTRAL_ADMIN_CAN_ASSIGN_OWNER' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;

  SELECT k INTO v_missing
  FROM unnest(public.role_permissions(p_role)) AS k
  WHERE NOT (k = ANY(COALESCE(p_denied, '{}'::TEXT[])))
    AND NOT public.has_permission(k)
  LIMIT 1;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_GRANT_PERMISSION:%', v_missing USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_staff_actor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.branch_members bm
    WHERE bm.user_id = auth.uid() AND bm.is_active = true AND bm.deleted_at IS NULL
  );
$$;

-- ─────────────────────────────────────────────
-- 6. Guards (triggers)
-- ─────────────────────────────────────────────

-- Keep profiles.is_active (used by RLS helpers) and account_status consistent.
CREATE OR REPLACE FUNCTION public.profiles_sync_account_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.account_status <> 'active' THEN
      NEW.is_active := false;
    ELSIF NEW.is_active = false THEN
      NEW.account_status := 'disabled';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    NEW.is_active := NEW.account_status = 'active';
  ELSIF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.account_status := CASE WHEN NEW.is_active THEN 'active' ELSE 'disabled' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_10_sync_account_status ON public.profiles;
CREATE TRIGGER trg_profiles_10_sync_account_status
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_account_status();

CREATE OR REPLACE FUNCTION public.profiles_guard_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_was_active BOOLEAN := OLD.is_active AND OLD.deleted_at IS NULL;
  v_now_active BOOLEAN := NEW.is_active AND NEW.deleted_at IS NULL;
  v_trusted BOOLEAN := COALESCE(current_setting('app.trusted_membership_op', true), '') = 'on';
BEGIN
  IF v_was_active = v_now_active THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NOT NULL AND v_actor = NEW.id AND NOT v_trusted THEN
    RAISE EXCEPTION 'SELF_STATUS_CHANGE_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF v_was_active AND NOT v_now_active
     AND public.is_org_central_admin(NEW.id, NEW.organization_id) THEN
    IF v_actor IS NOT NULL AND NOT public.is_org_central_admin(v_actor, NEW.organization_id) THEN
      RAISE EXCEPTION 'CENTRAL_ADMIN_PROTECTED' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.branch_members bm
      INNER JOIN public.profiles p ON p.id = bm.user_id
      WHERE bm.organization_id = NEW.organization_id
        AND bm.user_id <> NEW.id
        AND bm.role = 'owner' AND bm.is_active = true AND bm.deleted_at IS NULL
        AND p.is_active = true AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'LAST_CENTRAL_ADMIN' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_was_active AND v_now_active
     AND EXISTS (
       SELECT 1 FROM public.branch_members bm
       WHERE bm.user_id = NEW.id AND bm.organization_id = NEW.organization_id
         AND bm.is_active = true AND bm.deleted_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.branch_members bm
       WHERE bm.user_id = NEW.id AND bm.organization_id = NEW.organization_id
         AND bm.is_active = true AND bm.deleted_at IS NULL AND bm.role = 'owner'
     ) THEN
    PERFORM public.assert_managed_seat_available(NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_20_guard_status_change ON public.profiles;
CREATE TRIGGER trg_profiles_20_guard_status_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_status_change();

CREATE OR REPLACE FUNCTION public.branch_members_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_trusted BOOLEAN := COALESCE(current_setting('app.trusted_membership_op', true), '') = 'on';
  v_org UUID;
  v_user UUID;
  v_old_owner BOOLEAN := false;
  v_new_owner BOOLEAN := false;
  v_old_counts BOOLEAN := false;
  v_new_counts BOOLEAN := false;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.organization_id;
    v_user := OLD.user_id;
  ELSE
    v_org := NEW.organization_id;
    v_user := NEW.user_id;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    v_old_owner := OLD.role = 'owner' AND OLD.is_active AND OLD.deleted_at IS NULL;
    v_old_counts := OLD.role <> 'owner' AND OLD.is_active AND OLD.deleted_at IS NULL;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    v_new_owner := NEW.role = 'owner' AND NEW.is_active AND NEW.deleted_at IS NULL;
    v_new_counts := NEW.role <> 'owner' AND NEW.is_active AND NEW.deleted_at IS NULL;
  END IF;

  -- Self-escalation: end users never change their own membership.
  IF v_actor IS NOT NULL AND v_actor = v_user AND NOT v_trusted THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'SELF_MODIFICATION_NOT_ALLOWED' USING ERRCODE = '42501';
    ELSIF TG_OP = 'UPDATE' AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.permissions IS DISTINCT FROM OLD.permissions
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    ) THEN
      RAISE EXCEPTION 'SELF_MODIFICATION_NOT_ALLOWED' USING ERRCODE = '42501';
    ELSIF TG_OP = 'INSERT' AND EXISTS (
      SELECT 1 FROM public.branch_members bm
      WHERE bm.user_id = v_actor AND bm.is_active = true AND bm.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'SELF_MODIFICATION_NOT_ALLOWED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Only a Central Admin can create another Central Admin (bootstrap of a new org is allowed).
  IF v_new_owner AND NOT v_old_owner AND v_actor IS NOT NULL AND NOT v_trusted
     AND NOT public.is_org_central_admin(v_actor, v_org)
     AND EXISTS (
       SELECT 1 FROM public.branch_members bm
       WHERE bm.organization_id = v_org AND bm.role = 'owner'
         AND bm.is_active = true AND bm.deleted_at IS NULL
     ) THEN
    RAISE EXCEPTION 'ONLY_CENTRAL_ADMIN_CAN_ASSIGN_OWNER' USING ERRCODE = '42501';
  END IF;

  -- Managers may only hand out roles they fully hold (direct API writes included).
  IF v_actor IS NOT NULL AND v_actor <> v_user AND NOT v_trusted AND TG_OP <> 'DELETE' THEN
    IF NEW.permissions IS NOT NULL
       AND jsonb_typeof(NEW.permissions) = 'array'
       AND jsonb_array_length(NEW.permissions) > 0
       AND (TG_OP = 'INSERT' OR NEW.permissions IS DISTINCT FROM OLD.permissions) THEN
      RAISE EXCEPTION 'LEGACY_CUSTOM_PERMISSIONS_READ_ONLY' USING ERRCODE = '42501';
    END IF;
    IF v_new_owner OR v_new_counts THEN
      IF TG_OP = 'INSERT'
         OR NEW.role IS DISTINCT FROM OLD.role
         OR (NEW.is_active AND NOT OLD.is_active)
         OR (NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL) THEN
        PERFORM public.assert_actor_can_grant_role(
          NEW.role,
          (
            SELECT COALESCE(array_agg(o.permission_key), '{}'::TEXT[])
            FROM public.user_permission_overrides o
            WHERE o.user_id = v_user AND o.organization_id = v_org AND o.enabled = false
          )
        );
      END IF;
    END IF;
  END IF;

  -- Central Admin protection + last Central Admin lockout prevention.
  IF v_old_owner AND NOT v_new_owner THEN
    IF v_actor IS NOT NULL AND v_actor <> v_user AND NOT public.is_org_central_admin(v_actor, v_org) THEN
      RAISE EXCEPTION 'CENTRAL_ADMIN_PROTECTED' USING ERRCODE = '42501';
    END IF;
    IF (TG_OP = 'UPDATE' OR v_actor IS NOT NULL) AND NOT EXISTS (
      SELECT 1
      FROM public.branch_members bm
      INNER JOIN public.profiles p ON p.id = bm.user_id
      WHERE bm.organization_id = v_org
        AND bm.id <> OLD.id
        AND bm.role = 'owner' AND bm.is_active = true AND bm.deleted_at IS NULL
        AND p.is_active = true AND p.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'LAST_CENTRAL_ADMIN' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Managed seat limit when this row makes a user count as an active managed user.
  IF v_new_counts AND NOT v_old_counts
     AND NOT public.is_org_central_admin(v_user, v_org)
     AND NOT EXISTS (
       SELECT 1 FROM public.branch_members bm
       WHERE bm.user_id = v_user AND bm.organization_id = v_org
         AND bm.id <> NEW.id
         AND bm.role <> 'owner' AND bm.is_active = true AND bm.deleted_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = v_user AND (p.is_active = false OR p.deleted_at IS NOT NULL)
     ) THEN
    PERFORM public.assert_managed_seat_available(v_org);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_members_guard ON public.branch_members;
CREATE TRIGGER trg_branch_members_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.branch_members
  FOR EACH ROW EXECUTE FUNCTION public.branch_members_guard();

CREATE OR REPLACE FUNCTION public.organization_invitations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_counts BOOLEAN := NEW.status = 'pending' AND NEW.deleted_at IS NULL
    AND NEW.expires_at > now() AND NEW.role <> 'owner';
  v_old_counts BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old_counts := OLD.status = 'pending' AND OLD.deleted_at IS NULL
      AND OLD.expires_at > now() AND OLD.role <> 'owner';
  END IF;

  IF NEW.role = 'owner' AND NEW.status = 'pending' AND auth.uid() IS NOT NULL
     AND NOT public.is_org_central_admin(auth.uid(), NEW.organization_id) THEN
    RAISE EXCEPTION 'ONLY_CENTRAL_ADMIN_CAN_ASSIGN_OWNER' USING ERRCODE = '42501';
  END IF;

  IF v_new_counts AND NOT v_old_counts THEN
    PERFORM public.assert_managed_seat_available(NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_invitations_guard ON public.organization_invitations;
CREATE TRIGGER trg_organization_invitations_guard
  BEFORE INSERT OR UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.organization_invitations_guard();

-- Granular permissions enforced in the database for staff sessions.
CREATE OR REPLACE FUNCTION public.enforce_granular_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_required TEXT;
BEGIN
  IF NOT public.is_staff_actor() THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'appointments' THEN
    IF (NEW.status::TEXT = 'cancelada' AND OLD.status::TEXT IS DISTINCT FROM 'cancelada')
       OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL) THEN
      v_required := 'appointments:cancel';
    END IF;
  ELSIF TG_TABLE_NAME IN ('patients', 'owners') THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      v_required := 'patients:delete';
    END IF;
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF NEW.status::TEXT = 'anulada' AND OLD.status::TEXT IS DISTINCT FROM 'anulada' THEN
      v_required := 'billing:cancel';
    END IF;
  END IF;

  IF v_required IS NOT NULL AND NOT public.has_permission(v_required) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED:%', v_required USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_granular_permissions ON public.appointments;
CREATE TRIGGER trg_appointments_granular_permissions
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_granular_permissions();

DROP TRIGGER IF EXISTS trg_patients_granular_permissions ON public.patients;
CREATE TRIGGER trg_patients_granular_permissions
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_granular_permissions();

DROP TRIGGER IF EXISTS trg_owners_granular_permissions ON public.owners;
CREATE TRIGGER trg_owners_granular_permissions
  BEFORE UPDATE ON public.owners
  FOR EACH ROW EXECUTE FUNCTION public.enforce_granular_permissions();

DROP TRIGGER IF EXISTS trg_invoices_granular_permissions ON public.invoices;
CREATE TRIGGER trg_invoices_granular_permissions
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_granular_permissions();

-- ─────────────────────────────────────────────
-- 7. Audit hardening (append-only, no forged events)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND user_id = auth.uid()
    AND (
      action LIKE 'data\_import.%'
      OR action LIKE 'data\_export.%'
      OR action LIKE 'data\_migration.%'
    )
  );

REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_logs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(current_setting('app.allow_audit_purge', true), '') = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  -- Only FK maintenance (ON DELETE SET NULL of branch/user) may touch a row.
  IF NEW.id = OLD.id
     AND NEW.organization_id = OLD.organization_id
     AND NEW.action = OLD.action
     AND NEW.entity_type = OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.old_data IS NOT DISTINCT FROM OLD.old_data
     AND NEW.new_data IS NOT DISTINCT FROM OLD.new_data
     AND NEW.ip_address IS NOT DISTINCT FROM OLD.ip_address
     AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
     AND NEW.created_at = OLD.created_at
     AND (NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id OR NEW.branch_id IS NULL)
     AND (NEW.user_id IS NOT DISTINCT FROM OLD.user_id OR NEW.user_id IS NULL) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AUDIT_LOG_IMMUTABLE' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_append_only ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();

CREATE OR REPLACE FUNCTION public.log_user_admin_event(
  p_organization_id UUID,
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_data JSONB
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (organization_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (p_organization_id, auth.uid(), p_action, p_entity_type, p_entity_id, p_data);
$$;

-- ─────────────────────────────────────────────
-- 8. Session bootstrap: org-scoped memberships + restrictions + account status
-- ─────────────────────────────────────────────
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
  v_org_id UUID;
  v_memberships JSONB;
  v_denied JSONB;
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
    'account_status', p.account_status,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'deleted_at', p.deleted_at
  ), p.organization_id
  INTO v_profile, v_org_id
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
    AND bm.organization_id = v_org_id
    AND bm.is_active = true
    AND bm.deleted_at IS NULL;

  SELECT COALESCE(jsonb_agg(o.permission_key ORDER BY o.permission_key), '[]'::jsonb)
  INTO v_denied
  FROM public.user_permission_overrides o
  WHERE o.user_id = v_uid
    AND o.organization_id = v_org_id
    AND o.enabled = false;

  v_portal_owner_id := NULL;
  IF jsonb_array_length(v_memberships) = 0 THEN
    v_portal_owner_id := public.get_portal_owner_id();
  END IF;

  RETURN jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'profile', v_profile,
    'memberships', v_memberships,
    'denied_permissions', v_denied,
    'portal_owner_id', v_portal_owner_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_account_state()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE COALESCE(
      (
        SELECT jsonb_build_object('has_profile', true, 'account_status', p.account_status)
        FROM public.profiles p
        WHERE p.id = auth.uid() AND p.deleted_at IS NULL
      ),
      jsonb_build_object('has_profile', false, 'account_status', NULL)
    )
  END;
$$;

-- ─────────────────────────────────────────────
-- 9. Read RPCs (organization always resolved from the session)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_managed_users(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role public.user_role,
  branch_id UUID,
  branch_name TEXT,
  branch_count INT,
  account_status TEXT,
  is_central_admin BOOLEAN,
  last_sign_in_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  denied_permissions TEXT[],
  status_reason TEXT,
  status_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    u.email::TEXT,
    p.phone,
    m.role,
    m.branch_id,
    b.name,
    mc.cnt,
    p.account_status,
    EXISTS (
      SELECT 1 FROM public.branch_members bo
      WHERE bo.user_id = p.id AND bo.organization_id = v_org_id
        AND bo.role = 'owner' AND bo.is_active = true AND bo.deleted_at IS NULL
    ),
    u.last_sign_in_at,
    la.created_at,
    COALESCE(dp.keys, '{}'::TEXT[]),
    p.status_reason,
    p.status_changed_at,
    p.created_at
  FROM public.profiles p
  INNER JOIN LATERAL (
    SELECT bm.role, bm.branch_id
    FROM public.branch_members bm
    WHERE bm.user_id = p.id AND bm.organization_id = v_org_id AND bm.deleted_at IS NULL
    ORDER BY bm.is_active DESC,
      CASE WHEN bm.branch_id = p.active_branch_id THEN 0 ELSE 1 END,
      bm.created_at ASC
    LIMIT 1
  ) m ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INT AS cnt
    FROM public.branch_members bm
    WHERE bm.user_id = p.id AND bm.organization_id = v_org_id
      AND bm.is_active = true AND bm.deleted_at IS NULL
  ) mc ON true
  LEFT JOIN public.branches b ON b.id = m.branch_id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN LATERAL (
    SELECT a.created_at
    FROM public.audit_logs a
    WHERE a.organization_id = v_org_id AND a.user_id = p.id
    ORDER BY a.created_at DESC
    LIMIT 1
  ) la ON true
  LEFT JOIN LATERAL (
    SELECT array_agg(o.permission_key ORDER BY o.permission_key) AS keys
    FROM public.user_permission_overrides o
    WHERE o.user_id = p.id AND o.organization_id = v_org_id AND o.enabled = false
  ) dp ON true
  WHERE p.organization_id = v_org_id
    AND p.deleted_at IS NULL
    AND (p_user_id IS NULL OR p.id = p_user_id)
  ORDER BY p.full_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_managed_invitations()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  role public.user_role,
  branch_id UUID,
  branch_name TEXT,
  status TEXT,
  expires_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  send_count INT,
  denied_permissions TEXT[],
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id, i.email, i.full_name, i.phone, i.role, i.branch_id, b.name,
    CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
    i.expires_at, COALESCE(i.last_sent_at, i.created_at), i.send_count, i.denied_permissions, i.created_at
  FROM public.organization_invitations i
  LEFT JOIN public.branches b ON b.id = i.branch_id
  WHERE i.organization_id = v_org_id
    AND i.deleted_at IS NULL
    AND i.status = 'pending'
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_managed_users_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
  v_result JSONB;
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  WITH staff AS (
    SELECT p.id, p.account_status,
      EXISTS (
        SELECT 1 FROM public.branch_members bo
        WHERE bo.user_id = p.id AND bo.organization_id = v_org_id
          AND bo.role = 'owner' AND bo.is_active = true AND bo.deleted_at IS NULL
      ) AS is_admin
    FROM public.profiles p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND EXISTS (
        SELECT 1 FROM public.branch_members bm
        WHERE bm.user_id = p.id AND bm.organization_id = v_org_id AND bm.deleted_at IS NULL
      )
  )
  SELECT jsonb_build_object(
    'limit', public.managed_user_limit(v_org_id),
    'seats_used', public.managed_user_count(v_org_id),
    'total_users', (SELECT COUNT(*) FROM staff),
    'central_admins', (SELECT COUNT(*) FROM staff WHERE is_admin AND account_status = 'active'),
    'active_managed', (SELECT COUNT(*) FROM staff WHERE NOT is_admin AND account_status = 'active'),
    'suspended', (SELECT COUNT(*) FROM staff WHERE account_status = 'suspended'),
    'disabled', (SELECT COUNT(*) FROM staff WHERE account_status = 'disabled'),
    'pending_invitations', (
      SELECT COUNT(*) FROM public.organization_invitations i
      WHERE i.organization_id = v_org_id AND i.status = 'pending'
        AND i.deleted_at IS NULL AND i.expires_at > now()
    ),
    'activity_today', (
      SELECT COUNT(*) FROM public.audit_logs a
      WHERE a.organization_id = v_org_id
        AND a.user_id IS NOT NULL
        AND a.created_at >= date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires')
          AT TIME ZONE 'America/Argentina/Buenos_Aires'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.search_user_activity(
  p_user_id UUID DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_entity_types TEXT[] DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  user_id UUID,
  user_name TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id UUID,
  branch_id UUID,
  branch_name TEXT,
  status_from TEXT,
  status_to TEXT,
  details JSONB,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
  v_size INT := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_page, 1) - 1, 0) * LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') OR NOT public.has_permission('audit:read') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.created_at,
    a.user_id,
    pr.full_name,
    a.action,
    a.entity_type,
    a.entity_id,
    a.branch_id,
    b.name,
    a.old_data->>'status',
    a.new_data->>'status',
    -- Only user-management events expose metadata; clinical payloads are never returned.
    CASE WHEN a.entity_type IN ('user', 'user_invitation') THEN a.new_data ELSE NULL END,
    COUNT(*) OVER ()
  FROM public.audit_logs a
  LEFT JOIN public.profiles pr ON pr.id = a.user_id
  LEFT JOIN public.branches b ON b.id = a.branch_id
  WHERE a.organization_id = v_org_id
    AND a.user_id IS NOT NULL
    AND (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_from IS NULL OR a.created_at >= p_from)
    AND (p_to IS NULL OR a.created_at < p_to)
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_entity_types IS NULL OR a.entity_type = ANY(p_entity_types))
    AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
  ORDER BY a.created_at DESC
  LIMIT v_size
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_managed_user_access(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.organization_id = v_org_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'last_sign_in_at', (SELECT u.last_sign_in_at FROM auth.users u WHERE u.id = p_user_id),
    'sessions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'created_at', s.created_at,
        'last_active_at', COALESCE(s.refreshed_at::TIMESTAMPTZ, s.updated_at, s.created_at),
        'user_agent', left(s.user_agent, 300),
        'not_after', s.not_after
      ) ORDER BY COALESCE(s.refreshed_at::TIMESTAMPTZ, s.updated_at, s.created_at) DESC)
      FROM auth.sessions s
      WHERE s.user_id = p_user_id
        AND (s.not_after IS NULL OR s.not_after > now())
    ), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 10. Mutation RPCs
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.require_user_manager()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.get_user_organization_id();
BEGIN
  IF v_org_id IS NULL OR NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
  RETURN v_org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_managed_target(p_org_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.organization_id = p_org_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_MODIFICATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF public.is_org_central_admin(p_user_id, p_org_id)
     AND NOT public.is_org_central_admin(auth.uid(), p_org_id) THEN
    RAISE EXCEPTION 'CENTRAL_ADMIN_PROTECTED' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_denied_permissions(p_denied TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_invalid TEXT;
BEGIN
  SELECT k INTO v_invalid
  FROM unnest(COALESCE(p_denied, '{}'::TEXT[])) AS k
  WHERE NOT (k = ANY(public.permission_catalog()))
  LIMIT 1;
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'INVALID_PERMISSION:%', v_invalid USING ERRCODE = '22023';
  END IF;
  RETURN COALESCE((SELECT array_agg(DISTINCT k ORDER BY k) FROM unnest(p_denied) AS k), '{}'::TEXT[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_managed_invitation(
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT,
  p_branch_id UUID,
  p_role public.user_role,
  p_denied_permissions TEXT[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_email TEXT := lower(btrim(p_email));
  v_denied TEXT[] := public.normalize_denied_permissions(p_denied_permissions);
  v_existing_org UUID;
  v_id UUID;
BEGIN
  IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'INVALID_EMAIL' USING ERRCODE = '22023';
  END IF;
  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'OWNER_ROLE_NOT_INVITABLE' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = v_org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_actor_can_grant_role(p_role, v_denied);

  SELECT p.organization_id INTO v_existing_org
  FROM auth.users u
  INNER JOIN public.profiles p ON p.id = u.id AND p.deleted_at IS NULL
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_existing_org = v_org_id THEN
    RAISE EXCEPTION 'ALREADY_MEMBER' USING ERRCODE = '23505';
  ELSIF v_existing_org IS NOT NULL THEN
    RAISE EXCEPTION 'EMAIL_IN_OTHER_ORGANIZATION' USING ERRCODE = '23505';
  END IF;

  UPDATE public.organization_invitations i
  SET status = 'expired', updated_at = now()
  WHERE i.organization_id = v_org_id
    AND lower(i.email) = v_email
    AND i.status = 'pending'
    AND i.deleted_at IS NULL
    AND i.expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.organization_invitations i
    WHERE i.organization_id = v_org_id AND lower(i.email) = v_email
      AND i.status = 'pending' AND i.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVITATION_ALREADY_PENDING' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.organization_invitations (
    organization_id, branch_id, email, role, invited_by, full_name, phone,
    denied_permissions, last_sent_at, send_count
  )
  VALUES (
    v_org_id, p_branch_id, v_email, p_role, auth.uid(),
    NULLIF(left(btrim(p_full_name), 200), ''), NULLIF(left(btrim(p_phone), 40), ''),
    v_denied, now(), 1
  )
  RETURNING id INTO v_id;

  PERFORM public.log_user_admin_event(
    v_org_id, 'user_invited', 'user_invitation', v_id,
    jsonb_build_object('email', v_email, 'role', p_role, 'branch_id', p_branch_id,
      'denied_permissions', to_jsonb(v_denied))
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resend_managed_invitation(p_invitation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_inv public.organization_invitations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.organization_invitations i
  WHERE i.id = p_invitation_id AND i.organization_id = v_org_id
    AND i.deleted_at IS NULL AND i.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.organization_invitations
  SET expires_at = now() + INTERVAL '7 days',
      last_sent_at = now(),
      send_count = send_count + 1,
      updated_at = now()
  WHERE id = p_invitation_id;

  PERFORM public.log_user_admin_event(
    v_org_id, 'user_invitation_resent', 'user_invitation', p_invitation_id,
    jsonb_build_object('email', v_inv.email, 'send_count', v_inv.send_count + 1)
  );

  RETURN jsonb_build_object('email', v_inv.email, 'full_name', v_inv.full_name);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_managed_invitation(p_invitation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_email TEXT;
BEGIN
  UPDATE public.organization_invitations i
  SET status = 'revoked', deleted_at = now(), updated_at = now()
  WHERE i.id = p_invitation_id AND i.organization_id = v_org_id
    AND i.deleted_at IS NULL AND i.status = 'pending'
  RETURNING i.email INTO v_email;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'INVITATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_user_admin_event(
    v_org_id, 'user_invitation_revoked', 'user_invitation', p_invitation_id,
    jsonb_build_object('email', v_email)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_pending_invitation()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_confirmed TIMESTAMPTZ;
  v_profile public.profiles%ROWTYPE;
  v_inv public.organization_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  SELECT lower(u.email), u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed IS NULL THEN
    RETURN jsonb_build_object('status', 'email_unconfirmed');
  END IF;

  SELECT * INTO v_profile FROM public.profiles p WHERE p.id = v_uid;
  IF FOUND AND v_profile.deleted_at IS NULL THEN
    IF v_profile.account_status <> 'active' THEN
      RETURN jsonb_build_object('status', 'account_' || v_profile.account_status);
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.branch_members bm
      WHERE bm.user_id = v_uid AND bm.is_active = true AND bm.deleted_at IS NULL
    ) THEN
      RETURN jsonb_build_object('status', 'already_member');
    END IF;
  END IF;

  SELECT * INTO v_inv
  FROM public.organization_invitations i
  WHERE lower(i.email) = v_email
    AND i.status = 'pending'
    AND i.deleted_at IS NULL
    AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'no_invitation');
  END IF;

  IF v_profile.id IS NOT NULL AND v_profile.deleted_at IS NULL
     AND v_profile.organization_id <> v_inv.organization_id THEN
    RETURN jsonb_build_object('status', 'other_organization');
  END IF;

  PERFORM set_config('app.trusted_membership_op', 'on', true);

  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_at = now(), updated_at = now()
  WHERE id = v_inv.id;

  INSERT INTO public.profiles AS pr (id, organization_id, full_name, phone, active_branch_id, is_active, account_status)
  VALUES (
    v_uid, v_inv.organization_id,
    COALESCE(v_inv.full_name, split_part(v_email, '@', 1)),
    v_inv.phone, v_inv.branch_id, true, 'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      full_name = COALESCE(v_inv.full_name, pr.full_name),
      phone = COALESCE(v_inv.phone, pr.phone),
      active_branch_id = EXCLUDED.active_branch_id,
      is_active = true,
      account_status = 'active',
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.branch_members (organization_id, branch_id, user_id, role)
  VALUES (v_inv.organization_id, v_inv.branch_id, v_uid, v_inv.role)
  ON CONFLICT (branch_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, is_active = true, deleted_at = NULL, permissions = NULL, updated_at = now();

  INSERT INTO public.user_permission_overrides (organization_id, user_id, permission_key, enabled, created_by)
  SELECT v_inv.organization_id, v_uid, k, false, v_inv.invited_by
  FROM unnest(v_inv.denied_permissions) AS k
  ON CONFLICT (organization_id, user_id, permission_key) DO UPDATE SET enabled = false, updated_at = now();

  PERFORM set_config('app.trusted_membership_op', 'off', true);

  INSERT INTO public.audit_logs (organization_id, branch_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    v_inv.organization_id, v_inv.branch_id, v_uid, 'user_activated', 'user', v_uid,
    jsonb_build_object('invitation_id', v_inv.id, 'role', v_inv.role)
  );

  RETURN jsonb_build_object('status', 'accepted', 'organization_id', v_inv.organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_managed_user(
  p_user_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_role public.user_role,
  p_branch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_old_role public.user_role;
  v_denied TEXT[];
  v_active_count INT;
  v_member_id UUID;
BEGIN
  PERFORM public.assert_managed_target(v_org_id, p_user_id);

  SELECT bm.role INTO v_old_role
  FROM public.branch_members bm
  INNER JOIN public.profiles p ON p.id = bm.user_id
  WHERE bm.user_id = p_user_id AND bm.organization_id = v_org_id AND bm.deleted_at IS NULL
  ORDER BY bm.is_active DESC,
    CASE WHEN bm.branch_id = p.active_branch_id THEN 0 ELSE 1 END,
    bm.created_at ASC
  LIMIT 1;

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = v_org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'INVALID_BRANCH' USING ERRCODE = '22023';
  END IF;

  IF p_role IS DISTINCT FROM v_old_role THEN
    SELECT COALESCE(array_agg(o.permission_key), '{}'::TEXT[]) INTO v_denied
    FROM public.user_permission_overrides o
    WHERE o.user_id = p_user_id AND o.organization_id = v_org_id AND o.enabled = false;
    PERFORM public.assert_actor_can_grant_role(p_role, v_denied);
  END IF;

  UPDATE public.profiles
  SET full_name = COALESCE(NULLIF(left(btrim(p_full_name), 200), ''), full_name),
      phone = NULLIF(left(btrim(p_phone), 40), ''),
      updated_at = now()
  WHERE id = p_user_id;

  IF p_role IS DISTINCT FROM v_old_role THEN
    UPDATE public.branch_members
    SET role = p_role, updated_at = now()
    WHERE user_id = p_user_id AND organization_id = v_org_id
      AND is_active = true AND deleted_at IS NULL;

    IF p_role = 'owner' THEN
      DELETE FROM public.user_permission_overrides
      WHERE user_id = p_user_id AND organization_id = v_org_id;
    END IF;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branch_members bm
    WHERE bm.user_id = p_user_id AND bm.branch_id = p_branch_id
      AND bm.is_active = true AND bm.deleted_at IS NULL
  ) THEN
    SELECT COUNT(*)::INT, MIN(bm.id::TEXT)::UUID INTO v_active_count, v_member_id
    FROM public.branch_members bm
    WHERE bm.user_id = p_user_id AND bm.organization_id = v_org_id
      AND bm.is_active = true AND bm.deleted_at IS NULL;

    IF v_active_count = 1 AND NOT EXISTS (
      SELECT 1 FROM public.branch_members bm WHERE bm.user_id = p_user_id AND bm.branch_id = p_branch_id
    ) THEN
      UPDATE public.branch_members SET branch_id = p_branch_id, updated_at = now() WHERE id = v_member_id;
    ELSE
      INSERT INTO public.branch_members (organization_id, branch_id, user_id, role)
      VALUES (v_org_id, p_branch_id, p_user_id, p_role)
      ON CONFLICT (branch_id, user_id) DO UPDATE
      SET role = EXCLUDED.role, is_active = true, deleted_at = NULL, updated_at = now();
    END IF;
  END IF;

  IF p_branch_id IS NOT NULL THEN
    UPDATE public.profiles SET active_branch_id = p_branch_id WHERE id = p_user_id;
  END IF;

  IF p_role IS DISTINCT FROM v_old_role THEN
    PERFORM public.log_user_admin_event(
      v_org_id, 'role_changed', 'user', p_user_id,
      jsonb_build_object('from', v_old_role, 'to', p_role)
    );
  END IF;

  PERFORM public.log_user_admin_event(
    v_org_id, 'user_updated', 'user', p_user_id,
    jsonb_build_object('branch_id', p_branch_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_managed_user_status(
  p_user_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_old TEXT;
  v_action TEXT;
BEGIN
  IF p_status NOT IN ('active', 'suspended', 'disabled') THEN
    RAISE EXCEPTION 'INVALID_STATUS' USING ERRCODE = '22023';
  END IF;

  PERFORM public.assert_managed_target(v_org_id, p_user_id);

  SELECT p.account_status INTO v_old FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF v_old = p_status THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET account_status = p_status,
      status_changed_at = now(),
      status_changed_by = auth.uid(),
      status_reason = NULLIF(left(btrim(p_reason), 500), ''),
      updated_at = now()
  WHERE id = p_user_id;

  IF p_status = 'disabled' THEN
    DELETE FROM auth.sessions WHERE user_id = p_user_id;
  END IF;

  v_action := CASE p_status
    WHEN 'active' THEN 'user_reactivated'
    WHEN 'suspended' THEN 'user_suspended'
    ELSE 'user_disabled'
  END;

  PERFORM public.log_user_admin_event(
    v_org_id, v_action, 'user', p_user_id,
    jsonb_build_object('from', v_old, 'to', p_status, 'reason', NULLIF(left(btrim(p_reason), 500), ''))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_managed_user_sessions(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_count INT;
BEGIN
  PERFORM public.assert_managed_target(v_org_id, p_user_id);

  DELETE FROM auth.sessions WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_user_admin_event(
    v_org_id, 'user_sessions_revoked', 'user', p_user_id,
    jsonb_build_object('sessions', v_count)
  );
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_permission_restrictions(
  p_user_id UUID,
  p_denied_permissions TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.require_user_manager();
  v_target TEXT[] := public.normalize_denied_permissions(p_denied_permissions);
  v_current TEXT[];
  v_restrict TEXT[];
  v_allow TEXT[];
  v_missing TEXT;
BEGIN
  PERFORM public.assert_managed_target(v_org_id, p_user_id);

  IF public.is_org_central_admin(p_user_id, v_org_id) THEN
    RAISE EXCEPTION 'CENTRAL_ADMIN_PERMISSIONS_LOCKED' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(o.permission_key), '{}'::TEXT[]) INTO v_current
  FROM public.user_permission_overrides o
  WHERE o.user_id = p_user_id AND o.organization_id = v_org_id AND o.enabled = false;

  SELECT COALESCE(array_agg(k), '{}'::TEXT[]) INTO v_restrict
  FROM unnest(v_target) AS k WHERE NOT (k = ANY(v_current));

  SELECT COALESCE(array_agg(k), '{}'::TEXT[]) INTO v_allow
  FROM unnest(v_current) AS k WHERE NOT (k = ANY(v_target));

  -- Re-enabling a permission is a grant: the actor must hold it.
  SELECT k INTO v_missing FROM unnest(v_allow) AS k WHERE NOT public.has_permission(k) LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_GRANT_PERMISSION:%', v_missing USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.user_permission_overrides
  WHERE user_id = p_user_id AND organization_id = v_org_id AND permission_key = ANY(v_allow);

  INSERT INTO public.user_permission_overrides (organization_id, user_id, permission_key, enabled, created_by)
  SELECT v_org_id, p_user_id, k, false, auth.uid() FROM unnest(v_restrict) AS k
  ON CONFLICT (organization_id, user_id, permission_key)
  DO UPDATE SET enabled = false, created_by = auth.uid(), updated_at = now();

  IF cardinality(v_restrict) > 0 OR cardinality(v_allow) > 0 THEN
    PERFORM public.log_user_admin_event(
      v_org_id, 'permissions_updated', 'user', p_user_id,
      jsonb_build_object('permissions_removed', to_jsonb(v_restrict), 'permissions_added', to_jsonb(v_allow))
    );
  END IF;

  RETURN jsonb_build_object('restricted', to_jsonb(v_restrict), 'allowed', to_jsonb(v_allow));
END;
$$;

-- Legacy add_team_member: same contract, plus anti-escalation and self/owner protection.
CREATE OR REPLACE FUNCTION public.add_team_member(p_user_id UUID, p_branch_id UUID, p_role public.user_role)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_member_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_permission('users:manage') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'SELF_MODIFICATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.branches b
    WHERE b.id = p_branch_id AND b.organization_id = v_org_id AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Invalid branch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id AND p.organization_id <> v_org_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'User belongs to another organization';
  END IF;

  PERFORM public.assert_actor_can_grant_role(p_role, '{}'::TEXT[]);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    INSERT INTO public.profiles (id, organization_id, full_name)
    SELECT p_user_id, v_org_id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    FROM auth.users u WHERE u.id = p_user_id;
  END IF;

  INSERT INTO public.branch_members (organization_id, branch_id, user_id, role)
  VALUES (v_org_id, p_branch_id, p_user_id, p_role)
  ON CONFLICT (branch_id, user_id) DO UPDATE
  SET role = EXCLUDED.role, is_active = true, deleted_at = NULL, updated_at = now()
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 11. Grants (default EXECUTE to PUBLIC is removed for every new function)
-- ─────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.permission_catalog() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.permission_parent(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.role_permissions(public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.permission_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.permission_parent(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_permissions(public.user_role) TO authenticated;

REVOKE ALL ON FUNCTION public.is_org_central_admin(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.managed_user_limit(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.managed_user_count(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_managed_seat_available(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_actor_can_grant_role(public.user_role, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_staff_actor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_user_admin_event(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.require_user_manager() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_managed_target(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_denied_permissions(TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_sync_account_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_guard_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.branch_members_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.organization_invitations_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_granular_permissions() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_logs_append_only() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_session_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_bootstrap() TO authenticated;

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.get_my_account_state()',
    'public.list_managed_users(uuid)',
    'public.list_managed_invitations()',
    'public.get_managed_users_overview()',
    'public.search_user_activity(uuid, timestamptz, timestamptz, text, text[], uuid, int, int)',
    'public.get_managed_user_access(uuid)',
    'public.create_managed_invitation(text, text, text, uuid, public.user_role, text[])',
    'public.resend_managed_invitation(uuid)',
    'public.revoke_managed_invitation(uuid)',
    'public.accept_pending_invitation()',
    'public.update_managed_user(uuid, text, text, public.user_role, uuid)',
    'public.set_managed_user_status(uuid, text, text)',
    'public.revoke_managed_user_sessions(uuid)',
    'public.set_user_permission_restrictions(uuid, text[])',
    'public.add_team_member(uuid, uuid, public.user_role)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
