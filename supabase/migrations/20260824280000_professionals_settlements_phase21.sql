-- Professionals & Settlements Phase 21
-- Return settlement to draft, restore omission notes, cash FK backfill + void fallback.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- 1. Return settlement from review → draft
-- ─────────────────────────────────────────────
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

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'notes', v_settlement.notes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 2. Soft cash-note backfill → professional_payment_id
-- ─────────────────────────────────────────────
UPDATE public.cash_movements m
SET
  professional_payment_id = p.id,
  updated_at = now()
FROM public.professional_payments p
WHERE m.organization_id = p.organization_id
  AND m.professional_payment_id IS NULL
  AND m.deleted_at IS NULL
  AND m.kind = 'egreso'
  AND p.deleted_at IS NULL
  AND m.notes IS NOT NULL
  AND m.notes ILIKE '%/liquidaciones/' || p.settlement_id::TEXT || '%'
  AND (
    m.notes ILIKE '%pago ' || left(p.id::TEXT, 8) || '%'
    OR abs(m.amount - p.amount) < 0.005
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.cash_movements other
    WHERE other.professional_payment_id = p.id
      AND other.deleted_at IS NULL
  );

-- ─────────────────────────────────────────────
-- 3. Void payment: soft-delete cash by FK, else by note trail
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
  v_cash_reversed BOOLEAN := false;
  v_cash_session_id UUID;
  v_cash_warning TEXT;
  v_session_status TEXT;
  v_movement_id UUID;
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

  -- Prefer hard FK link
  SELECT m.id, m.cash_session_id, s.status::TEXT
  INTO v_movement_id, v_cash_session_id, v_session_status
  FROM public.cash_movements m
  INNER JOIN public.cash_sessions s ON s.id = m.cash_session_id
  WHERE m.professional_payment_id = v_payment.id
    AND m.deleted_at IS NULL
  LIMIT 1;

  -- Fallback: soft note trail for pre–phase-20 egresos
  IF v_movement_id IS NULL THEN
    SELECT m.id, m.cash_session_id, s.status::TEXT
    INTO v_movement_id, v_cash_session_id, v_session_status
    FROM public.cash_movements m
    INNER JOIN public.cash_sessions s ON s.id = m.cash_session_id
    WHERE m.organization_id = v_org_id
      AND m.deleted_at IS NULL
      AND m.kind = 'egreso'
      AND m.professional_payment_id IS NULL
      AND m.notes IS NOT NULL
      AND m.notes ILIKE '%/liquidaciones/' || v_settlement.id::TEXT || '%'
      AND (
        m.notes ILIKE '%pago ' || left(v_payment.id::TEXT, 8) || '%'
        OR abs(m.amount - v_payment.amount) < 0.005
      )
    ORDER BY m.created_at DESC
    LIMIT 1;
  END IF;

  IF v_movement_id IS NOT NULL THEN
    UPDATE public.cash_movements
    SET
      deleted_at = now(),
      updated_at = now(),
      professional_payment_id = COALESCE(professional_payment_id, v_payment.id)
    WHERE id = v_movement_id
      AND deleted_at IS NULL;

    v_cash_reversed := true;

    IF v_session_status = 'cerrada' THEN
      v_cash_warning :=
        'La sesión de caja está cerrada; el egreso vinculado se marcó como eliminado';
    END IF;
  ELSE
    v_cash_reversed := false;
    v_cash_session_id := NULL;
    v_cash_warning := NULL;
  END IF;

  RETURN jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'settlement', jsonb_build_object(
      'id', v_settlement.id,
      'status', v_settlement.status,
      'total_paid', v_settlement.total_paid,
      'balance_due', v_settlement.balance_due,
      'paid_at', v_settlement.paid_at
    ),
    'cash_reversed', v_cash_reversed,
    'cash_session_id', v_cash_session_id,
    'cash_warning', v_cash_warning
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_professional_payment(UUID, TEXT) TO authenticated;
