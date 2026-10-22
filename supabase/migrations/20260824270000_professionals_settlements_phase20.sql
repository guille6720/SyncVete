-- Professionals & Settlements Phase 20
-- Cash FK for professional payments, settlement item omissions, activity_type filters,
-- liquidacion notification ACL via related_type.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- 1. Cash FK: cash_movements.professional_payment_id
-- ─────────────────────────────────────────────
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS professional_payment_id UUID
    REFERENCES public.professional_payments(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_movements_professional_payment
  ON public.cash_movements (professional_payment_id)
  WHERE deleted_at IS NULL AND professional_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_movements_professional_payment
  ON public.cash_movements (professional_payment_id)
  WHERE professional_payment_id IS NOT NULL;

-- ─────────────────────────────────────────────
-- 2. Extend add_cash_movement (optional professional payment)
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.add_cash_movement(
  UUID,
  TEXT,
  NUMERIC,
  public.payment_method,
  TEXT
);

CREATE OR REPLACE FUNCTION public.add_cash_movement(
  p_session_id UUID,
  p_kind TEXT,
  p_amount NUMERIC,
  p_method public.payment_method DEFAULT 'efectivo',
  p_notes TEXT DEFAULT NULL,
  p_professional_payment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_session public.cash_sessions%ROWTYPE;
  v_kind public.cash_movement_kind;
  v_method public.payment_method;
  v_movement_id UUID;
  v_payment public.professional_payments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('ingreso', 'egreso', 'retiro') THEN
    RAISE EXCEPTION 'Tipo de movimiento inválido';
  END IF;

  v_kind := p_kind::public.cash_movement_kind;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor a 0';
  END IF;

  SELECT * INTO v_session
  FROM public.cash_sessions
  WHERE id = p_session_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Caja no encontrada';
  END IF;

  IF v_session.status <> 'abierta' THEN
    RAISE EXCEPTION 'La caja está cerrada';
  END IF;

  IF p_professional_payment_id IS NOT NULL THEN
    SELECT *
    INTO v_payment
    FROM public.professional_payments pp
    WHERE pp.id = p_professional_payment_id
      AND pp.organization_id = v_org_id
      AND pp.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pago a profesional no encontrado';
    END IF;
  END IF;

  IF v_kind IN ('egreso', 'retiro') THEN
    v_method := 'efectivo';
  ELSE
    v_method := COALESCE(p_method, 'efectivo');
  END IF;

  INSERT INTO public.cash_movements (
    organization_id,
    cash_session_id,
    recorded_by,
    kind,
    method,
    amount,
    notes,
    professional_payment_id
  )
  VALUES (
    v_org_id,
    v_session.id,
    auth.uid(),
    v_kind,
    v_method,
    ROUND(p_amount, 2),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_professional_payment_id
  )
  RETURNING id INTO v_movement_id;

  RETURN jsonb_build_object(
    'cash_movement_id', v_movement_id,
    'cash_session_id', v_session.id,
    'professional_payment_id', p_professional_payment_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_cash_movement(
  UUID,
  TEXT,
  NUMERIC,
  public.payment_method,
  TEXT,
  UUID
) TO authenticated;

-- ─────────────────────────────────────────────
-- 3. Update list_cash_movements
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_cash_movements(UUID);

CREATE OR REPLACE FUNCTION public.list_cash_movements(
  p_session_id UUID
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  cash_session_id UUID,
  payment_id UUID,
  recorded_by UUID,
  kind public.cash_movement_kind,
  method public.payment_method,
  amount NUMERIC,
  notes TEXT,
  recorded_by_name TEXT,
  invoice_id UUID,
  invoice_number TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  professional_payment_id UUID,
  professional_settlement_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:read') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.organization_id,
    m.cash_session_id,
    m.payment_id,
    m.recorded_by,
    m.kind,
    m.method,
    m.amount,
    m.notes,
    pr.full_name AS recorded_by_name,
    pay.invoice_id,
    inv.number AS invoice_number,
    m.created_at,
    m.updated_at,
    m.deleted_at,
    m.professional_payment_id,
    pp.settlement_id AS professional_settlement_id
  FROM public.cash_movements m
  INNER JOIN public.cash_sessions s
    ON s.id = m.cash_session_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = m.recorded_by
  LEFT JOIN public.payments pay ON pay.id = m.payment_id AND pay.deleted_at IS NULL
  LEFT JOIN public.invoices inv ON inv.id = pay.invoice_id AND inv.deleted_at IS NULL
  LEFT JOIN public.professional_payments pp
    ON pp.id = m.professional_payment_id
    AND pp.deleted_at IS NULL
  WHERE m.cash_session_id = p_session_id
    AND m.organization_id = v_org_id
    AND m.deleted_at IS NULL
  ORDER BY m.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_cash_movements(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 4. Update void_professional_payment (reverse cash)
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
  v_cash_session_id UUID := NULL;
  v_cash_warning TEXT := NULL;
  v_session_status public.cash_session_status;
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

  -- Soft-delete linked cash movement (at most one via unique partial index)
  SELECT m.cash_session_id, s.status
  INTO v_cash_session_id, v_session_status
  FROM public.cash_movements m
  INNER JOIN public.cash_sessions s ON s.id = m.cash_session_id
  WHERE m.professional_payment_id = v_payment.id
    AND m.deleted_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.cash_movements
    SET deleted_at = now(),
        updated_at = now()
    WHERE professional_payment_id = v_payment.id
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

-- ─────────────────────────────────────────────
-- 5. Item omissions table
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_settlement_item_omissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  settlement_id UUID NOT NULL REFERENCES public.professional_settlements(id) ON DELETE CASCADE,
  source_type public.settlement_item_source_type NOT NULL,
  source_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (
    char_length(btrim(reason)) >= 3
    AND char_length(reason) <= 500
  ),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (settlement_id, source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_settlement_item_omissions_settlement
  ON public.professional_settlement_item_omissions (settlement_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_settlement_item_omissions_org
  ON public.professional_settlement_item_omissions (organization_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.professional_settlement_item_omissions IS
  'Persisted source omissions for professional settlements; reapplied on recalculate.';

ALTER TABLE public.professional_settlement_item_omissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_settlement_item_omissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_settlement_item_omissions_select_tenant
  ON public.professional_settlement_item_omissions;
CREATE POLICY professional_settlement_item_omissions_select_tenant
  ON public.professional_settlement_item_omissions
  FOR SELECT USING (
    organization_id = public.get_user_organization_id()
    AND deleted_at IS NULL
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_item_omissions.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

DROP POLICY IF EXISTS professional_settlement_item_omissions_insert_tenant
  ON public.professional_settlement_item_omissions;
CREATE POLICY professional_settlement_item_omissions_insert_tenant
  ON public.professional_settlement_item_omissions
  FOR INSERT WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_item_omissions.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

DROP POLICY IF EXISTS professional_settlement_item_omissions_update_tenant
  ON public.professional_settlement_item_omissions;
CREATE POLICY professional_settlement_item_omissions_update_tenant
  ON public.professional_settlement_item_omissions
  FOR UPDATE
  USING (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_item_omissions.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  )
  WITH CHECK (
    organization_id = public.get_user_organization_id()
    AND public.has_permission('professional_compensation:write')
    AND public.has_permission('professional_settlements:read')
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlements s
      WHERE s.id = professional_settlement_item_omissions.settlement_id
        AND s.deleted_at IS NULL
        AND (
          s.branch_id IS NULL
          OR public.user_has_branch_access(s.branch_id)
        )
    )
  );

DROP TRIGGER IF EXISTS trg_audit_professional_settlement_item_omissions
  ON public.professional_settlement_item_omissions;

CREATE TRIGGER trg_audit_professional_settlement_item_omissions
  AFTER INSERT OR UPDATE OR DELETE ON public.professional_settlement_item_omissions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ─────────────────────────────────────────────
-- 6. apply_professional_settlement_omissions
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_professional_settlement_omissions(p_settlement_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_settlement_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.professional_settlement_items i
  WHERE i.settlement_id = p_settlement_id
    AND i.source_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.professional_settlement_item_omissions o
      WHERE o.settlement_id = p_settlement_id
        AND o.source_type = i.source_type
        AND o.source_id = i.source_id
        AND o.deleted_at IS NULL
    );

  PERFORM public.recalculate_professional_settlement_totals(p_settlement_id);
END;
$$;

-- ─────────────────────────────────────────────
-- 7. Apply omissions after calculate (app also calls this;
--    SQL wrapper avoided to keep calculate body intact)
-- Omissions are applied by:
--   - omit_professional_settlement_item (immediate)
--   - apply_professional_settlement_omissions after calculate from the web app
-- ─────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- 8. omit_professional_settlement_item
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.omit_professional_settlement_item(
  p_item_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_item public.professional_settlement_items%ROWTYPE;
  v_settlement public.professional_settlements%ROWTYPE;
  v_omission public.professional_settlement_item_omissions%ROWTYPE;
  v_reason TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para omitir ítems de liquidación';
  END IF;

  IF p_item_id IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'item_id y reason son requeridos';
  END IF;

  v_reason := btrim(p_reason);
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
  END IF;
  IF char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede superar 500 caracteres';
  END IF;

  SELECT *
  INTO v_item
  FROM public.professional_settlement_items i
  WHERE i.id = p_item_id
    AND i.organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ítem no encontrado';
  END IF;

  IF v_item.source_id IS NULL THEN
    RAISE EXCEPTION 'Solo se pueden omitir ítems con origen identificable';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_item.settlement_id
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
    RAISE EXCEPTION 'Solo se pueden omitir ítems de liquidaciones en borrador o revisión';
  END IF;

  INSERT INTO public.professional_settlement_item_omissions (
    organization_id,
    settlement_id,
    source_type,
    source_id,
    reason,
    created_by,
    deleted_at
  ) VALUES (
    v_org_id,
    v_settlement.id,
    v_item.source_type,
    v_item.source_id,
    v_reason,
    auth.uid(),
    NULL
  )
  ON CONFLICT (settlement_id, source_type, source_id) DO UPDATE
  SET
    reason = EXCLUDED.reason,
    created_by = EXCLUDED.created_by,
    deleted_at = NULL,
    created_at = CASE
      WHEN professional_settlement_item_omissions.deleted_at IS NOT NULL THEN now()
      ELSE professional_settlement_item_omissions.created_at
    END
  RETURNING * INTO v_omission;

  DELETE FROM public.professional_settlement_items
  WHERE id = v_item.id;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement.id);

  SELECT * INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_settlement.id;

  RETURN jsonb_build_object(
    'omission', to_jsonb(v_omission),
    'settlement', jsonb_build_object(
      'id', v_settlement.id,
      'gross_amount', v_settlement.gross_amount,
      'adjustments_amount', v_settlement.adjustments_amount,
      'deductions_amount', v_settlement.deductions_amount,
      'total_amount', v_settlement.total_amount,
      'balance_due', v_settlement.balance_due
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.omit_professional_settlement_item(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 9. restore_professional_settlement_omission
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_professional_settlement_omission(
  p_omission_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_omission public.professional_settlement_item_omissions%ROWTYPE;
  v_settlement public.professional_settlements%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para restaurar omisiones de liquidación';
  END IF;

  IF p_omission_id IS NULL THEN
    RAISE EXCEPTION 'omission_id es requerido';
  END IF;

  SELECT *
  INTO v_omission
  FROM public.professional_settlement_item_omissions o
  WHERE o.id = p_omission_id
    AND o.organization_id = v_org_id
    AND o.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Omisión no encontrada';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_omission.settlement_id
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
    RAISE EXCEPTION 'Solo se pueden restaurar omisiones de liquidaciones en borrador o revisión';
  END IF;

  UPDATE public.professional_settlement_item_omissions
  SET deleted_at = now()
  WHERE id = v_omission.id
  RETURNING * INTO v_omission;

  -- Does not recalculate items; caller must recalculate the settlement.
  RETURN jsonb_build_object(
    'omission_id', v_omission.id,
    'settlement_id', v_omission.settlement_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_professional_settlement_omission(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- 10. get_professional_settlement (+ omissions)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_professional_settlement(p_settlement_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = p_settlement_id
    AND s.organization_id = v_org_id
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.user_can_read_professional_settlement(v_settlement.professional_id) THEN
    RETURN NULL;
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND public.has_permission('professional_settlements:read')
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'settlement', to_jsonb(v_settlement),
    'items', COALESCE((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
      FROM public.professional_settlement_items i
      WHERE i.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'adjustments', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
      FROM public.professional_settlement_adjustments a
      WHERE a.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_agg(
        to_jsonb(p) || jsonb_build_object(
          'cash_session_id', cm.cash_session_id,
          'cash_movement_id', cm.id
        )
        ORDER BY p.paid_at, p.created_at
      )
      FROM public.professional_payments p
      LEFT JOIN LATERAL (
        SELECT m.id, m.cash_session_id
        FROM public.cash_movements m
        WHERE m.professional_payment_id = p.id
          AND m.deleted_at IS NULL
        LIMIT 1
      ) cm ON true
      WHERE p.settlement_id = v_settlement.id
    ), '[]'::jsonb),
    'omissions', COALESCE((
      SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at)
      FROM public.professional_settlement_item_omissions o
      WHERE o.settlement_id = v_settlement.id
        AND o.deleted_at IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- 11. activity_type-aware rule helpers
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_professional_procedure_shift_rules(
  p_settlement_id UUID,
  p_scheme_id UUID,
  p_prof public.professionals,
  p_overlap_start DATE,
  p_overlap_end DATE,
  p_branch_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.professional_compensation_rules%ROWTYPE;
  v_row RECORD;
  v_activity TEXT;
BEGIN
  IF p_prof.user_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_rule IN
    SELECT r.*
    FROM public.professional_compensation_rules r
    WHERE r.compensation_scheme_id = p_scheme_id
      AND r.organization_id = p_org_id
      AND r.deleted_at IS NULL
      AND r.is_active = true
      AND r.frequency IN ('per_procedure', 'per_shift')
  LOOP
    v_activity := NULLIF(btrim(COALESCE(v_rule.activity_type, '')), '');

    IF v_rule.frequency = 'per_procedure' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT ci.id, ci.title, ci.kind
        FROM public.clinical_images ci
        WHERE ci.organization_id = p_org_id
          AND ci.deleted_at IS NULL
          AND ci.uploaded_by = p_prof.user_id
          AND ci.taken_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (
            CASE
              WHEN v_activity IS NOT NULL THEN ci.kind::TEXT = v_activity
              ELSE ci.kind IN ('radiografia', 'ecografia', 'laboratorio')
            END
          )
          AND (p_branch_id IS NULL OR ci.branch_id = p_branch_id OR ci.branch_id IS NULL)
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'procedure'
              AND cl.source_id = ci.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'procedure',
          v_row.id,
          format(
            'Procedimiento de imagen (%s)',
            COALESCE(v_row.title, v_row.kind::TEXT)
          ),
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'per_shift' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT DISTINCT ON (n.recorded_at::DATE)
          n.id,
          n.recorded_at::DATE AS shift_date
        FROM public.hospitalization_notes n
        WHERE n.organization_id = p_org_id
          AND n.deleted_at IS NULL
          AND n.recorded_by = p_prof.user_id
          AND n.recorded_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (
            v_activity IS NULL
            OR n.note_type::TEXT = v_activity
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'shift'
              AND cl.source_id = n.id
          )
        ORDER BY n.recorded_at::DATE, n.recorded_at ASC
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'shift',
          v_row.id,
          format('Guardia / internación (%s)', v_row.shift_date),
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_professional_procedure_shift_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_professional_lab_pharmacy_vaccination_rules(
  p_settlement_id UUID,
  p_scheme_id UUID,
  p_prof public.professionals,
  p_overlap_start DATE,
  p_overlap_end DATE,
  p_branch_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.professional_compensation_rules%ROWTYPE;
  v_row RECORD;
  v_activity TEXT;
BEGIN
  IF p_prof.user_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_rule IN
    SELECT r.*
    FROM public.professional_compensation_rules r
    WHERE r.compensation_scheme_id = p_scheme_id
      AND r.organization_id = p_org_id
      AND r.deleted_at IS NULL
      AND r.is_active = true
      AND r.frequency IN ('per_lab_order', 'per_prescription', 'per_vaccination')
  LOOP
    v_activity := NULLIF(btrim(COALESCE(v_rule.activity_type, '')), '');

    IF v_rule.frequency = 'per_lab_order' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT lo.id, lo.title, COALESCE(lo.completed_at, lo.ordered_at)::DATE AS activity_date
        FROM public.lab_orders lo
        WHERE lo.organization_id = p_org_id
          AND lo.deleted_at IS NULL
          AND lo.status = 'completada'
          AND COALESCE(lo.completed_by, lo.ordered_by) = p_prof.user_id
          AND COALESCE(lo.completed_at, lo.ordered_at)::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (p_branch_id IS NULL OR lo.branch_id = p_branch_id)
          AND (
            v_activity IS NULL
            OR COALESCE(lo.sample_type::TEXT, '') ILIKE '%' || v_activity || '%'
            OR COALESCE(lo.title, '') ILIKE '%' || v_activity || '%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'lab_order'
              AND cl.source_id = lo.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'lab_order',
          v_row.id,
          format('Orden de laboratorio (%s)', COALESCE(v_row.title, v_row.activity_date::TEXT)),
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'per_prescription' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT rx.id, rx.number, rx.dispensed_at::DATE AS activity_date
        FROM public.prescriptions rx
        WHERE rx.organization_id = p_org_id
          AND rx.deleted_at IS NULL
          AND rx.status = 'dispensada'
          AND rx.dispensed_by = p_prof.user_id
          AND rx.dispensed_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (p_branch_id IS NULL OR rx.branch_id = p_branch_id)
          AND (
            v_activity IS NULL
            OR COALESCE(rx.notes, '') ILIKE '%' || v_activity || '%'
            OR EXISTS (
              SELECT 1
              FROM public.prescription_items pi
              WHERE pi.prescription_id = rx.id
                AND pi.deleted_at IS NULL
                AND pi.medication_name ILIKE '%' || v_activity || '%'
            )
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'prescription'
              AND cl.source_id = rx.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'prescription',
          v_row.id,
          format(
            'Receta dispensada%s',
            CASE WHEN v_row.number IS NOT NULL THEN ' (' || v_row.number || ')' ELSE '' END
          ),
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'per_vaccination' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT v.id, v.vaccine_name, v.administered_at
        FROM public.vaccinations v
        WHERE v.organization_id = p_org_id
          AND v.deleted_at IS NULL
          AND v.veterinarian_id = p_prof.user_id
          AND v.administered_at BETWEEN p_overlap_start AND p_overlap_end
          AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
          AND (
            v_activity IS NULL
            OR COALESCE(v.vaccine_name, '') ILIKE '%' || v_activity || '%'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'vaccination'
              AND cl.source_id = v.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'vaccination',
          v_row.id,
          format('Vacunación (%s)', COALESCE(v_row.vaccine_name, v_row.administered_at::TEXT)),
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_professional_lab_pharmacy_vaccination_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_professional_appointment_hourly_rules(
  p_settlement_id UUID,
  p_scheme_id UUID,
  p_prof public.professionals,
  p_overlap_start DATE,
  p_overlap_end DATE,
  p_branch_id UUID,
  p_org_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.professional_compensation_rules%ROWTYPE;
  v_appt RECORD;
  v_hours NUMERIC;
  v_line_amount NUMERIC(14, 2);
  v_activity TEXT;
BEGIN
  IF p_prof.user_id IS NULL THEN
    RETURN;
  END IF;

  FOR v_rule IN
    SELECT r.*
    FROM public.professional_compensation_rules r
    WHERE r.compensation_scheme_id = p_scheme_id
      AND r.organization_id = p_org_id
      AND r.deleted_at IS NULL
      AND r.is_active = true
      AND r.frequency IN ('per_appointment', 'hourly')
  LOOP
    v_activity := NULLIF(btrim(COALESCE(v_rule.activity_type, '')), '');

    IF v_rule.frequency = 'per_appointment' AND v_rule.amount IS NOT NULL THEN
      FOR v_appt IN
        SELECT a.id
        FROM public.appointments a
        WHERE a.organization_id = p_org_id
          AND a.deleted_at IS NULL
          AND a.status = 'completada'
          AND a.assigned_user_id = p_prof.user_id
          AND a.starts_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
          AND (
            v_activity IS NULL
            OR COALESCE(a.appointment_type::TEXT, '') = v_activity
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'appointment'
              AND cl.source_id = a.id
          )
      LOOP
        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          source_id,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          p_settlement_id,
          p_org_id,
          v_rule.id,
          'appointment',
          v_appt.id,
          'Turno completado',
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'hourly' AND v_rule.amount IS NOT NULL THEN
      FOR v_appt IN
        SELECT
          a.id,
          GREATEST(
            EXTRACT(EPOCH FROM (a.ends_at - a.starts_at)) / 3600.0,
            0
          ) AS hours
        FROM public.appointments a
        WHERE a.organization_id = p_org_id
          AND a.deleted_at IS NULL
          AND a.status = 'completada'
          AND a.assigned_user_id = p_prof.user_id
          AND a.starts_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
          AND a.ends_at > a.starts_at
          AND (
            v_activity IS NULL
            OR COALESCE(a.appointment_type::TEXT, '') = v_activity
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = p_org_id
              AND cl.source_type = 'appointment'
              AND cl.source_id = a.id
          )
      LOOP
        v_hours := ROUND(v_appt.hours::NUMERIC, 2);
        IF v_hours <= 0 THEN
          CONTINUE;
        END IF;

        v_line_amount := public.round_ars(v_rule.amount * v_hours);

        IF v_line_amount > 0 THEN
          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            source_id,
            description,
            quantity,
            unit_amount,
            calculated_amount
          ) VALUES (
            p_settlement_id,
            p_org_id,
            v_rule.id,
            'appointment',
            v_appt.id,
            format('Horas de turno (%.2f h)', v_hours),
            v_hours,
            v_rule.amount,
            v_line_amount
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.apply_professional_procedure_shift_rules(
    p_settlement_id,
    p_scheme_id,
    p_prof,
    p_overlap_start,
    p_overlap_end,
    p_branch_id,
    p_org_id
  );

  PERFORM public.apply_professional_lab_pharmacy_vaccination_rules(
    p_settlement_id,
    p_scheme_id,
    p_prof,
    p_overlap_start,
    p_overlap_end,
    p_branch_id,
    p_org_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_professional_appointment_hourly_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;

-- ─────────────────────────────────────────────
-- 12. Notify redesign (related_type ACL)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_notifications(
  p_search TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_unread_only BOOLEAN DEFAULT false,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  kind public.notification_kind,
  title TEXT,
  body TEXT,
  href TEXT,
  related_type TEXT,
  related_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL OR v_user_id IS NULL OR NOT public.is_clinic_staff() THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      n.*,
      r.read_at AS user_read_at
    FROM public.notifications n
    LEFT JOIN public.notification_reads r
      ON r.notification_id = n.id AND r.user_id = v_user_id
    WHERE n.organization_id = v_org_id
      AND n.deleted_at IS NULL
      AND (p_kind IS NULL OR btrim(p_kind) = '' OR n.kind::TEXT = p_kind)
      AND (NOT COALESCE(p_unread_only, false) OR r.read_at IS NULL)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR n.title ILIKE '%' || p_search || '%'
        OR n.body ILIKE '%' || p_search || '%'
      )
      AND (
        n.kind IS DISTINCT FROM 'liquidacion'::public.notification_kind
        OR (
          -- Staff audience (related_type path)
          n.related_type = 'professional_settlement'
          AND public.has_permission('professional_settlements:approve')
          AND COALESCE(n.href, '') NOT LIKE '/liquidaciones/mis-liquidaciones/%'
          AND EXISTS (
            SELECT 1
            FROM public.professional_settlements s
            WHERE s.id = n.related_id
              AND s.organization_id = v_org_id
              AND s.deleted_at IS NULL
          )
        )
        OR (
          -- Portal audience (related_type path)
          n.related_type = 'professional_settlement'
          AND COALESCE(n.href, '') LIKE '/liquidaciones/mis-liquidaciones/%'
          AND EXISTS (
            SELECT 1
            FROM public.professionals p
            INNER JOIN public.professional_settlements s
              ON s.id = n.related_id
              AND s.professional_id = p.id
              AND s.organization_id = v_org_id
              AND s.deleted_at IS NULL
            WHERE p.organization_id = v_org_id
              AND p.user_id = v_user_id
              AND p.deleted_at IS NULL
              AND COALESCE(p.is_active, true)
          )
        )
        OR (
          -- Backward compat: href-only when related_type is null
          n.related_type IS NULL
          AND (
            (
              COALESCE(n.href, '') LIKE '/liquidaciones/mis-liquidaciones/%'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.organization_id = v_org_id
                  AND p.user_id = v_user_id
                  AND p.deleted_at IS NULL
                  AND COALESCE(p.is_active, true)
              )
            )
            OR (
              COALESCE(n.href, '') LIKE '/liquidaciones/%'
              AND COALESCE(n.href, '') NOT LIKE '/liquidaciones/mis-liquidaciones/%'
              AND public.has_permission('professional_settlements:approve')
            )
          )
        )
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.kind,
    f.title,
    f.body,
    f.href,
    f.related_type,
    f.related_id,
    f.user_read_at,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.count_unread_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL OR v_user_id IS NULL OR NOT public.is_clinic_staff() THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT COUNT(*)::int
    FROM public.notifications n
    LEFT JOIN public.notification_reads r
      ON r.notification_id = n.id AND r.user_id = v_user_id
    WHERE n.organization_id = v_org_id
      AND n.deleted_at IS NULL
      AND r.read_at IS NULL
      AND n.created_at >= now() - interval '90 days'
      AND (
        n.kind IS DISTINCT FROM 'liquidacion'::public.notification_kind
        OR (
          n.related_type = 'professional_settlement'
          AND public.has_permission('professional_settlements:approve')
          AND COALESCE(n.href, '') NOT LIKE '/liquidaciones/mis-liquidaciones/%'
          AND EXISTS (
            SELECT 1
            FROM public.professional_settlements s
            WHERE s.id = n.related_id
              AND s.organization_id = v_org_id
              AND s.deleted_at IS NULL
          )
        )
        OR (
          n.related_type = 'professional_settlement'
          AND COALESCE(n.href, '') LIKE '/liquidaciones/mis-liquidaciones/%'
          AND EXISTS (
            SELECT 1
            FROM public.professionals p
            INNER JOIN public.professional_settlements s
              ON s.id = n.related_id
              AND s.professional_id = p.id
              AND s.organization_id = v_org_id
              AND s.deleted_at IS NULL
            WHERE p.organization_id = v_org_id
              AND p.user_id = v_user_id
              AND p.deleted_at IS NULL
              AND COALESCE(p.is_active, true)
          )
        )
        OR (
          n.related_type IS NULL
          AND (
            (
              COALESCE(n.href, '') LIKE '/liquidaciones/mis-liquidaciones/%'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.organization_id = v_org_id
                  AND p.user_id = v_user_id
                  AND p.deleted_at IS NULL
                  AND COALESCE(p.is_active, true)
              )
            )
            OR (
              COALESCE(n.href, '') LIKE '/liquidaciones/%'
              AND COALESCE(n.href, '') NOT LIKE '/liquidaciones/mis-liquidaciones/%'
              AND public.has_permission('professional_settlements:approve')
            )
          )
        )
      )
  );
END;
$$;
