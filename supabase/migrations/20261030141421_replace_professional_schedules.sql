-- The professional form submits the entire desired week, not incremental windows.
-- Archive and replace that week in one transaction; appointments are not changed.
CREATE OR REPLACE FUNCTION public.replace_professional_schedules(
  p_user_id UUID,
  p_branch_ids UUID[],
  p_schedules JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_branches UUID[];
  v_branch UUID;
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para gestionar agendas' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_branch_ids IS NULL OR cardinality(p_branch_ids) = 0
    OR array_position(p_branch_ids, NULL) IS NOT NULL OR cardinality(p_branch_ids) > 100 THEN
    RAISE EXCEPTION 'Seleccioná un profesional y sus sucursales' USING ERRCODE = '22023';
  END IF;
  IF p_schedules IS NULL OR jsonb_typeof(p_schedules) <> 'array' THEN
    RAISE EXCEPTION 'Formato de horarios inválido' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_schedules) > 100 THEN
    RAISE EXCEPTION 'Demasiados horarios' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_schedules) AS r(
      weekday SMALLINT, start_time TIME, end_time TIME, slot_duration_minutes INTEGER
    ) WHERE r.weekday IS NULL OR r.weekday NOT BETWEEN 1 AND 7
      OR r.start_time IS NULL OR r.end_time IS NULL OR r.end_time <= r.start_time
      OR COALESCE(r.slot_duration_minutes, 30) NOT BETWEEN 5 AND 480
  ) THEN
    RAISE EXCEPTION 'Día, horario o duración inválidos' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_schedules) WITH ORDINALITY AS a(value, n)
    JOIN jsonb_array_elements(p_schedules) WITH ORDINALITY AS b(value, n) ON a.n < b.n
    WHERE (a.value->>'weekday')::SMALLINT = (b.value->>'weekday')::SMALLINT
      AND (a.value->>'start_time')::TIME < (b.value->>'end_time')::TIME
      AND (a.value->>'end_time')::TIME > (b.value->>'start_time')::TIME
  ) THEN
    RAISE EXCEPTION 'Los horarios del mismo día no deben superponerse' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(DISTINCT b ORDER BY b) INTO v_branches FROM unnest(p_branch_ids) AS b;
  -- Lock in stable order, so concurrent saves for the same user/branch serialize.
  FOREACH v_branch IN ARRAY v_branches LOOP
    IF NOT public.user_has_branch_access(v_branch) OR NOT EXISTS (
      SELECT 1 FROM public.branches b WHERE b.id = v_branch AND b.organization_id = v_org
        AND b.is_active AND b.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Sin acceso a la sucursal' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.branch_members bm
    JOIN public.profiles pr ON pr.id = bm.user_id AND pr.organization_id = v_org
    WHERE bm.organization_id = v_org AND bm.branch_id = v_branch AND bm.user_id = p_user_id
      AND bm.is_active AND bm.deleted_at IS NULL AND pr.is_active AND pr.deleted_at IS NULL
    FOR UPDATE OF bm;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Profesional no disponible en esa sucursal' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  UPDATE public.professional_schedules
  SET is_active = false, deleted_at = now()
  WHERE organization_id = v_org AND user_id = p_user_id
    AND branch_id = ANY(v_branches) AND deleted_at IS NULL;

  INSERT INTO public.professional_schedules(
    organization_id, branch_id, user_id, weekday, start_time, end_time,
    slot_duration_minutes, allowed_appointment_types, is_active
  )
  SELECT v_org, b, p_user_id, r.weekday, r.start_time, r.end_time,
    COALESCE(r.slot_duration_minutes, 30), NULL, true
  FROM unnest(v_branches) AS b
  CROSS JOIN jsonb_to_recordset(p_schedules) AS r(
    weekday SMALLINT, start_time TIME, end_time TIME, slot_duration_minutes INTEGER
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_professional_schedules(UUID, UUID[], JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_professional_schedules(UUID, UUID[], JSONB) TO authenticated;
