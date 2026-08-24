-- Waiting Room Phase 17: row-level report entries for detailed CSV export.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.list_waiting_room_report_entries(
  p_from DATE,
  p_to DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID,
  checked_in_at TIMESTAMPTZ,
  patient_name TEXT,
  owner_full_name TEXT,
  assigned_user_name TEXT,
  appointment_starts_at TIMESTAMPTZ,
  status TEXT,
  room TEXT,
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  removed BOOLEAN,
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
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
     OR NOT public.has_permission('reports:read')
     OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  IF (p_to - p_from) > 92 THEN
    RAISE EXCEPTION 'El rango no puede superar 92 días';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_from := (p_from::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_to := ((p_to + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  RETURN QUERY
  SELECT
    w.id AS entry_id,
    w.checked_in_at,
    p.name AS patient_name,
    o.full_name AS owner_full_name,
    pr.full_name AS assigned_user_name,
    a.starts_at AS appointment_starts_at,
    w.status::text AS status,
    w.room,
    w.called_at,
    w.completed_at,
    (w.deleted_at IS NOT NULL) AS removed,
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
  INNER JOIN public.patients p
    ON p.id = a.patient_id
   AND p.deleted_at IS NULL
  INNER JOIN public.owners o
    ON o.id = a.owner_id
   AND o.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = a.assigned_user_id
  WHERE w.organization_id = v_org_id
    AND w.checked_in_at >= v_from
    AND w.checked_in_at < v_to
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND public.user_has_branch_access(w.branch_id)
  ORDER BY w.checked_in_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_waiting_room_report_entries(DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.list_waiting_room_report_entries(DATE, DATE, UUID) IS
  'Row-level waiting-room check-ins for detailed report CSV (requires reports:read + waiting_room:read).';
