-- Hotfix: accept/create invite RPCs must call pgcrypto via extensions.*
-- Staging error: function digest(text, unknown) does not exist

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

REVOKE ALL ON FUNCTION public.accept_owner_portal_invite(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_owner_portal_invite(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.create_owner_portal_invite(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_owner_portal_invite(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
