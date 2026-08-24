-- Professionals & Settlements Phase 8: per_procedure / per_shift rules + calculate hook.
-- STAGING FIRST. Additive.

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
      AND r.frequency IN ('per_procedure', 'per_shift')
  LOOP
    IF v_rule.frequency = 'per_procedure' AND v_rule.amount IS NOT NULL THEN
      FOR v_row IN
        SELECT ci.id, ci.title, ci.kind
        FROM public.clinical_images ci
        WHERE ci.organization_id = p_org_id
          AND ci.deleted_at IS NULL
          AND ci.uploaded_by = p_prof.user_id
          AND ci.taken_at::DATE BETWEEN p_overlap_start AND p_overlap_end
          AND ci.kind IN ('radiografia', 'ecografia', 'laboratorio')
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

-- Extend appointment/hourly helper to also apply procedure/shift rules.
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
