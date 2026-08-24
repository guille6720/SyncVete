-- Waiting Room Phase 4: QR self check-in tokens + notify on "called".
-- STAGING FIRST. Additive. Does NOT extend appointment_status.

-- ─────────────────────────────────────────────
-- Table: appointment_check_in_tokens
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_check_in_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_waiting_room_entry_id UUID REFERENCES public.waiting_room_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointment_check_in_tokens_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_appointment_check_in_tokens_appointment
  ON public.appointment_check_in_tokens (appointment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_check_in_tokens_org
  ON public.appointment_check_in_tokens (organization_id, created_at DESC);

CREATE TRIGGER trg_audit_appointment_check_in_tokens
  AFTER INSERT OR UPDATE OR DELETE ON public.appointment_check_in_tokens
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.appointment_check_in_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_check_in_tokens_select_staff ON public.appointment_check_in_tokens;
CREATE POLICY appointment_check_in_tokens_select_staff ON public.appointment_check_in_tokens
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('waiting_room:read')
  );

-- No direct insert/update/delete for clients: only SECURITY DEFINER RPCs.

-- ─────────────────────────────────────────────
-- Internal: create waiting room entry for an appointment
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.waiting_room_insert_check_in(
  p_appt public.appointments,
  p_created_by UUID DEFAULT NULL
)
RETURNS public.waiting_room_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_pos INTEGER;
  v_entry public.waiting_room_entries%ROWTYPE;
BEGIN
  IF p_appt.status = 'cancelada' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita cancelada';
  END IF;

  IF p_appt.status = 'completada' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita completada';
  END IF;

  IF p_appt.status = 'ausente' THEN
    RAISE EXCEPTION 'No se puede hacer check-in de una cita marcada ausente';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = p_appt.id
      AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La cita ya tiene una entrada activa en sala de espera';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_appt.branch_id::text));

  SELECT COALESCE(MAX(w.queue_position), 0) + 1
  INTO v_next_pos
  FROM public.waiting_room_entries w
  WHERE w.organization_id = p_appt.organization_id
    AND w.branch_id = p_appt.branch_id
    AND w.deleted_at IS NULL
    AND w.status <> 'completed';

  INSERT INTO public.waiting_room_entries (
    organization_id,
    branch_id,
    appointment_id,
    status,
    checked_in_at,
    queue_position,
    priority,
    created_by
  ) VALUES (
    p_appt.organization_id,
    p_appt.branch_id,
    p_appt.id,
    'waiting',
    now(),
    v_next_pos,
    0,
    p_created_by
  )
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.waiting_room_insert_check_in(public.appointments, UUID)
  FROM PUBLIC, anon, authenticated;

-- Rewrite staff check-in to use shared helper
CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_appt public.appointments%ROWTYPE;
  v_entry public.waiting_room_entries%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para check-in en sala de espera';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id requerido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_appt.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la cita';
  END IF;

  v_entry := public.waiting_room_insert_check_in(v_appt, auth.uid());

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'organization_id', v_entry.organization_id,
    'branch_id', v_entry.branch_id,
    'appointment_id', v_entry.appointment_id,
    'status', v_entry.status,
    'checked_in_at', v_entry.checked_in_at,
    'called_at', v_entry.called_at,
    'consultation_started_at', v_entry.consultation_started_at,
    'payment_pending_at', v_entry.payment_pending_at,
    'completed_at', v_entry.completed_at,
    'queue_position', v_entry.queue_position,
    'priority', v_entry.priority,
    'room', v_entry.room,
    'created_by', v_entry.created_by,
    'created_at', v_entry.created_at,
    'updated_at', v_entry.updated_at
  );
END;
$$;

-- ─────────────────────────────────────────────
-- RPC: create_appointment_check_in_token (staff)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_appointment_check_in_token(p_appointment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_appt public.appointments%ROWTYPE;
  v_token TEXT;
  v_hash TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para generar QR de check-in';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id requerido';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = p_appointment_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_appt.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la cita';
  END IF;

  IF v_appt.status IN ('cancelada', 'completada', 'ausente') THEN
    RAISE EXCEPTION 'No se puede generar QR para esta cita';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = v_appt.id
      AND w.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'La cita ya está en sala de espera';
  END IF;

  -- Invalidate previous unused tokens for this appointment
  UPDATE public.appointment_check_in_tokens
  SET expires_at = least(expires_at, now())
  WHERE appointment_id = v_appt.id
    AND redeemed_at IS NULL
    AND expires_at > now();

  v_token := encode(gen_random_bytes(32), 'hex');
  v_hash := encode(digest(v_token, 'sha256'), 'hex');
  v_expires := now() + interval '12 hours';

  INSERT INTO public.appointment_check_in_tokens (
    organization_id,
    appointment_id,
    token_hash,
    expires_at,
    created_by
  ) VALUES (
    v_org_id,
    v_appt.id,
    v_hash,
    v_expires,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'appointment_id', v_appt.id,
    'path', '/check-in/' || v_token
  );
END;
$$;

-- ─────────────────────────────────────────────
-- RPC: preview_appointment_check_in (public)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.preview_appointment_check_in(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.appointment_check_in_tokens%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_patient_name TEXT;
  v_species public.patient_species;
  v_org_name TEXT;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_required');
  END IF;

  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.appointment_check_in_tokens
  WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_row.redeemed_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_redeemed');
  END IF;

  IF v_row.expires_at <= now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = v_row.appointment_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'appointment_missing');
  END IF;

  IF v_appt.status IN ('cancelada', 'completada', 'ausente') THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'appointment_closed');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = v_appt.id
      AND w.deleted_at IS NULL
  ) THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'already_checked_in');
  END IF;

  SELECT p.name, p.species, o.name
  INTO v_patient_name, v_species, v_org_name
  FROM public.patients p
  JOIN public.organizations o ON o.id = v_appt.organization_id
  WHERE p.id = v_appt.patient_id;

  RETURN jsonb_build_object(
    'valid', true,
    'patient_name', v_patient_name,
    'patient_species', v_species,
    'appointment_starts_at', v_appt.starts_at,
    'appointment_type', v_appt.appointment_type,
    'organization_name', v_org_name,
    'expires_at', v_row.expires_at
  );
END;
$$;

-- ─────────────────────────────────────────────
-- RPC: redeem_appointment_check_in (public)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.redeem_appointment_check_in(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.appointment_check_in_tokens%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_patient_name TEXT;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'Token requerido';
  END IF;

  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.appointment_check_in_tokens
  WHERE token_hash = v_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de check-in inválido';
  END IF;

  IF v_row.redeemed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este código ya fue usado';
  END IF;

  IF v_row.expires_at <= now() THEN
    RAISE EXCEPTION 'Este código expiró';
  END IF;

  SELECT * INTO v_appt
  FROM public.appointments
  WHERE id = v_row.appointment_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada';
  END IF;

  v_entry := public.waiting_room_insert_check_in(v_appt, NULL);

  UPDATE public.appointment_check_in_tokens
  SET
    redeemed_at = now(),
    redeemed_waiting_room_entry_id = v_entry.id
  WHERE id = v_row.id;

  SELECT p.name INTO v_patient_name
  FROM public.patients p
  WHERE p.id = v_appt.patient_id;

  PERFORM public.emit_notification(
    v_appt.organization_id,
    v_appt.branch_id,
    'cita',
    'Check-in QR: ' || COALESCE(v_patient_name, 'paciente'),
    'Ingresó a sala de espera vía código QR',
    '/sala-espera',
    'appointment',
    v_appt.id,
    2
  );

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'organization_id', v_entry.organization_id,
    'branch_id', v_entry.branch_id,
    'appointment_id', v_entry.appointment_id,
    'status', v_entry.status,
    'checked_in_at', v_entry.checked_in_at,
    'queue_position', v_entry.queue_position,
    'priority', v_entry.priority,
    'patient_name', v_patient_name
  );
END;
$$;

-- ─────────────────────────────────────────────
-- Notify staff + portal alert when called
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_portal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_id UUID NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  portal_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  href TEXT NOT NULL DEFAULT '/portal/sala-espera',
  related_type TEXT,
  related_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_portal_alerts_user_unread
  ON public.owner_portal_alerts (portal_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_owner_portal_alerts_owner
  ON public.owner_portal_alerts (owner_id, created_at DESC);

ALTER TABLE public.owner_portal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_portal_alerts_select_own ON public.owner_portal_alerts;
CREATE POLICY owner_portal_alerts_select_own ON public.owner_portal_alerts
  FOR SELECT USING (portal_user_id = auth.uid());

DROP POLICY IF EXISTS owner_portal_alerts_update_own ON public.owner_portal_alerts;
CREATE POLICY owner_portal_alerts_update_own ON public.owner_portal_alerts
  FOR UPDATE
  USING (portal_user_id = auth.uid())
  WITH CHECK (portal_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.trg_waiting_room_notify_called()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient TEXT;
  v_owner_id UUID;
  v_portal_user UUID;
  v_room TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'called' OR OLD.status IS NOT DISTINCT FROM 'called' THEN
    RETURN NEW;
  END IF;

  SELECT p.name, a.owner_id, o.portal_user_id
  INTO v_patient, v_owner_id, v_portal_user
  FROM public.appointments a
  JOIN public.patients p ON p.id = a.patient_id
  JOIN public.owners o ON o.id = a.owner_id
  WHERE a.id = NEW.appointment_id;

  v_room := NULLIF(btrim(COALESCE(NEW.room, '')), '');

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'cita',
    'Llamado: ' || COALESCE(v_patient, 'paciente'),
    CASE
      WHEN v_room IS NOT NULL THEN 'Paciente llamado · Consultorio ' || v_room
      ELSE 'Paciente llamado a consulta'
    END,
    '/sala-espera',
    'appointment',
    NEW.appointment_id,
    1
  );

  IF v_portal_user IS NOT NULL AND v_owner_id IS NOT NULL THEN
    INSERT INTO public.owner_portal_alerts (
      organization_id,
      owner_id,
      portal_user_id,
      title,
      body,
      href,
      related_type,
      related_id
    ) VALUES (
      NEW.organization_id,
      v_owner_id,
      v_portal_user,
      '¡Te están llamando!',
      CASE
        WHEN v_room IS NOT NULL THEN
          COALESCE(v_patient, 'Tu mascota') || ' · Consultorio ' || v_room
        ELSE
          COALESCE(v_patient, 'Tu mascota') || ' está siendo llamado/a'
      END,
      '/portal/sala-espera',
      'waiting_room_entry',
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_waiting_room_notify_called ON public.waiting_room_entries;
CREATE TRIGGER trg_waiting_room_notify_called
  AFTER UPDATE OF status, room ON public.waiting_room_entries
  FOR EACH ROW EXECUTE FUNCTION public.trg_waiting_room_notify_called();

-- Portal alerts RPCs
CREATE OR REPLACE FUNCTION public.list_owner_portal_alerts(
  p_unread_only BOOLEAN DEFAULT true,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  href TEXT,
  related_type TEXT,
  related_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lim INT := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
BEGIN
  IF v_uid IS NULL OR public.get_portal_owner_id() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.body,
    a.href,
    a.related_type,
    a.related_id,
    a.read_at,
    a.created_at
  FROM public.owner_portal_alerts a
  WHERE a.portal_user_id = v_uid
    AND (NOT COALESCE(p_unread_only, true) OR a.read_at IS NULL)
  ORDER BY a.created_at DESC
  LIMIT v_lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_owner_portal_alerts_read(p_ids UUID[] DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT := 0;
BEGIN
  IF v_uid IS NULL OR public.get_portal_owner_id() IS NULL THEN
    RETURN 0;
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    UPDATE public.owner_portal_alerts
    SET read_at = now()
    WHERE portal_user_id = v_uid
      AND read_at IS NULL;
  ELSE
    UPDATE public.owner_portal_alerts
    SET read_at = now()
    WHERE portal_user_id = v_uid
      AND read_at IS NULL
      AND id = ANY (p_ids);
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_appointment_check_in_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_appointment_check_in(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_appointment_check_in(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_owner_portal_alerts(BOOLEAN, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_owner_portal_alerts_read(UUID[]) TO authenticated;
