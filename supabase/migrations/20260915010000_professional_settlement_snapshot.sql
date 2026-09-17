-- Freeze settlement calculation snapshot on approve (staging MVP)

ALTER TABLE public.professional_settlements
  ADD COLUMN IF NOT EXISTS calculation_snapshot JSONB;

COMMENT ON COLUMN public.professional_settlements.calculation_snapshot IS
  'Immutable totals/items/adjustments snapshot captured when settlement is approved';

CREATE OR REPLACE FUNCTION public.approve_professional_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_item RECORD;
  v_prof_first TEXT;
  v_prof_last TEXT;
  v_prof_user_id UUID;
  v_snapshot JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:approve') THEN
    RAISE EXCEPTION 'Sin permisos para aprobar liquidaciones';
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

  IF v_settlement.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Solo se pueden aprobar liquidaciones en borrador o revisión';
  END IF;

  FOR v_item IN
    SELECT DISTINCT i.source_type, i.source_id
    FROM public.professional_settlement_items i
    WHERE i.settlement_id = v_settlement.id
      AND i.source_id IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO public.professional_settlement_source_claims (
        organization_id,
        source_type,
        source_id,
        settlement_id
      ) VALUES (
        v_org_id,
        v_item.source_type,
        v_item.source_id,
        v_settlement.id
      );
    EXCEPTION
      WHEN unique_violation THEN
        RAISE EXCEPTION 'La fuente %/% ya fue liquidada en otra liquidación',
          v_item.source_type, v_item.source_id;
    END;
  END LOOP;

  SELECT jsonb_build_object(
    'captured_at', now(),
    'period_start', v_settlement.period_start,
    'period_end', v_settlement.period_end,
    'gross_amount', v_settlement.gross_amount,
    'adjustments_amount', v_settlement.adjustments_amount,
    'deductions_amount', v_settlement.deductions_amount,
    'total_amount', v_settlement.total_amount,
    'currency', v_settlement.currency,
    'compensation_scheme_id', v_settlement.compensation_scheme_id,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'rule_id', i.rule_id,
          'source_type', i.source_type,
          'source_id', i.source_id,
          'description', i.description,
          'quantity', i.quantity,
          'unit_amount', i.unit_amount,
          'percentage', i.percentage,
          'base_amount', i.base_amount,
          'calculated_amount', i.calculated_amount
        )
        ORDER BY i.created_at
      )
      FROM public.professional_settlement_items i
      WHERE i.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'adjustments', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'adjustment_type', a.adjustment_type,
          'amount', a.amount,
          'reason', a.reason,
          'created_by', a.created_by,
          'created_at', a.created_at
        )
        ORDER BY a.created_at
      )
      FROM public.professional_settlement_adjustments a
      WHERE a.settlement_id = v_settlement.id
        AND a.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  INTO v_snapshot;

  UPDATE public.professional_settlements s
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
    calculation_snapshot = v_snapshot,
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  SELECT p.first_name, p.last_name, p.user_id
  INTO v_prof_first, v_prof_last, v_prof_user_id
  FROM public.professionals p
  WHERE p.id = v_settlement.professional_id;

  IF v_prof_user_id IS NOT NULL THEN
    PERFORM public.emit_notification(
      v_org_id,
      v_settlement.branch_id,
      'liquidacion'::public.notification_kind,
      'Liquidación aprobada',
      format(
        'Período %s — %s · %s %s',
        v_settlement.period_start,
        v_settlement.period_end,
        COALESCE(v_prof_last, ''),
        COALESCE(v_prof_first, '')
      ),
      '/liquidaciones/mis-liquidaciones/' || v_settlement.id::TEXT,
      'professional_settlement',
      v_settlement.id,
      24
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'approved_at', v_settlement.approved_at,
    'approved_by', v_settlement.approved_by,
    'total_amount', v_settlement.total_amount,
    'balance_due', v_settlement.balance_due,
    'has_snapshot', v_settlement.calculation_snapshot IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_professional_settlement(UUID) TO authenticated;
