-- Rename owner-app booking labels: propietario → tutor (agenda title / cancel reason).

CREATE OR REPLACE FUNCTION public.book_owner_app_slot(p_slot_id uuid, p_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner public.owners%ROWTYPE;
  v_slot public.owner_app_slots%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_owner FROM public.owners WHERE id = public.get_portal_owner_id();
  IF auth.uid() IS NULL OR v_owner.id IS NULL OR public.is_clinic_staff() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_slot
  FROM public.owner_app_slots
  WHERE id = p_slot_id
    AND organization_id = v_owner.organization_id
  FOR UPDATE;

  IF v_slot.id IS NULL
    OR v_slot.appointment_id IS NOT NULL
    OR v_slot.starts_at <= now()
    OR NOT EXISTS (
      SELECT 1 FROM public.owner_app_settings
      WHERE organization_id = v_owner.organization_id
        AND (brand->>'enabled')::boolean IS TRUE
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.patients
      WHERE id = p_patient_id
        AND owner_id = v_owner.id
        AND organization_id = v_owner.organization_id
        AND is_active
        AND NOT is_deceased
        AND deleted_at IS NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.branches
      WHERE id = v_slot.branch_id AND is_active AND deleted_at IS NULL
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.branch_members
      WHERE user_id = v_slot.assigned_user_id
        AND branch_id = v_slot.branch_id
        AND is_active
        AND deleted_at IS NULL
    )
  THEN
    RAISE EXCEPTION 'Unavailable slot';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_slot.assigned_user_id::text, 0));

  INSERT INTO public.appointments (
    organization_id, branch_id, patient_id, owner_id, assigned_user_id,
    starts_at, ends_at, status, appointment_type, title
  )
  VALUES (
    v_slot.organization_id, v_slot.branch_id, p_patient_id, v_owner.id, v_slot.assigned_user_id,
    v_slot.starts_at, v_slot.ends_at, 'programada', 'consulta', 'Reserva desde app del tutor'
  )
  RETURNING id INTO v_id;

  UPDATE public.owner_app_slots
  SET appointment_id = v_id
  WHERE id = v_slot.id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_owner_app_booking(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := public.get_portal_owner_id();
BEGIN
  IF auth.uid() IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.owners o
    JOIN public.owner_app_settings s ON s.organization_id = o.organization_id
    WHERE o.id = v_owner
      AND (s.brand->>'enabled')::boolean IS TRUE
  ) THEN
    RAISE EXCEPTION 'Disabled';
  END IF;

  UPDATE public.appointments
  SET status = 'cancelada',
      cancellation_reason = 'Cancelado por el tutor'
  WHERE id = p_appointment_id
    AND owner_id = v_owner
    AND starts_at > now()
    AND deleted_at IS NULL
    AND status IN ('programada', 'confirmada')
    AND EXISTS (
      SELECT 1 FROM public.owner_app_slots WHERE appointment_id = p_appointment_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid booking';
  END IF;

  UPDATE public.owner_app_slots
  SET appointment_id = NULL
  WHERE appointment_id = p_appointment_id;
END;
$$;

UPDATE public.appointments
SET title = 'Reserva desde app del tutor'
WHERE title = 'Reserva desde app del propietario'
  AND deleted_at IS NULL;

UPDATE public.appointments
SET cancellation_reason = 'Cancelado por el tutor'
WHERE cancellation_reason = 'Cancelado por el propietario'
  AND deleted_at IS NULL;

REVOKE ALL ON FUNCTION public.book_owner_app_slot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.book_owner_app_slot(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_owner_app_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_owner_app_booking(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
