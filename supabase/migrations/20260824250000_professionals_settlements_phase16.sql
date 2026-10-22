-- Professionals & Settlements Phase 16
-- - void_professional_payment (soft-delete)
-- - recalculate totals from active payments (+ status for paid paths)
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- Recalculate: derive total_paid from payments
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalculate_professional_settlement_totals(p_settlement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gross NUMERIC(14, 2) := 0;
  v_adjustments NUMERIC(14, 2) := 0;
  v_deductions NUMERIC(14, 2) := 0;
  v_total NUMERIC(14, 2) := 0;
  v_total_paid NUMERIC(14, 2) := 0;
  v_balance NUMERIC(14, 2) := 0;
BEGIN
  SELECT COALESCE(SUM(i.calculated_amount), 0)
  INTO v_gross
  FROM public.professional_settlement_items i
  WHERE i.settlement_id = p_settlement_id;

  SELECT
    COALESCE(SUM(CASE WHEN a.adjustment_type IN ('bonus', 'correction', 'other') THEN a.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN a.adjustment_type = 'deduction' THEN a.amount ELSE 0 END), 0)
  INTO v_adjustments, v_deductions
  FROM public.professional_settlement_adjustments a
  WHERE a.settlement_id = p_settlement_id;

  v_total := public.round_ars(v_gross + v_adjustments - v_deductions);

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_total_paid
  FROM public.professional_payments p
  WHERE p.settlement_id = p_settlement_id
    AND p.deleted_at IS NULL;

  v_total_paid := public.round_ars(v_total_paid);
  v_balance := public.round_ars(v_total - v_total_paid);

  UPDATE public.professional_settlements s
  SET
    gross_amount = v_gross,
    adjustments_amount = v_adjustments,
    deductions_amount = v_deductions,
    total_amount = v_total,
    total_paid = v_total_paid,
    balance_due = v_balance,
    status = CASE
      WHEN s.status IN ('approved', 'partially_paid', 'paid') THEN
        CASE
          WHEN v_total_paid <= 0 THEN 'approved'::public.settlement_status
          WHEN v_total_paid >= v_total THEN 'paid'::public.settlement_status
          ELSE 'partially_paid'::public.settlement_status
        END
      ELSE s.status
    END,
    paid_at = CASE
      WHEN s.status IN ('approved', 'partially_paid', 'paid')
        AND v_total_paid >= v_total
        AND v_total > 0
      THEN COALESCE(s.paid_at, now())
      WHEN s.status IN ('approved', 'partially_paid', 'paid')
        AND v_total_paid < v_total
      THEN NULL
      ELSE s.paid_at
    END,
    updated_at = now()
  WHERE s.id = p_settlement_id;
END;
$$;

-- ─────────────────────────────────────────────
-- Soft-void professional payment
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_professional_payment(
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_payment public.professional_payments%ROWTYPE;
  v_settlement public.professional_settlements%ROWTYPE;
  v_reason TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:pay') THEN
    RAISE EXCEPTION 'Sin permisos para anular pagos a profesionales';
  END IF;

  IF p_payment_id IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'payment_id y reason son requeridos';
  END IF;

  v_reason := btrim(p_reason);
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.professional_payments p
  WHERE p.id = p_payment_id
    AND p.organization_id = v_org_id
    AND p.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_payment.settlement_id
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

  IF v_settlement.status NOT IN ('approved', 'partially_paid', 'paid') THEN
    RAISE EXCEPTION 'Solo se pueden anular pagos de liquidaciones aprobadas o pagadas';
  END IF;

  UPDATE public.professional_payments
  SET
    deleted_at = now(),
    notes = CASE
      WHEN notes IS NULL OR btrim(notes) = '' THEN 'Anulado: ' || v_reason
      ELSE left('Anulado: ' || v_reason || ' · ' || notes, 500)
    END,
    updated_at = now()
  WHERE id = v_payment.id
  RETURNING * INTO v_payment;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement.id);

  SELECT * INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_settlement.id;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'settlement', jsonb_build_object(
      'id', v_settlement.id,
      'status', v_settlement.status,
      'total_paid', v_settlement.total_paid,
      'balance_due', v_settlement.balance_due,
      'paid_at', v_settlement.paid_at
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_professional_payment(UUID, TEXT) TO authenticated;
