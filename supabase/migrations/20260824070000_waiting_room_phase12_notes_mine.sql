-- Waiting Room Phase 12: staff internal_notes on list + update RPC.
-- STAGING FIRST. Notes stay staff-only (portal/TV UIs must not render them).

DROP FUNCTION IF EXISTS public.list_waiting_room(UUID, DATE);

CREATE OR REPLACE FUNCTION public.list_waiting_room(
  p_branch_id UUID DEFAULT NULL,
  p_date DATE DEFAULT NULL
)
RETURNS TABLE (
  waiting_room_entry_id UUID,
  appointment_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_id UUID,
  owner_full_name TEXT,
  assigned_user_id UUID,
  assigned_user_name TEXT,
  appointment_type public.appointment_type,
  appointment_starts_at TIMESTAMPTZ,
  waiting_room_status public.waiting_room_status,
  checked_in_at TIMESTAMPTZ,
  called_at TIMESTAMPTZ,
  consultation_started_at TIMESTAMPTZ,
  payment_pending_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  queue_position INTEGER,
  priority INTEGER,
  room TEXT,
  internal_notes TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  IF p_date IS NOT NULL THEN
    v_day_start := (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
    v_day_end := ((p_date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  END IF;

  RETURN QUERY
  SELECT
    w.id AS waiting_room_entry_id,
    a.id AS appointment_id,
    a.patient_id,
    p.name AS patient_name,
    p.species AS patient_species,
    a.owner_id,
    o.full_name AS owner_full_name,
    a.assigned_user_id,
    pr.full_name AS assigned_user_name,
    a.appointment_type,
    a.starts_at AS appointment_starts_at,
    w.status AS waiting_room_status,
    w.checked_in_at,
    w.called_at,
    w.consultation_started_at,
    w.payment_pending_at,
    w.completed_at,
    w.queue_position,
    w.priority,
    w.room,
    w.internal_notes
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
  INNER JOIN public.patients p
    ON p.id = a.patient_id
   AND p.deleted_at IS NULL
  INNER JOIN public.owners o
    ON o.id = a.owner_id
   AND o.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = a.assigned_user_id
  WHERE w.organization_id = v_org_id
    AND w.deleted_at IS NULL
    AND public.user_has_branch_access(w.branch_id)
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND (
      p_date IS NULL
      OR (w.checked_in_at >= v_day_start AND w.checked_in_at < v_day_end)
    )
  ORDER BY
    w.priority DESC,
    w.queue_position ASC NULLS LAST,
    w.checked_in_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_waiting_room(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.list_waiting_room(UUID, DATE) IS
  'Clinic staff waiting-room queue. Includes internal_notes (staff-only; do not expose via portal RPCs).';

CREATE OR REPLACE FUNCTION public.update_waiting_room_notes(
  p_entry_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_notes TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para editar sala de espera';
  END IF;

  SELECT * INTO v_entry
  FROM public.waiting_room_entries
  WHERE id = p_entry_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada de sala de espera no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_entry.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de esta entrada';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF v_notes IS NOT NULL AND char_length(v_notes) > 500 THEN
    RAISE EXCEPTION 'La nota no puede superar 500 caracteres';
  END IF;

  UPDATE public.waiting_room_entries
  SET internal_notes = v_notes
  WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'appointment_id', v_entry.appointment_id,
    'internal_notes', v_entry.internal_notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_waiting_room_notes(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.update_waiting_room_notes(UUID, TEXT) IS
  'Staff-only: set or clear waiting_room_entries.internal_notes (max 500 chars).';
