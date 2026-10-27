-- Cuenta consultas / turnos pendientes del profesional logueado (hoy)

CREATE OR REPLACE FUNCTION public.count_my_pending_consultations(
  p_branch_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_count INTEGER := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();

  IF v_org_id IS NULL OR v_user_id IS NULL OR NOT (
    public.has_permission('clinical:read')
    OR public.has_permission('appointments:read')
  ) THEN
    RETURN 0;
  END IF;

  v_today_start := date_trunc(
    'day',
    timezone('America/Argentina/Buenos_Aires', now())
  ) AT TIME ZONE 'America/Argentina/Buenos_Aires';
  v_today_end := v_today_start + interval '1 day';

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM (
    SELECT a.id
    FROM public.appointments a
    LEFT JOIN public.consultations c
      ON c.appointment_id = a.id
      AND c.deleted_at IS NULL
      AND c.status <> 'cancelada'
    WHERE a.organization_id = v_org_id
      AND a.deleted_at IS NULL
      AND a.starts_at >= v_today_start
      AND a.starts_at < v_today_end
      AND a.status NOT IN ('cancelada', 'ausente', 'completada')
      AND COALESCE(c.status, 'en_espera') NOT IN ('completada', 'cancelada')
      AND COALESCE(c.veterinarian_id, a.assigned_user_id) = v_user_id
      AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)

    UNION ALL

    SELECT c.id
    FROM public.consultations c
    WHERE c.organization_id = v_org_id
      AND c.deleted_at IS NULL
      AND c.appointment_id IS NULL
      AND c.started_at >= v_today_start
      AND c.started_at < v_today_end
      AND c.status IN ('en_espera', 'en_curso')
      AND c.veterinarian_id = v_user_id
      AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
  ) pending;

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_my_pending_consultations TO authenticated;
