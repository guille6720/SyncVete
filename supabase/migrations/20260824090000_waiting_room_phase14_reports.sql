-- Waiting Room Phase 14: historical waiting-room report RPC for /reportes.
-- STAGING FIRST. Additive. Does not change appointment_status.

CREATE OR REPLACE FUNCTION public.get_waiting_room_report(
  p_from DATE,
  p_to DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_check_ins BIGINT := 0;
  v_completed BIGINT := 0;
  v_removed BIGINT := 0;
  v_called BIGINT := 0;
  v_avg_to_call NUMERIC := NULL;
  v_avg_dwell NUMERIC := NULL;
  v_by_status JSONB := '[]'::jsonb;
  v_daily JSONB := '[]'::jsonb;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
     OR NOT public.has_permission('reports:read')
     OR NOT public.has_permission('waiting_room:read') THEN
    RETURN NULL;
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  IF (p_to - p_from) > 92 THEN
    RAISE EXCEPTION 'El rango no puede superar 92 días';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN NULL;
  END IF;

  v_from := (p_from::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_to := ((p_to + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE w.status = 'completed')::BIGINT,
    COUNT(*) FILTER (WHERE w.deleted_at IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE w.called_at IS NOT NULL)::BIGINT,
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (w.called_at - w.checked_in_at)) / 60.0
      ) FILTER (
        WHERE w.called_at IS NOT NULL
          AND w.called_at > w.checked_in_at
      )
    ),
    ROUND(
      AVG(
        EXTRACT(EPOCH FROM (w.completed_at - w.checked_in_at)) / 60.0
      ) FILTER (
        WHERE w.completed_at IS NOT NULL
          AND w.completed_at > w.checked_in_at
      )
    )
  INTO
    v_check_ins,
    v_completed,
    v_removed,
    v_called,
    v_avg_to_call,
    v_avg_dwell
  FROM public.waiting_room_entries w
  WHERE w.organization_id = v_org_id
    AND w.checked_in_at >= v_from
    AND w.checked_in_at < v_to
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND public.user_has_branch_access(w.branch_id);

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('status', s.status, 'count', s.cnt)
      ORDER BY s.cnt DESC, s.status
    ),
    '[]'::jsonb
  )
  INTO v_by_status
  FROM (
    SELECT w.status::text AS status, COUNT(*)::BIGINT AS cnt
    FROM public.waiting_room_entries w
    WHERE w.organization_id = v_org_id
      AND w.deleted_at IS NULL
      AND w.checked_in_at >= v_from
      AND w.checked_in_at < v_to
      AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
      AND public.user_has_branch_access(w.branch_id)
    GROUP BY w.status
  ) s;

  SELECT COALESCE(jsonb_agg(row_to_json(d) ORDER BY d.day), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      gs::date AS day,
      (
        SELECT COUNT(*)::BIGINT
        FROM public.waiting_room_entries w
        WHERE w.organization_id = v_org_id
          AND w.checked_in_at >= (gs::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
          AND w.checked_in_at < ((gs + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
          AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
          AND public.user_has_branch_access(w.branch_id)
      ) AS check_ins,
      (
        SELECT COUNT(*)::BIGINT
        FROM public.waiting_room_entries w
        WHERE w.organization_id = v_org_id
          AND w.deleted_at IS NULL
          AND w.status = 'completed'
          AND w.completed_at >= (gs::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
          AND w.completed_at < ((gs + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires')
          AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
          AND public.user_has_branch_access(w.branch_id)
      ) AS completed
    FROM generate_series(p_from, p_to, interval '1 day') AS gs
  ) d;

  RETURN jsonb_build_object(
    'check_ins', v_check_ins,
    'completed', v_completed,
    'removed', v_removed,
    'called', v_called,
    'avg_minutes_to_call', v_avg_to_call,
    'avg_minutes_to_complete', v_avg_dwell,
    'by_status', v_by_status,
    'daily', v_daily
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_waiting_room_report(DATE, DATE, UUID) TO authenticated;

COMMENT ON FUNCTION public.get_waiting_room_report(DATE, DATE, UUID) IS
  'Historical waiting-room metrics for clinic reports (requires reports:read + waiting_room:read).';
