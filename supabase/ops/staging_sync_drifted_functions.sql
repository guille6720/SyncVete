-- Staging only: staging had drifted versions of these functions (wrong signatures / columns
-- that do not exist). Replaces them with the latest definitions from supabase/migrations.
DO $d$ DECLARE r record; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('apply_professional_appointment_hourly_rules','approve_professional_settlement','get_professional_settlement','return_professional_settlement_to_draft','void_professional_payment','superadmin_get_recommendation_settings','superadmin_upsert_recommendation_saved_view')
  LOOP EXECUTE 'DROP FUNCTION ' || r.sig; END LOOP;
END $d$;

-- Generated from the latest definition of each function (migration order).
SET check_function_bodies = off;

-- ===== apply_professional_appointment_hourly_rules
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


-- ===== approve_professional_settlement
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
    RAISE EXCEPTION 'LiquidaciÃ³n no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidaciÃ³n';
  END IF;

  IF v_settlement.status NOT IN ('draft', 'review') THEN
    RAISE EXCEPTION 'Solo se pueden aprobar liquidaciones en borrador o revisiÃ³n';
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
        RAISE EXCEPTION 'La fuente %/% ya fue liquidada en otra liquidaciÃ³n',
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
      'LiquidaciÃ³n aprobada',
      format(
        'PerÃ­odo %s â€” %s Â· %s %s',
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


-- ===== get_professional_settlement
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


-- ===== return_professional_settlement_to_draft
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
    RAISE EXCEPTION 'LiquidaciÃ³n no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidaciÃ³n';
  END IF;

  IF v_settlement.status <> 'review' THEN
    RAISE EXCEPTION 'Solo se pueden devolver a borrador liquidaciones en revisiÃ³n';
  END IF;

  v_notes := CASE
    WHEN v_settlement.notes IS NULL OR btrim(v_settlement.notes) = '' THEN
      'Devuelta a borrador: ' || v_reason
    ELSE
      left('Devuelta a borrador: ' || v_reason || ' Â· ' || v_settlement.notes, 2000)
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
    'LiquidaciÃ³n devuelta a borrador',
    format(
      '%s Â· %s â€” %s Â· %s',
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


-- ===== superadmin_get_recommendation_settings
CREATE OR REPLACE FUNCTION public.superadmin_get_recommendation_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  PERFORM public.require_platform_admin();
  SELECT * INTO v_row FROM public.commercial_recommendation_settings WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.commercial_recommendation_settings (id) VALUES (1)
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'stale_days', v_row.stale_days,
    'priority_weights', public.normalize_recommendation_priority_weights(v_row.priority_weights),
    'updated_at', v_row.updated_at
  );
END;
$$;


-- ===== superadmin_upsert_recommendation_saved_view
CREATE OR REPLACE FUNCTION public.superadmin_upsert_recommendation_saved_view(
  p_name TEXT,
  p_query_params JSONB DEFAULT '{}'::JSONB,
  p_is_shared BOOLEAN DEFAULT false,
  p_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_name TEXT;
  v_params JSONB;
  v_row public.commercial_recommendation_saved_views%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'name required';
  END IF;
  IF char_length(v_name) > 60 THEN
    RAISE EXCEPTION 'name too long';
  END IF;

  v_params := public.sanitize_commercial_saved_view_params(p_query_params);

  IF p_id IS NOT NULL THEN
    UPDATE public.commercial_recommendation_saved_views v
    SET
      name = v_name,
      query_params = v_params,
      is_shared = COALESCE(p_is_shared, false),
      updated_at = timezone('utc', now())
    WHERE v.id = p_id
      AND v.owner_user_id = v_uid
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'saved view not found';
    END IF;
  ELSE
    INSERT INTO public.commercial_recommendation_saved_views AS v (
      owner_user_id,
      name,
      query_params,
      is_shared
    )
    VALUES (
      v_uid,
      v_name,
      v_params,
      COALESCE(p_is_shared, false)
    )
    ON CONFLICT ON CONSTRAINT uq_commercial_saved_views_owner_name DO UPDATE SET
      query_params = EXCLUDED.query_params,
      is_shared = EXCLUDED.is_shared,
      name = EXCLUDED.name,
      updated_at = timezone('utc', now())
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'query_params', v_row.query_params,
    'is_shared', v_row.is_shared,
    'updated_at', v_row.updated_at
  );
END;
$$;


-- ===== void_professional_payment
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
    RAISE EXCEPTION 'LiquidaciÃ³n no encontrada';
  END IF;

  IF v_settlement.branch_id IS NOT NULL
    AND NOT public.user_has_branch_access(v_settlement.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal de la liquidaciÃ³n';
  END IF;

  IF v_settlement.status NOT IN ('approved', 'partially_paid', 'paid') THEN
    RAISE EXCEPTION 'Solo se pueden anular pagos de liquidaciones aprobadas o pagadas';
  END IF;

  UPDATE public.professional_payments
  SET
    deleted_at = now(),
    notes = CASE
      WHEN notes IS NULL OR btrim(notes) = '' THEN 'Anulado: ' || v_reason
      ELSE left('Anulado: ' || v_reason || ' Â· ' || notes, 500)
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

  -- Fallback: soft note trail for preâ€“phase-20 egresos
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
        'La sesiÃ³n de caja estÃ¡ cerrada; el egreso vinculado se marcÃ³ como eliminado';
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


-- ===== grants / comments
GRANT EXECUTE ON FUNCTION public.apply_professional_appointment_hourly_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_appointment_hourly_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_appointment_hourly_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_professional_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_professional_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_settlement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) IS
  'Create/update own saved commercial view. Shared views are visible to all platform admins.';
GRANT EXECUTE ON FUNCTION public.void_professional_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_professional_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_professional_payment(UUID, TEXT) TO authenticated;

-- ===== triggers

NOTIFY pgrst, 'reload schema';
