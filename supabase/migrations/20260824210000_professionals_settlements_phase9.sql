-- Professionals & Settlements Phase 9: shift traceability hooks + in-app notifications.
-- STAGING FIRST. Additive.

ALTER TYPE public.notification_kind ADD VALUE IF NOT EXISTS 'liquidacion';

CREATE OR REPLACE FUNCTION public.submit_professional_settlement_for_review(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_prof_label TEXT;
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

  SELECT trim(COALESCE(p.last_name, '') || ', ' || COALESCE(p.first_name, ''))
  INTO v_prof_label
  FROM public.professionals p
  WHERE p.id = v_settlement.professional_id;

  PERFORM public.emit_notification(
    v_org_id,
    v_settlement.branch_id,
    'liquidacion'::public.notification_kind,
    'Liquidación pendiente de aprobación',
    format(
      '%s · %s — %s',
      COALESCE(v_prof_label, 'Profesional'),
      v_settlement.period_start,
      v_settlement.period_end
    ),
    '/liquidaciones/' || v_settlement.id::TEXT,
    'professional_settlement',
    v_settlement.id,
    24
  );

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'status', v_settlement.status,
    'total_amount', v_settlement.total_amount,
    'balance_due', v_settlement.balance_due
  );
END;
$$;

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

  UPDATE public.professional_settlements s
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = auth.uid(),
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
    'balance_due', v_settlement.balance_due
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.register_professional_payment(
  p_settlement_id UUID,
  p_amount NUMERIC,
  p_method public.payment_method DEFAULT 'efectivo',
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_invoice_date DATE DEFAULT NULL,
  p_invoice_amount NUMERIC DEFAULT NULL,
  p_invoice_attachment_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_payment public.professional_payments%ROWTYPE;
  v_amount NUMERIC(14, 2);
  v_total_paid NUMERIC(14, 2);
  v_new_status public.settlement_status;
  v_prof_user_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:pay') THEN
    RAISE EXCEPTION 'Sin permisos para registrar pagos a profesionales';
  END IF;

  IF p_settlement_id IS NULL OR p_amount IS NULL THEN
    RAISE EXCEPTION 'settlement_id y amount son requeridos';
  END IF;

  v_amount := public.round_ars(p_amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
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

  IF v_settlement.status NOT IN ('approved', 'partially_paid') THEN
    RAISE EXCEPTION 'Solo se pueden registrar pagos sobre liquidaciones aprobadas';
  END IF;

  IF v_settlement.balance_due <= 0 THEN
    RAISE EXCEPTION 'La liquidación ya está totalmente pagada';
  END IF;

  IF v_amount > v_settlement.balance_due THEN
    RAISE EXCEPTION 'El pago excede el saldo pendiente (%)', v_settlement.balance_due;
  END IF;

  INSERT INTO public.professional_payments (
    organization_id,
    professional_id,
    settlement_id,
    amount,
    currency,
    method,
    paid_at,
    reference,
    notes,
    invoice_number,
    invoice_date,
    invoice_amount,
    invoice_attachment_url,
    created_by
  ) VALUES (
    v_org_id,
    v_settlement.professional_id,
    v_settlement.id,
    v_amount,
    v_settlement.currency,
    COALESCE(p_method, 'efectivo'::public.payment_method),
    COALESCE(p_paid_at, now()),
    NULLIF(btrim(p_reference), ''),
    NULLIF(btrim(p_notes), ''),
    NULLIF(btrim(p_invoice_number), ''),
    p_invoice_date,
    CASE WHEN p_invoice_amount IS NULL THEN NULL ELSE public.round_ars(p_invoice_amount) END,
    NULLIF(btrim(p_invoice_attachment_url), ''),
    auth.uid()
  )
  RETURNING * INTO v_payment;

  v_total_paid := public.round_ars(v_settlement.total_paid + v_amount);
  v_new_status := CASE
    WHEN v_total_paid >= v_settlement.total_amount THEN 'paid'::public.settlement_status
    ELSE 'partially_paid'::public.settlement_status
  END;

  UPDATE public.professional_settlements s
  SET
    total_paid = v_total_paid,
    balance_due = public.round_ars(s.total_amount - v_total_paid),
    status = v_new_status,
    paid_at = CASE WHEN v_new_status = 'paid' THEN COALESCE(s.paid_at, now()) ELSE s.paid_at END,
    updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  SELECT p.user_id
  INTO v_prof_user_id
  FROM public.professionals p
  WHERE p.id = v_settlement.professional_id;

  IF v_prof_user_id IS NOT NULL THEN
    PERFORM public.emit_notification(
      v_org_id,
      v_settlement.branch_id,
      'liquidacion'::public.notification_kind,
      CASE
        WHEN v_new_status = 'paid' THEN 'Liquidación pagada'
        ELSE 'Pago registrado en liquidación'
      END,
      format(
        'Pago de %s · saldo pendiente %s',
        v_amount,
        v_settlement.balance_due
      ),
      '/liquidaciones/mis-liquidaciones/' || v_settlement.id::TEXT,
      'professional_settlement',
      v_settlement.id,
      12
    );
  END IF;

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

GRANT EXECUTE ON FUNCTION public.submit_professional_settlement_for_review(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_professional_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_professional_payment(
  UUID,
  NUMERIC,
  public.payment_method,
  TIMESTAMPTZ,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  NUMERIC,
  TEXT
) TO authenticated;
