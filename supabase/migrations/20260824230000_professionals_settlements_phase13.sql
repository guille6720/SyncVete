-- Professionals & Settlements Phase 13:
-- lab/pharmacy/vaccination sources, delete adjustment, portal period filters, settlement notes.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- Enum extensions
-- ─────────────────────────────────────────────
ALTER TYPE public.settlement_item_source_type ADD VALUE IF NOT EXISTS 'lab_order';
ALTER TYPE public.settlement_item_source_type ADD VALUE IF NOT EXISTS 'prescription';
ALTER TYPE public.settlement_item_source_type ADD VALUE IF NOT EXISTS 'vaccination';

ALTER TYPE public.compensation_frequency ADD VALUE IF NOT EXISTS 'per_lab_order';
ALTER TYPE public.compensation_frequency ADD VALUE IF NOT EXISTS 'per_prescription';
ALTER TYPE public.compensation_frequency ADD VALUE IF NOT EXISTS 'per_vaccination';

-- ─────────────────────────────────────────────
-- Helper: lab / pharmacy / vaccination activity rules
-- ─────────────────────────────────────────────
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

-- Hook into appointment/hourly helper (already called from calculate).
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

-- ─────────────────────────────────────────────
-- Adjustments: allow draft+review; delete RPC
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_professional_settlement_adjustment(
  p_settlement_id UUID,
  p_type public.settlement_adjustment_type,
  p_amount NUMERIC,
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
  v_adjustment public.professional_settlement_adjustments%ROWTYPE;
  v_amount NUMERIC(14, 2);
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para agregar ajustes';
  END IF;

  IF p_settlement_id IS NULL OR p_type IS NULL OR p_amount IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'settlement_id, type, amount y reason son requeridos';
  END IF;

  v_amount := public.round_ars(p_amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;

  IF char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
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
    RAISE EXCEPTION 'Solo se pueden agregar ajustes a liquidaciones en borrador o revisión';
  END IF;

  INSERT INTO public.professional_settlement_adjustments (
    settlement_id,
    organization_id,
    adjustment_type,
    amount,
    reason,
    created_by
  ) VALUES (
    v_settlement.id,
    v_org_id,
    p_type,
    v_amount,
    btrim(p_reason),
    auth.uid()
  )
  RETURNING * INTO v_adjustment;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement.id);

  SELECT * INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_settlement.id;

  RETURN jsonb_build_object(
    'adjustment', to_jsonb(v_adjustment),
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

CREATE OR REPLACE FUNCTION public.delete_professional_settlement_adjustment(
  p_adjustment_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_adjustment public.professional_settlement_adjustments%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para eliminar ajustes';
  END IF;

  IF p_adjustment_id IS NULL THEN
    RAISE EXCEPTION 'adjustment_id es requerido';
  END IF;

  SELECT *
  INTO v_adjustment
  FROM public.professional_settlement_adjustments a
  WHERE a.id = p_adjustment_id
    AND a.organization_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ajuste no encontrado';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_adjustment.settlement_id
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
    RAISE EXCEPTION 'Solo se pueden eliminar ajustes de liquidaciones en borrador o revisión';
  END IF;

  DELETE FROM public.professional_settlement_adjustments
  WHERE id = v_adjustment.id;

  PERFORM public.recalculate_professional_settlement_totals(v_settlement.id);

  SELECT * INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.id = v_settlement.id;

  RETURN jsonb_build_object(
    'deleted_adjustment_id', v_adjustment.id,
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

GRANT EXECUTE ON FUNCTION public.delete_professional_settlement_adjustment(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- Settlement notes (draft/review)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_professional_settlement_notes(
  p_settlement_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_notes TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para editar notas de liquidación';
  END IF;

  IF p_settlement_id IS NULL THEN
    RAISE EXCEPTION 'settlement_id es requerido';
  END IF;

  v_notes := NULLIF(left(btrim(COALESCE(p_notes, '')), 2000), '');

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
    RAISE EXCEPTION 'Solo se pueden editar notas en borrador o revisión';
  END IF;

  UPDATE public.professional_settlements s
  SET notes = v_notes,
      updated_at = now()
  WHERE s.id = v_settlement.id
  RETURNING * INTO v_settlement;

  RETURN jsonb_build_object(
    'id', v_settlement.id,
    'notes', v_settlement.notes,
    'status', v_settlement.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_professional_settlement_notes(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- Portal list: period filters
-- ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.list_my_professional_settlements(
  public.settlement_status,
  INTEGER,
  INTEGER
);

CREATE OR REPLACE FUNCTION public.list_my_professional_settlements(
  p_status public.settlement_status DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_professional_id UUID;
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_offset INTEGER;
  v_total BIGINT;
  v_rows JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_professional_id := public.get_linked_professional_id();

  IF v_org_id IS NULL OR v_professional_id IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', v_page, 'page_size', v_page_size);
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  SELECT COUNT(*)
  INTO v_total
  FROM public.professional_settlements s
  WHERE s.organization_id = v_org_id
    AND s.professional_id = v_professional_id
    AND s.deleted_at IS NULL
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_period_start IS NULL OR s.period_end >= p_period_start)
    AND (p_period_end IS NULL OR s.period_start <= p_period_end);

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.period_end DESC, s.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.*
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.professional_id = v_professional_id
      AND s.deleted_at IS NULL
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_period_start IS NULL OR s.period_end >= p_period_start)
      AND (p_period_end IS NULL OR s.period_start <= p_period_end)
    ORDER BY s.period_end DESC, s.created_at DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) s;

  RETURN jsonb_build_object(
    'items', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_professional_settlements(
  public.settlement_status,
  INTEGER,
  INTEGER,
  DATE,
  DATE
) TO authenticated;
