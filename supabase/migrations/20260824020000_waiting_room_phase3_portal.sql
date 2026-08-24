-- Waiting Room Phase 3: portal tutor view (owner-scoped).
-- STAGING FIRST. Additive. Does not expose internal_notes or other owners' data.

CREATE OR REPLACE FUNCTION public.list_owner_portal_waiting_room(
  p_date DATE DEFAULT NULL
)
RETURNS TABLE (
  waiting_room_entry_id UUID,
  appointment_id UUID,
  patient_id UUID,
  patient_name TEXT,
  patient_species public.patient_species,
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
  ahead_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_day DATE;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  v_owner_id := public.get_portal_owner_id();
  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  v_day := COALESCE(p_date, (timezone('America/Argentina/Buenos_Aires', now()))::date);
  v_day_start := (v_day::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_day_end := ((v_day + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  RETURN QUERY
  SELECT
    w.id AS waiting_room_entry_id,
    a.id AS appointment_id,
    a.patient_id,
    p.name AS patient_name,
    p.species AS patient_species,
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
    CASE
      WHEN w.status = 'waiting' THEN (
        SELECT COUNT(*)::INTEGER
        FROM public.waiting_room_entries w2
        WHERE w2.organization_id = w.organization_id
          AND w2.branch_id = w.branch_id
          AND w2.deleted_at IS NULL
          AND w2.status = 'waiting'
          AND (
            w2.priority > w.priority
            OR (
              w2.priority = w.priority
              AND COALESCE(w2.queue_position, 2147483647) < COALESCE(w.queue_position, 2147483647)
            )
            OR (
              w2.priority = w.priority
              AND COALESCE(w2.queue_position, 2147483647) = COALESCE(w.queue_position, 2147483647)
              AND w2.checked_in_at < w.checked_in_at
            )
          )
      )
      ELSE 0
    END AS ahead_count
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
   AND a.owner_id = v_owner_id
  INNER JOIN public.patients p
    ON p.id = a.patient_id
   AND p.deleted_at IS NULL
   AND p.owner_id = v_owner_id
  WHERE w.deleted_at IS NULL
    AND w.checked_in_at >= v_day_start
    AND w.checked_in_at < v_day_end
  ORDER BY
    CASE w.status
      WHEN 'called' THEN 0
      WHEN 'waiting' THEN 1
      WHEN 'in_consultation' THEN 2
      WHEN 'payment_pending' THEN 3
      ELSE 4
    END,
    w.priority DESC,
    w.queue_position ASC NULLS LAST,
    w.checked_in_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_owner_portal_waiting_room(DATE) TO authenticated;

COMMENT ON FUNCTION public.list_owner_portal_waiting_room(DATE) IS
  'Portal tutor: waiting-room entries for the authenticated owner only (no internal_notes).';
