-- Professionals & Settlements Phase 27
-- Return-to-draft notify: portal href when professional is linked.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.return_professional_settlement_to_draft(
  p_settlement_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_reason TEXT;
  v_notes TEXT;
  v_prof_label TEXT;
  v_prof_user_id UUID;
  v_href TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_settlements:approve') THEN
    RAISE EXCEPTION 'Sin permisos para devolver liquidaciones a borrador';
  END IF;

  IF p_settlement_id IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'settlement_id y reason son requeridos';
  END IF;

  v_reason := btrim(p_reason);
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar 500 caracteres';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Liquidación no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidación';
  END IF;

  IF v_settlement.status <> 'review' THEN
    RAISE EXCEPTION 'Solo se pueden devolver a borrador liquidaciones en revisión';
  END IF;

  v_notes := CASE
    WHEN v_settlement.notes IS NULL OR btrim(v_settlement.notes) = '' THEN
      'Devuelta a borrador: ' || v_reason
    ELSE
      left('Devuelta a borrador: ' || v_reason || ' · ' || v_settlement.notes, 2000)
  END;

  UPDATE public.professional_settlements s
  SET
    status = 'draft',
    notes = v_notes,
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  SELECT
    trim(COALESCE(p.last_name, '') || ', ' || COALESCE(p.first_name, '')),
    p.user_id
  INTO v_prof_label, v_prof_user_id
  FROM public.professionals p
  WHERE p.id = v_settlement.professional_id;

  -- Portal path when professional is linked (same pattern as approve notify).
  -- Org feed still surfaces the alert; dual-role staff use "Abrir vista operativa".
  v_href := CASE
    WHEN v_prof_user_id IS NOT NULL THEN
      '/liquidaciones/mis-liquidaciones/' || v_settlement.id::TEXT
    ELSE
      '/liquidaciones/' || v_settlement.id::TEXT
  END;

  PERFORM public.emit_notification(
    v_org_id,
    v_settlement.branch_id,
    'liquidacion'::public.notification_kind,
    'Liquidación devuelta a borrador',
    format(
      '%s · %s — %s · %s',
      COALESCE(v_prof_label, 'Profesional'),
      v_settlement.period_start,
      v_settlement.period_end,
      v_reason
    ),
    v_href,
    'professional_settlement',
    v_settlement.id,
    24
  );

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'notes', v_settlement.notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;
