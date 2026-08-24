-- Professionals & Settlements Phase 4: submit draft for review workflow.
-- STAGING FIRST. Additive.

CREATE OR REPLACE FUNCTION public.submit_professional_settlement_for_review(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_compensation:write') THEN
    RAISE EXCEPTION 'Sin permisos para enviar liquidaciones a revisión';
  END IF;

  IF NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para liquidaciones';
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

  IF v_settlement.status <> 'draft' THEN
    RAISE EXCEPTION 'Solo se pueden enviar a revisión liquidaciones en borrador';
  END IF;

  UPDATE public.professional_settlements s
  SET
    status = 'review',
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'total_amount', v_settlement.total_amount,
    'balance_due', v_settlement.balance_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_professional_settlement_for_review(UUID) TO authenticated;
