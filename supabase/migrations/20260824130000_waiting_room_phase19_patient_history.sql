-- Waiting Room Phase 19: patient waiting-room history for clinic ficha.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.list_patient_waiting_room_history(
  p_patient_id UUID,
  p_limit INT DEFAULT 8
)
RETURNS TABLE (
  waiting_room_entry_id UUID,
  appointment_id UUID,
  checked_in_at TIMESTAMPTZ,
  waiting_room_status TEXT,
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  removed BOOLEAN,
  room TEXT,
  appointment_starts_at TIMESTAMPTZ,
  minutes_to_call NUMERIC,
  minutes_dwell NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_limit INT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
     OR NOT public.has_permission('patients:read')
     OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_patient_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.organization_id = v_org_id
      AND p.deleted_at IS NULL
  ) THEN
    RETURN;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 8), 1), 20);

  RETURN QUERY
  SELECT
    w.id AS waiting_room_entry_id,
    w.appointment_id,
    w.checked_in_at,
    w.status::text AS waiting_room_status,
    w.called_at,
    w.completed_at,
    (w.deleted_at IS NOT NULL) AS removed,
    w.room,
    a.starts_at AS appointment_starts_at,
    CASE
      WHEN w.called_at IS NOT NULL AND w.called_at > w.checked_in_at THEN
        ROUND(EXTRACT(EPOCH FROM (w.called_at - w.checked_in_at)) / 60.0)
      ELSE NULL
    END AS minutes_to_call,
    CASE
      WHEN COALESCE(w.completed_at, w.deleted_at) IS NOT NULL
        AND COALESCE(w.completed_at, w.deleted_at) > w.checked_in_at THEN
        ROUND(
          EXTRACT(EPOCH FROM (COALESCE(w.completed_at, w.deleted_at) - w.checked_in_at)) / 60.0
        )
      ELSE NULL
    END AS minutes_dwell
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
  WHERE w.organization_id = v_org_id
    AND a.patient_id = p_patient_id
    AND public.user_has_branch_access(w.branch_id)
  ORDER BY w.checked_in_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_patient_waiting_room_history(UUID, INT) TO authenticated;

COMMENT ON FUNCTION public.list_patient_waiting_room_history(UUID, INT) IS
  'Recent waiting-room check-ins for a patient ficha (requires patients:read + waiting_room:read).';
