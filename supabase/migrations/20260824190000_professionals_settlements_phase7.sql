-- Professionals & Settlements Phase 7: own read access, per-appointment/hourly rules, bulk helpers.
-- STAGING FIRST. Additive.

ALTER TYPE public.compensation_frequency ADD VALUE IF NOT EXISTS 'per_appointment';

-- ─────────────────────────────────────────────
-- Helper: linked professional for current user
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_linked_professional_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.professionals p
  WHERE p.organization_id = public.get_user_organization_id()
    AND p.user_id = auth.uid()
    AND p.deleted_at IS NULL
    AND p.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_can_read_professional_settlement(p_professional_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_permission('professional_settlements:read')
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = p_professional_id
        AND p.user_id = auth.uid()
        AND p.organization_id = public.get_user_organization_id()
        AND p.deleted_at IS NULL
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_linked_professional_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_read_professional_settlement(UUID) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: list_my_professional_settlements
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_my_professional_settlements(
  p_status public.settlement_status DEFAULT NULL,
  p_page INTEGER DEFAULT 1,
  p_page_size INTEGER DEFAULT 25
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
    AND (p_status IS NULL OR s.status = p_status);

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.period_end DESC, s.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.*
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.professional_id = v_professional_id
      AND s.deleted_at IS NULL
      AND (p_status IS NULL OR s.status = p_status)
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
  INTEGER
) TO authenticated;

-- ─────────────────────────────────────────────
-- RPC: get_professional_settlement (own read)
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
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at)
      FROM public.professional_payments p
      WHERE p.settlement_id = v_settlement.id
        AND p.deleted_at IS NULL
    ), '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────
-- Apply per-appointment and hourly compensation
-- ─────────────────────────────────────────────
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
CREATE OR REPLACE FUNCTION public.calculate_professional_settlement(
  p_professional_id UUID,
  p_period_start DATE,
  p_period_end DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_prof public.professionals%ROWTYPE;
  v_scheme public.professional_compensation_schemes%ROWTYPE;
  v_settlement_id UUID;
  v_settlement public.professional_settlements%ROWTYPE;
  v_rule public.professional_compensation_rules%ROWTYPE;
  v_overlap_start DATE;
  v_overlap_end DATE;
  v_month_cursor DATE;
  v_month_start DATE;
  v_month_end DATE;
  v_days_in_month INTEGER;
  v_overlap_days INTEGER;
  v_line_amount NUMERIC(14, 2);
  v_count BIGINT;
  v_weeks NUMERIC;
  v_days INTEGER;
  v_anchor DATE;
  v_period_days INTEGER;
  v_window_start DATE;
  v_window_end DATE;
  v_biweekly_count INTEGER;
  v_cons RECORD;
  v_calc NUMERIC(14, 2);
  v_base NUMERIC(14, 2);
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL
    OR NOT public.has_permission('professional_compensation:write')
    OR NOT public.has_permission('professional_settlements:read') THEN
    RAISE EXCEPTION 'Sin permisos para calcular liquidaciones';
  END IF;

  IF p_professional_id IS NULL OR p_period_start IS NULL OR p_period_end IS NULL THEN
    RAISE EXCEPTION 'professional_id, period_start y period_end son requeridos';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'period_end debe ser >= period_start';
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal indicada';
  END IF;

  SELECT *
  INTO v_prof
  FROM public.professionals p
  WHERE p.id = p_professional_id
    AND p.organization_id = v_org_id
    AND p.deleted_at IS NULL
    AND p.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profesional no encontrado o inactivo';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.professional_id = p_professional_id
      AND s.period_start = p_period_start
      AND s.period_end = p_period_end
      AND COALESCE(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND s.deleted_at IS NULL
      AND s.status IN ('approved', 'partially_paid', 'paid')
  ) THEN
    RAISE EXCEPTION 'Ya existe una liquidación aprobada o pagada para este período';
  END IF;

  SELECT *
  INTO v_scheme
  FROM public.professional_compensation_schemes cs
  WHERE cs.organization_id = v_org_id
    AND cs.professional_id = p_professional_id
    AND cs.deleted_at IS NULL
    AND cs.is_active = true
    AND cs.valid_from <= p_period_end
    AND (cs.valid_to IS NULL OR cs.valid_to >= p_period_start)
  ORDER BY cs.valid_from DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay esquema de compensación activo para el período';
  END IF;

  SELECT s.*
  INTO v_settlement
  FROM public.professional_settlements s
  WHERE s.organization_id = v_org_id
    AND s.professional_id = p_professional_id
    AND s.period_start = p_period_start
    AND s.period_end = p_period_end
    AND COALESCE(s.branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND s.deleted_at IS NULL
    AND s.status IN ('draft', 'review')
  FOR UPDATE;

  IF FOUND THEN
    v_settlement_id := v_settlement.id;

    DELETE FROM public.professional_settlement_source_claims c
    WHERE c.settlement_id = v_settlement_id;

    DELETE FROM public.professional_settlement_items i
    WHERE i.settlement_id = v_settlement_id;

    UPDATE public.professional_settlements s
    SET
      compensation_scheme_id = v_scheme.id,
      currency = v_scheme.currency,
      calculated_at = now(),
      status = 'draft',
      updated_at = now()
    WHERE s.id = v_settlement_id;
  ELSE
    INSERT INTO public.professional_settlements (
      organization_id,
      branch_id,
      professional_id,
      compensation_scheme_id,
      period_start,
      period_end,
      status,
      currency,
      calculated_at
    ) VALUES (
      v_org_id,
      p_branch_id,
      p_professional_id,
      v_scheme.id,
      p_period_start,
      p_period_end,
      'draft',
      v_scheme.currency,
      now()
    )
    RETURNING id INTO v_settlement_id;
  END IF;

  v_overlap_start := GREATEST(p_period_start, v_scheme.valid_from);
  v_overlap_end := LEAST(p_period_end, COALESCE(v_scheme.valid_to, p_period_end));

  IF v_overlap_end < v_overlap_start THEN
    PERFORM public.recalculate_professional_settlement_totals(v_settlement_id);
    RETURN v_settlement_id;
  END IF;

  FOR v_rule IN
    SELECT r.*
    FROM public.professional_compensation_rules r
    WHERE r.compensation_scheme_id = v_scheme.id
      AND r.organization_id = v_org_id
      AND r.deleted_at IS NULL
      AND r.is_active = true
    ORDER BY r.created_at ASC
  LOOP
    IF v_rule.frequency = 'monthly'
      AND v_rule.rule_type = 'fixed'
      AND v_rule.amount IS NOT NULL THEN
      v_month_cursor := date_trunc('month', v_overlap_start)::DATE;

      WHILE v_month_cursor <= v_overlap_end LOOP
        v_month_start := date_trunc('month', v_month_cursor)::DATE;
        v_month_end := (date_trunc('month', v_month_cursor) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
        v_days_in_month := EXTRACT(DAY FROM (date_trunc('month', v_month_cursor) + INTERVAL '1 month' - INTERVAL '1 day'))::INTEGER;
        v_overlap_days := LEAST(v_overlap_end, v_month_end) - GREATEST(v_overlap_start, v_month_start) + 1;

        IF v_overlap_days > 0 THEN
          v_line_amount := public.round_ars(v_rule.amount * v_overlap_days::NUMERIC / v_days_in_month::NUMERIC);

          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            description,
            quantity,
            unit_amount,
            calculated_amount
          ) VALUES (
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'fixed_compensation',
            format('Compensación fija mensual (%s)', to_char(v_month_cursor, 'YYYY-MM')),
            v_overlap_days,
            public.round_ars(v_rule.amount / v_days_in_month::NUMERIC),
            v_line_amount
          );
        END IF;

        v_month_cursor := (date_trunc('month', v_month_cursor) + INTERVAL '1 month')::DATE;
      END LOOP;

    ELSIF v_rule.frequency = 'weekly'
      AND v_rule.amount IS NOT NULL THEN
      v_weeks := CEIL((v_overlap_end - v_overlap_start + 1)::NUMERIC / 7.0);
      v_line_amount := public.round_ars(v_rule.amount * v_weeks);

      INSERT INTO public.professional_settlement_items (
        settlement_id,
        organization_id,
        rule_id,
        source_type,
        description,
        quantity,
        unit_amount,
        calculated_amount
      ) VALUES (
        v_settlement_id,
        v_org_id,
        v_rule.id,
        'fixed_compensation',
        format('Compensación semanal (%s semanas)', v_weeks),
        v_weeks,
        v_rule.amount,
        v_line_amount
      );

    ELSIF v_rule.frequency = 'biweekly'
      AND v_rule.amount IS NOT NULL THEN
      v_anchor := COALESCE(
        NULLIF(v_scheme.conditions->>'anchor_date', '')::DATE,
        NULLIF(v_rule.conditions->>'anchor_date', '')::DATE,
        v_scheme.valid_from
      );
      v_period_days := COALESCE(
        NULLIF(v_scheme.conditions->>'period_days', '')::INTEGER,
        NULLIF(v_rule.conditions->>'period_days', '')::INTEGER,
        14
      );

      v_biweekly_count := 0;
      v_window_start := v_anchor;

      WHILE v_window_start <= v_overlap_end LOOP
        v_window_end := v_window_start + (v_period_days - 1);

        IF v_window_end >= v_overlap_start AND v_window_start <= v_overlap_end THEN
          v_biweekly_count := v_biweekly_count + 1;
        END IF;

        v_window_start := v_window_start + v_period_days;
      END LOOP;

      IF v_biweekly_count > 0 THEN
        v_line_amount := public.round_ars(v_rule.amount * v_biweekly_count);

        INSERT INTO public.professional_settlement_items (
          settlement_id,
          organization_id,
          rule_id,
          source_type,
          description,
          quantity,
          unit_amount,
          calculated_amount
        ) VALUES (
          v_settlement_id,
          v_org_id,
          v_rule.id,
          'fixed_compensation',
          format('Compensación quincenal (%s períodos)', v_biweekly_count),
          v_biweekly_count,
          v_rule.amount,
          v_line_amount
        );
      END IF;

    ELSIF v_rule.frequency = 'daily'
      AND v_rule.amount IS NOT NULL THEN
      v_days := v_overlap_end - v_overlap_start + 1;
      v_line_amount := public.round_ars(v_rule.amount * v_days);

      INSERT INTO public.professional_settlement_items (
        settlement_id,
        organization_id,
        rule_id,
        source_type,
        description,
        quantity,
        unit_amount,
        calculated_amount
      ) VALUES (
        v_settlement_id,
        v_org_id,
        v_rule.id,
        'fixed_compensation',
        format('Compensación diaria (%s días)', v_days),
        v_days,
        v_rule.amount,
        v_line_amount
      );

    ELSIF v_rule.frequency = 'per_consultation'
      AND v_prof.user_id IS NOT NULL THEN
      IF v_rule.rule_type = 'percentage' AND v_rule.percentage IS NOT NULL THEN
        FOR v_cons IN
          SELECT
            c.id,
            c.branch_id,
            COALESCE(inv.total, 0) AS invoice_total
          FROM public.consultations c
          LEFT JOIN LATERAL (
            SELECT i.total
            FROM public.invoices i
            WHERE i.consultation_id = c.id
              AND i.organization_id = v_org_id
              AND i.deleted_at IS NULL
              AND i.status <> 'anulada'
            ORDER BY i.created_at DESC
            LIMIT 1
          ) inv ON true
          WHERE c.organization_id = v_org_id
            AND c.deleted_at IS NULL
            AND c.status = 'completada'
            AND c.veterinarian_id = v_prof.user_id
            AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
              BETWEEN v_overlap_start AND v_overlap_end
            AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
            AND NOT EXISTS (
              SELECT 1
              FROM public.professional_settlement_source_claims cl
              WHERE cl.organization_id = v_org_id
                AND cl.source_type = 'consultation'
                AND cl.source_id = c.id
            )
        LOOP
          v_base := COALESCE(v_cons.invoice_total, 0);
          v_calc := public.round_ars(v_base * v_rule.percentage / 100.0);

          IF v_rule.minimum_amount IS NOT NULL THEN
            v_calc := GREATEST(v_calc, v_rule.minimum_amount);
          END IF;
          IF v_rule.maximum_amount IS NOT NULL THEN
            v_calc := LEAST(v_calc, v_rule.maximum_amount);
          END IF;

          IF v_calc > 0 THEN
            INSERT INTO public.professional_settlement_items (
              settlement_id,
              organization_id,
              rule_id,
              source_type,
              source_id,
              description,
              quantity,
              unit_amount,
              percentage,
              base_amount,
              calculated_amount
            ) VALUES (
              v_settlement_id,
              v_org_id,
              v_rule.id,
              'consultation',
              v_cons.id,
              'Porcentaje sobre consulta',
              1,
              NULL,
              v_rule.percentage,
              v_base,
              v_calc
            );
          END IF;
        END LOOP;
      ELSIF v_rule.amount IS NOT NULL THEN
        FOR v_cons IN
          SELECT c.id
          FROM public.consultations c
          WHERE c.organization_id = v_org_id
            AND c.deleted_at IS NULL
            AND c.status = 'completada'
            AND c.veterinarian_id = v_prof.user_id
            AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
              BETWEEN v_overlap_start AND v_overlap_end
            AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
            AND NOT EXISTS (
              SELECT 1
              FROM public.professional_settlement_source_claims cl
              WHERE cl.organization_id = v_org_id
                AND cl.source_type = 'consultation'
                AND cl.source_id = c.id
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
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'consultation',
            v_cons.id,
            'Consulta completada',
            1,
            v_rule.amount,
            public.round_ars(v_rule.amount)
          );
        END LOOP;
      END IF;

    ELSIF v_rule.frequency = 'per_surgery'
      AND v_prof.user_id IS NOT NULL
      AND v_rule.amount IS NOT NULL THEN
      FOR v_cons IN
        SELECT s.id
        FROM public.surgeries s
        WHERE s.organization_id = v_org_id
          AND s.deleted_at IS NULL
          AND s.status = 'completada'
          AND s.surgeon_id = v_prof.user_id
          AND public.professional_activity_occurred_on(s.completed_at, s.updated_at, s.created_at)
            BETWEEN v_overlap_start AND v_overlap_end
          AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = v_org_id
              AND cl.source_type = 'surgery'
              AND cl.source_id = s.id
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
          v_settlement_id,
          v_org_id,
          v_rule.id,
          'surgery',
          v_cons.id,
          'Cirugía completada',
          1,
          v_rule.amount,
          public.round_ars(v_rule.amount)
        );
      END LOOP;

    ELSIF v_rule.frequency = 'percentage'
      AND v_rule.rule_type = 'percentage'
      AND v_rule.percentage IS NOT NULL
      AND v_prof.user_id IS NOT NULL THEN
      FOR v_cons IN
        SELECT
          c.id,
          COALESCE(inv.total, 0) AS invoice_total
        FROM public.consultations c
        LEFT JOIN LATERAL (
          SELECT i.total
          FROM public.invoices i
          WHERE i.consultation_id = c.id
            AND i.organization_id = v_org_id
            AND i.deleted_at IS NULL
            AND i.status <> 'anulada'
          ORDER BY i.created_at DESC
          LIMIT 1
        ) inv ON true
        WHERE c.organization_id = v_org_id
          AND c.deleted_at IS NULL
          AND c.status = 'completada'
          AND c.veterinarian_id = v_prof.user_id
          AND public.professional_activity_occurred_on(c.completed_at, c.updated_at, c.created_at)
            BETWEEN v_overlap_start AND v_overlap_end
          AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
          AND NOT EXISTS (
            SELECT 1
            FROM public.professional_settlement_source_claims cl
            WHERE cl.organization_id = v_org_id
              AND cl.source_type = 'consultation'
              AND cl.source_id = c.id
          )
      LOOP
        v_base := COALESCE(v_cons.invoice_total, 0);
        v_calc := public.round_ars(v_base * v_rule.percentage / 100.0);

        IF v_rule.minimum_amount IS NOT NULL THEN
          v_calc := GREATEST(v_calc, v_rule.minimum_amount);
        END IF;
        IF v_rule.maximum_amount IS NOT NULL THEN
          v_calc := LEAST(v_calc, v_rule.maximum_amount);
        END IF;

        IF v_calc > 0 THEN
          INSERT INTO public.professional_settlement_items (
            settlement_id,
            organization_id,
            rule_id,
            source_type,
            source_id,
            description,
            quantity,
            percentage,
            base_amount,
            calculated_amount
          ) VALUES (
            v_settlement_id,
            v_org_id,
            v_rule.id,
            'consultation',
            v_cons.id,
            'Porcentaje sobre facturación de consulta',
            1,
            v_rule.percentage,
            v_base,
            v_calc
          );
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public.apply_professional_appointment_hourly_rules(
    v_settlement_id,
    v_scheme.id,
    v_prof,
    v_overlap_start,
    v_overlap_end,
    p_branch_id,
    v_org_id
  );

  PERFORM public.recalculate_professional_settlement_totals(v_settlement_id);
  RETURN v_settlement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_professional_settlement(UUID, DATE, DATE, UUID) TO authenticated;
