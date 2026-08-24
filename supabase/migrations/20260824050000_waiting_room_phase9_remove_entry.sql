-- Waiting Room Phase 9: remove from queue / mark ausente.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.remove_waiting_room_entry(
  p_entry_id UUID,
  p_mark_ausente BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_appt public.appointments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para quitar de sala de espera';
  END IF;

  IF p_entry_id IS NULL THEN
    RAISE EXCEPTION 'entry_id requerido';
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
    RAISE EXCEPTION 'Sin acceso a la sucursal de la entrada';
  END IF;

  IF v_entry.status = 'completed' THEN
    RAISE EXCEPTION 'No se puede quitar una entrada ya completada';
  END IF;

  UPDATE public.waiting_room_entries
  SET deleted_at = now()
  WHERE id = v_entry.id
  RETURNING * INTO v_entry;

  IF COALESCE(p_mark_ausente, false) THEN
    SELECT * INTO v_appt
    FROM public.appointments
    WHERE id = v_entry.appointment_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF FOUND AND v_appt.status NOT IN ('completada', 'cancelada', 'ausente') THEN
      UPDATE public.appointments
      SET status = 'ausente'
      WHERE id = v_appt.id;
    END IF;
  END IF;

  -- Invalidate unused check-in tokens for this appointment
  UPDATE public.appointment_check_in_tokens
  SET expires_at = least(expires_at, now())
  WHERE appointment_id = v_entry.appointment_id
    AND redeemed_at IS NULL
    AND expires_at > now();

  RETURN jsonb_build_object(
    'id', v_entry.id,
    'appointment_id', v_entry.appointment_id,
    'deleted_at', v_entry.deleted_at,
    'marked_ausente', COALESCE(p_mark_ausente, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_waiting_room_entry(UUID, BOOLEAN) TO authenticated;
