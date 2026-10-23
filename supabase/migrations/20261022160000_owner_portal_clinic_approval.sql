-- Owner creates the account from the invite; clinic then activates access
-- so pets/appointments only appear after staff confirmation.

ALTER TABLE public.owners
  ADD COLUMN IF NOT EXISTS portal_pending_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_portal_pending_user
  ON public.owners (portal_pending_user_id)
  WHERE portal_pending_user_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_portal_pending_owner_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT o.id
  FROM public.owners o
  WHERE o.portal_pending_user_id = auth.uid()
    AND o.portal_user_id IS NULL
    AND o.deleted_at IS NULL
    AND o.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.accept_owner_portal_invite(
  p_token TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_hash TEXT;
  v_invite public.owner_portal_invites%ROWTYPE;
  v_owner public.owners%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'Invitación inválida o vencida';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  v_hash := encode(extensions.digest(p_token, 'sha256'::text), 'hex');

  SELECT * INTO v_invite
  FROM public.owner_portal_invites
  WHERE token_hash = v_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF v_invite.id IS NULL THEN
    RAISE EXCEPTION 'Invitación inválida o vencida';
  END IF;

  IF lower(btrim(coalesce(v_email, ''))) <> lower(btrim(v_invite.email)) THEN
    RAISE EXCEPTION 'El email no coincide con la invitación';
  END IF;

  SELECT * INTO v_owner
  FROM public.owners
  WHERE id = v_invite.owner_id
    AND deleted_at IS NULL
    AND is_active = true
  FOR UPDATE;

  IF v_owner.id IS NULL THEN
    RAISE EXCEPTION 'Tutor no encontrado';
  END IF;

  IF v_owner.portal_user_id IS NOT NULL AND v_owner.portal_user_id <> v_user_id THEN
    RAISE EXCEPTION 'El tutor ya tiene acceso al portal';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.owners
    WHERE (portal_user_id = v_user_id OR portal_pending_user_id = v_user_id)
      AND id <> v_owner.id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta cuenta ya está vinculada a otro tutor';
  END IF;

  IF public.is_clinic_staff() THEN
    RAISE EXCEPTION 'Esta cuenta pertenece al equipo de una clínica';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id
    AND deleted_at IS NULL;

  v_name := COALESCE(
    NULLIF(btrim(coalesce(p_full_name, '')), ''),
    v_owner.full_name
  );

  IF v_profile.id IS NULL THEN
    INSERT INTO public.profiles (id, organization_id, full_name)
    VALUES (v_user_id, v_owner.organization_id, v_name);
  ELSIF v_profile.organization_id <> v_owner.organization_id THEN
    RAISE EXCEPTION 'Esta cuenta pertenece a otra clínica';
  END IF;

  -- Account created; clinic must approve before pets/turnos unlock.
  UPDATE public.owners
  SET portal_pending_user_id = v_user_id
  WHERE id = v_owner.id;

  UPDATE public.owner_portal_invites
  SET accepted_at = now()
  WHERE id = v_invite.id;

  UPDATE public.owner_portal_invites
  SET revoked_at = now()
  WHERE owner_id = v_owner.id
    AND id <> v_invite.id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  RETURN jsonb_build_object(
    'owner_id', v_owner.id,
    'organization_id', v_owner.organization_id,
    'pending_approval', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_owner_portal_access(p_owner_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_pending UUID;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.has_permission('patients:write') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT portal_pending_user_id INTO v_pending
  FROM public.owners
  WHERE id = p_owner_id
    AND organization_id = v_org
    AND deleted_at IS NULL
    AND is_active = true
  FOR UPDATE;

  IF v_pending IS NULL THEN
    RAISE EXCEPTION 'No hay una cuenta pendiente de activar';
  END IF;

  UPDATE public.owners
  SET portal_user_id = v_pending,
      portal_pending_user_id = NULL
  WHERE id = p_owner_id
    AND organization_id = v_org;

  RETURN p_owner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_owner_portal_access(p_owner_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('patients:write') THEN
    RAISE EXCEPTION 'No tenés permisos para revocar el portal';
  END IF;

  UPDATE public.owner_portal_invites
  SET revoked_at = now()
  WHERE owner_id = p_owner_id
    AND organization_id = v_org_id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  UPDATE public.owners
  SET portal_user_id = NULL,
      portal_pending_user_id = NULL
  WHERE id = p_owner_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_portal_status(p_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_owner public.owners%ROWTYPE;
  v_invite public.owner_portal_invites%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('patients:read') THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT * INTO v_owner
  FROM public.owners
  WHERE id = p_owner_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF v_owner.id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  IF v_owner.portal_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'active',
      'email', v_owner.email,
      'portal_user_id', v_owner.portal_user_id
    );
  END IF;

  IF v_owner.portal_pending_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'pending_approval',
      'email', v_owner.email,
      'portal_user_id', NULL
    );
  END IF;

  SELECT * INTO v_invite
  FROM public.owner_portal_invites
  WHERE owner_id = v_owner.id
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_invite.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'invited',
      'email', v_invite.email,
      'expires_at', v_invite.expires_at
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'inactive',
    'email', v_owner.email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_owner_portal_invite(p_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id UUID;
  v_owner public.owners%ROWTYPE;
  v_token TEXT;
  v_hash TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('patients:write') THEN
    RAISE EXCEPTION 'No tenés permisos para invitar al portal';
  END IF;

  SELECT * INTO v_owner
  FROM public.owners
  WHERE id = p_owner_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF v_owner.id IS NULL THEN
    RAISE EXCEPTION 'Tutor no encontrado';
  END IF;

  IF v_owner.portal_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'El tutor ya tiene acceso al portal';
  END IF;

  IF v_owner.email IS NULL OR btrim(v_owner.email) = '' THEN
    RAISE EXCEPTION 'El tutor no tiene email';
  END IF;

  -- New invite replaces a previous pending registration.
  UPDATE public.owners
  SET portal_pending_user_id = NULL
  WHERE id = v_owner.id;

  UPDATE public.owner_portal_invites
  SET revoked_at = now()
  WHERE owner_id = v_owner.id
    AND accepted_at IS NULL
    AND revoked_at IS NULL;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'::text), 'hex');
  v_expires := now() + interval '7 days';

  INSERT INTO public.owner_portal_invites (
    organization_id, owner_id, email, token_hash, invited_by, expires_at
  ) VALUES (
    v_org_id, v_owner.id, lower(btrim(v_owner.email)), v_hash, auth.uid(), v_expires
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'email', lower(btrim(v_owner.email)),
    'expires_at', v_expires
  );
END;
$$;

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
  v_portal_pending_owner_id UUID;
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
  v_portal_pending_owner_id := NULL;
  IF jsonb_array_length(v_memberships) = 0 THEN
    v_portal_owner_id := public.get_portal_owner_id();
    IF v_portal_owner_id IS NULL THEN
      v_portal_pending_owner_id := public.get_portal_pending_owner_id();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_platform_admin', public.is_platform_admin(),
    'profile', v_profile,
    'memberships', v_memberships,
    'portal_owner_id', v_portal_owner_id,
    'portal_pending_owner_id', v_portal_pending_owner_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_pending_owner_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_portal_pending_owner_id() TO authenticated;
REVOKE ALL ON FUNCTION public.approve_owner_portal_access(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_owner_portal_access(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_owner_portal_invite(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_owner_portal_invite(TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
