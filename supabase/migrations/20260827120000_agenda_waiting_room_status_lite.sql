-- Staging-safe: lightweight waiting-room status map for Agenda badges.
-- Reversible: DROP FUNCTION public.list_waiting_room_statuses_for_date(date, uuid);

CREATE OR REPLACE FUNCTION public.list_waiting_room_statuses_for_date(
  p_date DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  appointment_id UUID,
  waiting_room_status public.waiting_room_status
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

  v_day_start := (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_day_end := ((p_date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  RETURN QUERY
  SELECT
    a.id AS appointment_id,
    w.status AS waiting_room_status
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
   AND a.organization_id = v_org_id
  WHERE w.organization_id = v_org_id
    AND a.starts_at >= v_day_start
    AND a.starts_at < v_day_end
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id OR a.branch_id = p_branch_id)
  ORDER BY a.starts_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) TO service_role;

COMMENT ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) IS
  'Agenda hot path: appointment_id + waiting_room_status for a single local day.';
