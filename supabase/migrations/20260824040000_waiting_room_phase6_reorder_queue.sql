-- Waiting Room Phase 6: atomic queue reorder for drag-and-drop.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.reorder_waiting_room_queue(
  p_ordered_entry_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_branch_id UUID;
  v_id UUID;
  v_idx INT := 0;
  v_count INT;
  v_updated INT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:write') THEN
    RAISE EXCEPTION 'Sin permisos para reordenar sala de espera';
  END IF;

  IF p_ordered_entry_ids IS NULL OR cardinality(p_ordered_entry_ids) = 0 THEN
    RAISE EXCEPTION 'Lista de entradas requerida';
  END IF;

  v_count := cardinality(p_ordered_entry_ids);

  -- All IDs must be distinct
  IF (
    SELECT COUNT(DISTINCT x) FROM unnest(p_ordered_entry_ids) AS t(x)
  ) <> v_count THEN
    RAISE EXCEPTION 'La lista de entradas contiene duplicados';
  END IF;

  -- Lock and validate every entry belongs to the same accessible branch
  FOR v_id IN SELECT unnest(p_ordered_entry_ids)
  LOOP
    DECLARE
      v_entry public.waiting_room_entries%ROWTYPE;
    BEGIN
      SELECT * INTO v_entry
      FROM public.waiting_room_entries
      WHERE id = v_id
        AND organization_id = v_org_id
        AND deleted_at IS NULL
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Entrada de sala de espera no encontrada';
      END IF;

      IF v_entry.status = 'completed' THEN
        RAISE EXCEPTION 'No se puede reordenar una entrada completada';
      END IF;

      IF NOT public.user_has_branch_access(v_entry.branch_id) THEN
        RAISE EXCEPTION 'Sin acceso a la sucursal de la entrada';
      END IF;

      IF v_branch_id IS NULL THEN
        v_branch_id := v_entry.branch_id;
      ELSIF v_branch_id <> v_entry.branch_id THEN
        RAISE EXCEPTION 'Todas las entradas deben ser de la misma sucursal';
      END IF;
    END;
  END LOOP;

  FOREACH v_id IN ARRAY p_ordered_entry_ids
  LOOP
    v_idx := v_idx + 1;
    -- Normalize priority so visual order follows queue_position after DnD.
    UPDATE public.waiting_room_entries
    SET
      queue_position = v_idx,
      priority = 0
    WHERE id = v_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
      AND status <> 'completed';
    v_updated := v_updated + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'updated', v_updated,
    'ordered_ids', to_jsonb(p_ordered_entry_ids)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_waiting_room_queue(UUID[]) TO authenticated;
