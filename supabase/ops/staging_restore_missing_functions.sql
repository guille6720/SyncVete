-- Staging only: restores functions defined in supabase/migrations that are missing on staging.
-- Generated from the latest definition of each function (migration order).
SET check_function_bodies = off;

-- ===== _billing_expire_checkout_intents
CREATE OR REPLACE FUNCTION public._billing_expire_checkout_intents(p_organization_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.billing_checkout_intents
  SET cancelled_at = timezone('utc', now())
  WHERE organization_id = p_organization_id
    AND consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= timezone('utc', now());
$$;


-- ===== _billing_grant_ids_match
CREATE OR REPLACE FUNCTION public._billing_grant_ids_match(p_metadata JSONB, p_ids TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_ids IS NOT NULL AND cardinality(p_ids) > 0 AND (
    COALESCE(p_metadata->>'external_id', '') = ANY(p_ids)
    OR COALESCE(p_metadata->>'payment_intent_id', '') = ANY(p_ids)
    OR COALESCE(p_metadata->>'charge_id', '') = ANY(p_ids)
    OR COALESCE(p_metadata->>'invoice_id', '') = ANY(p_ids)
    OR COALESCE(p_metadata->>'checkout_session_id', '') = ANY(p_ids)
    OR COALESCE(p_metadata->>'stripe_subscription_id', '') = ANY(p_ids)
  );
$$;


-- ===== _billing_normalize_id_list
CREATE OR REPLACE FUNCTION public._billing_normalize_id_list(p_ids TEXT[], p_external_id TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT trimmed
      FROM unnest(COALESCE(p_ids, ARRAY[]::TEXT[]) || ARRAY[p_external_id]) AS raw
      CROSS JOIN LATERAL (SELECT NULLIF(trim(raw), '')) AS t(trimmed)
      WHERE trimmed IS NOT NULL
    ),
    ARRAY[]::TEXT[]
  );
$$;


-- ===== _billing_payload_has_ids
CREATE OR REPLACE FUNCTION public._billing_payload_has_ids(p_payload JSONB, p_ids TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_ids IS NOT NULL AND cardinality(p_ids) > 0 AND (
    COALESCE(p_payload->'data'->'object'->>'id', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->>'payment_intent', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->'payment_intent'->>'id', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->>'invoice', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->'invoice'->>'id', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->>'subscription', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->'subscription'->>'id', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->>'charge', '') = ANY(p_ids)
    OR COALESCE(p_payload->'data'->'object'->'charge'->>'id', '') = ANY(p_ids)
    OR COALESCE(p_payload->>'paymentId', '') = ANY(p_ids)
  );
$$;


-- ===== add_cash_movement
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


-- ===== apply_professional_lab_pharmacy_vaccination_rules
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


-- ===== apply_professional_procedure_shift_rules
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


-- ===== audit_event_summary
CREATE OR REPLACE FUNCTION public.audit_event_summary(
  p_action TEXT,
  p_entity_type TEXT,
  p_old JSONB,
  p_new JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_action TEXT;
  v_soft BOOLEAN;
  v_subject TEXT;
  v_label TEXT;
BEGIN
  v_action := lower(COALESCE(p_action, ''));
  IF v_action IN ('insert', 'create') THEN
    v_action := 'create';
  ELSIF v_action IN ('update') THEN
    v_action := 'update';
  ELSIF v_action IN ('delete') THEN
    v_action := 'delete';
  END IF;

  v_soft := v_action = 'update'
    AND COALESCE(p_new->>'deleted_at', '') <> ''
    AND COALESCE(p_old->>'deleted_at', '') = '';

  v_subject := COALESCE(
    NULLIF(p_new->>'name', ''),
    NULLIF(p_old->>'name', ''),
    NULLIF(p_new->>'full_name', ''),
    NULLIF(p_old->>'full_name', ''),
    NULLIF(p_new->>'title', ''),
    NULLIF(p_old->>'title', ''),
    NULLIF(p_new->>'number', ''),
    NULLIF(p_old->>'number', ''),
    NULLIF(p_new->>'vaccine_name', ''),
    NULLIF(p_old->>'vaccine_name', ''),
    NULLIF(p_new->>'procedure_name', ''),
    NULLIF(p_old->>'procedure_name', ''),
    NULLIF(p_new->>'sku', ''),
    NULLIF(p_old->>'sku', ''),
    ''
  );

  v_label := CASE p_entity_type
    WHEN 'patients' THEN 'Paciente'
    WHEN 'owners' THEN 'Propietario'
    WHEN 'appointments' THEN 'Cita'
    WHEN 'clinical_entries' THEN 'Historia clínica'
    WHEN 'consultations' THEN 'Consulta'
    WHEN 'hospitalizations' THEN 'Internación'
    WHEN 'hospitalization_notes' THEN 'Nota de internación'
    WHEN 'vaccinations' THEN 'Vacuna'
    WHEN 'surgeries' THEN 'Cirugía'
    WHEN 'lab_orders' THEN 'Laboratorio'
    WHEN 'lab_order_items' THEN 'Ítem de laboratorio'
    WHEN 'inventory_products' THEN 'Producto'
    WHEN 'inventory_movements' THEN 'Movimiento de stock'
    WHEN 'invoices' THEN 'Factura'
    WHEN 'invoice_items' THEN 'Ítem de factura'
    WHEN 'payments' THEN 'Pago'
    WHEN 'prescriptions' THEN 'Receta'
    WHEN 'cash_sessions' THEN 'Caja'
    WHEN 'cash_movements' THEN 'Movimiento de caja'
    WHEN 'clinical_images' THEN 'Imagen clínica'
    WHEN 'whatsapp_messages' THEN 'WhatsApp'
    WHEN 'reminder_logs' THEN 'Recordatorio'
    WHEN 'ai_suggestions' THEN 'IA clínica'
    WHEN 'notifications' THEN 'Notificación'
    WHEN 'organizations' THEN 'Clínica'
    WHEN 'branches' THEN 'Sucursal'
    WHEN 'profiles' THEN 'Perfil'
    WHEN 'branch_members' THEN 'Miembro'
    WHEN 'organization_invitations' THEN 'Invitación'
    WHEN 'owner_portal_invites' THEN 'Invitación al portal'
    ELSE replace(p_entity_type, '_', ' ')
  END;

  IF p_entity_type = 'consultations' AND v_action = 'update' AND p_new->>'status' = 'completada' THEN
    RETURN 'Consulta completada' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;
  IF p_entity_type = 'hospitalizations' AND v_action = 'update' AND p_new->>'status' = 'alta' THEN
    RETURN 'Alta de internación';
  END IF;
  IF p_entity_type = 'lab_orders' AND v_action = 'update' AND p_new->>'status' = 'completada' THEN
    RETURN 'Lab completado' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;
  IF p_entity_type = 'invoices' AND v_action = 'update' AND p_new->>'status' = 'emitida' THEN
    RETURN 'Factura emitida' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;
  IF p_entity_type = 'invoices' AND v_action = 'update' AND p_new->>'status' = 'pagada' THEN
    RETURN 'Factura cobrada' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;
  IF p_entity_type = 'invoices' AND v_action = 'update' AND p_new->>'status' = 'anulada' THEN
    RETURN 'Factura anulada' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;
  IF p_entity_type = 'surgeries' AND v_action = 'update' AND p_new->>'status' = 'completada' THEN
    RETURN 'Cirugía completada' || CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
  END IF;

  RETURN v_label || ' ' ||
    CASE
      WHEN v_action = 'create' THEN 'creado'
      WHEN v_soft OR v_action = 'delete' THEN 'eliminado'
      ELSE 'actualizado'
    END ||
    CASE WHEN v_subject <> '' THEN ': ' || v_subject ELSE '' END;
END;
$$;


-- ===== billing_apply_paid_addon
CREATE OR REPLACE FUNCTION public.billing_apply_paid_addon(
  p_organization_id UUID,
  p_addon_key TEXT,
  p_provider TEXT,
  p_external_id TEXT,
  p_interval TEXT DEFAULT 'monthly'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_addon RECORD;
  v_plan_key TEXT;
  v_id UUID;
  v_ends TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'mercadopago') THEN
    RAISE EXCEPTION 'unknown billing provider';
  END IF;

  IF p_addon_key IS NULL OR p_addon_key NOT LIKE 'addon.%' THEN
    RAISE EXCEPTION 'paid checkout cannot assign that add-on';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT p.key
  INTO v_plan_key
  FROM public.organization_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_organization_id
    AND s.status IN ('trialing', 'active', 'past_due')
    AND s.cancelled_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_plan_key IS NULL THEN
    RAISE EXCEPTION 'active subscription required';
  END IF;

  IF v_plan_key = 'legacy' THEN
    RAISE EXCEPTION 'legacy already includes add-ons';
  END IF;

  SELECT id, key, is_active, is_public
  INTO v_addon
  FROM public.addons
  WHERE key = p_addon_key
    AND is_active = true;

  IF v_addon.id IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive add-on: %', p_addon_key;
  END IF;

  IF v_addon.is_public IS NOT TRUE THEN
    RAISE EXCEPTION 'add-on is not publicly purchasable: %', p_addon_key;
  END IF;

  IF p_interval = 'annual' THEN
    v_ends := timezone('utc', now()) + interval '1 year';
  ELSE
    v_ends := timezone('utc', now()) + interval '1 month';
  END IF;

  UPDATE public.organization_addons g
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    metadata = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'replaced_by_checkout', true,
      'replaced_at', timezone('utc', now())
    )
  WHERE g.organization_id = p_organization_id
    AND g.addon_id = v_addon.id
    AND g.status = 'active'
    AND g.cancelled_at IS NULL;

  INSERT INTO public.organization_addons (
    organization_id, addon_id, status, starts_at, ends_at, reason, metadata
  )
  VALUES (
    p_organization_id,
    v_addon.id,
    'active',
    timezone('utc', now()),
    v_ends,
    'checkout',
    jsonb_build_object(
      'source', 'billing_addon_checkout',
      'provider', p_provider,
      'external_id', p_external_id,
      'interval', COALESCE(p_interval, 'monthly')
    )
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'organization_addon_id', v_id,
    'addon_key', v_addon.key,
    'ends_at', v_ends
  );
END;
$$;


-- ===== billing_apply_paid_plan
CREATE OR REPLACE FUNCTION public.billing_apply_paid_plan(
  p_organization_id UUID,
  p_plan_key TEXT,
  p_provider TEXT,
  p_external_id TEXT,
  p_interval TEXT DEFAULT 'monthly',
  p_status public.subscription_status DEFAULT 'active'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan RECORD;
  v_meta JSONB;
  v_new_id UUID;
  v_ends TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'mercadopago') THEN
    RAISE EXCEPTION 'unknown billing provider';
  END IF;

  IF p_plan_key IS NULL OR p_plan_key IN ('legacy', 'trial') THEN
    RAISE EXCEPTION 'paid checkout cannot assign legacy or trial';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'paid checkout status must be active or past_due';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT id, key, is_public, is_internal, is_active
  INTO v_plan
  FROM public.plans
  WHERE key = p_plan_key
    AND is_active = true;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'unknown or inactive plan: %', p_plan_key;
  END IF;

  IF v_plan.is_internal IS TRUE OR v_plan.is_public IS NOT TRUE THEN
    RAISE EXCEPTION 'plan is not publicly purchasable: %', p_plan_key;
  END IF;

  IF p_interval = 'annual' THEN
    v_ends := timezone('utc', now()) + interval '1 year';
  ELSE
    v_ends := timezone('utc', now()) + interval '1 month';
  END IF;

  v_meta := jsonb_build_object(
    'source', 'billing_checkout',
    'provider', p_provider,
    'external_id', p_external_id,
    'interval', COALESCE(p_interval, 'monthly')
  );

  UPDATE public.organization_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    ends_at = timezone('utc', now())
  WHERE organization_id = p_organization_id
    AND status IN ('trialing', 'active', 'past_due')
    AND cancelled_at IS NULL;

  INSERT INTO public.organization_subscriptions (
    organization_id, plan_id, status, starts_at, ends_at, trial_ends_at, metadata
  )
  VALUES (
    p_organization_id,
    v_plan.id,
    p_status,
    timezone('utc', now()),
    v_ends,
    NULL,
    v_meta
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'subscription_id', v_new_id,
    'plan_key', v_plan.key,
    'status', p_status,
    'ends_at', v_ends
  );
END;
$$;


-- ===== billing_attach_paid_grant_ids
CREATE OR REPLACE FUNCTION public.billing_attach_paid_grant_ids(
  p_organization_id UUID,
  p_kind TEXT,
  p_target_key TEXT,
  p_ids JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_patch JSONB;
  v_count INT := 0;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;

  v_patch := jsonb_strip_nulls(COALESCE(p_ids, '{}'::jsonb));
  IF v_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('attached', 0);
  END IF;

  IF p_kind = 'plan' THEN
    SELECT s.id
    INTO v_id
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.organization_id = p_organization_id
      AND s.status IN ('active', 'past_due')
      AND s.cancelled_at IS NULL
      AND p.key = COALESCE(NULLIF(trim(p_target_key), ''), p.key)
      AND p.key NOT IN ('legacy', 'trial')
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('attached', 0);
    END IF;

    UPDATE public.organization_subscriptions
    SET metadata = COALESCE(metadata, '{}'::jsonb) || v_patch
    WHERE id = v_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN jsonb_build_object('attached', v_count, 'subscription_id', v_id);
  END IF;

  SELECT g.id
  INTO v_id
  FROM public.organization_addons g
  JOIN public.addons a ON a.id = g.addon_id
  WHERE g.organization_id = p_organization_id
    AND g.status = 'active'
    AND g.cancelled_at IS NULL
    AND a.key = p_target_key
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('attached', 0);
  END IF;

  UPDATE public.organization_addons
  SET metadata = COALESCE(metadata, '{}'::jsonb) || v_patch
  WHERE id = v_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('attached', v_count, 'organization_addon_id', v_id);
END;
$$;


-- ===== billing_begin_event
CREATE OR REPLACE FUNCTION public.billing_begin_event(
  p_provider TEXT,
  p_event_id TEXT,
  p_event_type TEXT,
  p_organization_id UUID,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_applied TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'mercadopago') THEN
    RAISE EXCEPTION 'unknown billing provider';
  END IF;

  IF p_event_id IS NULL OR length(trim(p_event_id)) = 0 THEN
    RAISE EXCEPTION 'event id required';
  END IF;

  INSERT INTO public.billing_events (
    provider, event_id, event_type, organization_id, payload
  )
  VALUES (
    p_provider,
    p_event_id,
    NULLIF(trim(COALESCE(p_event_type, '')), ''),
    p_organization_id,
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (provider, event_id) DO NOTHING
  RETURNING id, applied_at INTO v_id, v_applied;

  IF v_id IS NULL THEN
    SELECT e.id, e.applied_at
    INTO v_id, v_applied
    FROM public.billing_events e
    WHERE e.provider = p_provider
      AND e.event_id = p_event_id;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'billing event missing after claim';
  END IF;

  IF v_applied IS NULL THEN
    UPDATE public.billing_events
    SET
      organization_id = COALESCE(organization_id, p_organization_id),
      event_type = COALESCE(NULLIF(trim(COALESCE(p_event_type, '')), ''), event_type),
      payload = COALESCE(p_payload, payload)
    WHERE id = v_id
      AND applied_at IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_id,
    'already_applied', v_applied IS NOT NULL
  );
END;
$$;


-- ===== billing_begin_own_checkout_intent
CREATE OR REPLACE FUNCTION public.billing_begin_own_checkout_intent(
  p_kind TEXT,
  p_target_key TEXT,
  p_interval TEXT,
  p_provider TEXT,
  p_ttl_hours INT DEFAULT 48
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_id UUID;
  v_url TEXT;
  v_interval TEXT;
  v_ttl INT;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;

  IF p_kind = 'plan' AND p_target_key IN ('legacy', 'trial') THEN
    RAISE EXCEPTION 'paid checkout cannot assign legacy or trial';
  END IF;

  IF p_kind = 'addon' AND (p_target_key IS NULL OR p_target_key NOT LIKE 'addon.%') THEN
    RAISE EXCEPTION 'invalid add-on checkout';
  END IF;

  IF p_interval IS NULL OR p_interval NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'invalid billing interval';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'mercadopago') THEN
    RAISE EXCEPTION 'unknown billing provider';
  END IF;

  v_ttl := GREATEST(LEAST(COALESCE(p_ttl_hours, 48), 168), 1);
  PERFORM public._billing_expire_checkout_intents(v_org);

  SELECT i.id, i.checkout_url, i.billing_interval
  INTO v_id, v_url, v_interval
  FROM public.billing_checkout_intents i
  WHERE i.organization_id = v_org
    AND i.kind = p_kind
    AND i.target_key = p_target_key
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
    AND i.expires_at > timezone('utc', now())
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_id IS NOT NULL AND v_interval = p_interval THEN
    RETURN jsonb_build_object(
      'id', v_id,
      'checkout_url', v_url,
      'reused', true
    );
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE public.billing_checkout_intents
    SET cancelled_at = timezone('utc', now())
    WHERE id = v_id;
  END IF;

  IF p_kind = 'plan' THEN
    UPDATE public.billing_checkout_intents
    SET cancelled_at = timezone('utc', now())
    WHERE organization_id = v_org
      AND kind = 'plan'
      AND consumed_at IS NULL
      AND cancelled_at IS NULL;
  END IF;

  INSERT INTO public.billing_checkout_intents (
    organization_id, kind, target_key, billing_interval, provider, expires_at
  )
  VALUES (
    v_org,
    p_kind,
    p_target_key,
    p_interval,
    p_provider,
    timezone('utc', now()) + make_interval(hours => v_ttl)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'checkout_url', NULL,
    'reused', false
  );
END;
$$;


-- ===== billing_cancel_own_addon
CREATE OR REPLACE FUNCTION public.billing_cancel_own_addon(p_addon_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_count INT;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_addon_key IS NULL OR p_addon_key NOT LIKE 'addon.%' THEN
    RAISE EXCEPTION 'unknown add-on';
  END IF;

  UPDATE public.organization_addons g
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    metadata = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'status_source', 'clinic_self_cancel_addon',
      'cancelled_at', timezone('utc', now())
    )
  FROM public.addons a
  WHERE g.addon_id = a.id
    AND g.organization_id = v_org
    AND a.key = p_addon_key
    AND g.status = 'active'
    AND g.cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'no active add-on';
  END IF;

  RETURN jsonb_build_object('revoked', v_count, 'addon_key', p_addon_key);
END;
$$;


-- ===== billing_cancel_own_checkout_intents
CREATE OR REPLACE FUNCTION public.billing_cancel_own_checkout_intents()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_count INT;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.billing_checkout_intents
  SET cancelled_at = timezone('utc', now())
  WHERE organization_id = v_org
    AND consumed_at IS NULL
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('cancelled', v_count);
END;
$$;


-- ===== billing_cancel_own_subscription
CREATE OR REPLACE FUNCTION public.billing_cancel_own_subscription()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_plan_key TEXT;
  v_id UUID;
  v_status public.subscription_status;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT s.id, s.status, p.key
  INTO v_id, v_status, v_plan_key
  FROM public.organization_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = v_org
    AND s.status IN ('trialing', 'active', 'past_due')
    AND s.cancelled_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no active subscription';
  END IF;

  IF v_plan_key = 'legacy' THEN
    RAISE EXCEPTION 'legacy plans cannot be self-cancelled';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    ends_at = COALESCE(ends_at, timezone('utc', now())),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'status_source', 'clinic_self_cancel',
      'cancelled_at', timezone('utc', now())
    )
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'subscription_id', v_id,
    'previous_status', v_status,
    'status', 'cancelled'
  );
END;
$$;


-- ===== billing_consume_checkout_intents
CREATE OR REPLACE FUNCTION public.billing_consume_checkout_intents(
  p_organization_id UUID,
  p_kind TEXT,
  p_target_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;

  UPDATE public.billing_checkout_intents
  SET consumed_at = timezone('utc', now())
  WHERE organization_id = p_organization_id
    AND kind = p_kind
    AND (p_target_key IS NULL OR target_key = p_target_key OR p_kind = 'plan')
    AND consumed_at IS NULL
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('consumed', v_count);
END;
$$;


-- ===== billing_extend_paid_plan
CREATE OR REPLACE FUNCTION public.billing_extend_paid_plan(
  p_organization_id UUID,
  p_interval TEXT DEFAULT 'monthly',
  p_provider TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_ends TIMESTAMPTZ;
  v_plan_key TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_interval = 'annual' THEN
    v_ends := timezone('utc', now()) + interval '1 year';
  ELSE
    v_ends := timezone('utc', now()) + interval '1 month';
  END IF;

  SELECT s.id, p.key
  INTO v_id, v_plan_key
  FROM public.organization_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE s.organization_id = p_organization_id
    AND s.status IN ('active', 'past_due')
    AND s.cancelled_at IS NULL
    AND p.key NOT IN ('legacy', 'trial')
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('extended', 0);
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = 'active',
    ends_at = v_ends,
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'status_source', 'billing_extend_paid_plan',
      'provider', p_provider,
      'external_id', p_external_id,
      'interval', COALESCE(p_interval, 'monthly'),
      'extended_at', timezone('utc', now())
    )
  WHERE id = v_id;

  RETURN jsonb_build_object(
    'extended', 1,
    'subscription_id', v_id,
    'plan_key', v_plan_key,
    'ends_at', v_ends
  );
END;
$$;


-- ===== billing_finish_event
CREATE OR REPLACE FUNCTION public.billing_finish_event(p_event_row_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_event_row_id IS NULL THEN
    RAISE EXCEPTION 'event row required';
  END IF;

  UPDATE public.billing_events
  SET applied_at = timezone('utc', now())
  WHERE id = p_event_row_id
    AND applied_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('finished', v_count);
END;
$$;


-- ===== billing_lookup_paid_grant_from_provider_ids
CREATE OR REPLACE FUNCTION public.billing_lookup_paid_grant_from_provider_ids(
  p_provider TEXT,
  p_ids TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids TEXT[];
  v_event RECORD;
  v_obj JSONB;
  v_meta JSONB;
  v_org UUID;
  v_kind TEXT;
  v_target TEXT;
  v_matched TEXT;
  v_ref TEXT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_provider IS NULL OR p_provider NOT IN ('stripe', 'mercadopago') THEN
    RAISE EXCEPTION 'unknown billing provider';
  END IF;

  v_ids := public._billing_normalize_id_list(p_ids, NULL);
  IF cardinality(v_ids) = 0 THEN
    RETURN jsonb_build_object('found', 0);
  END IF;

  SELECT
    s.organization_id,
    'plan'::TEXT AS kind,
    p.key AS target_key,
    COALESCE(s.metadata->>'external_id', s.metadata->>'checkout_session_id') AS matched_external_id
  INTO v_org, v_kind, v_target, v_matched
  FROM public.organization_subscriptions s
  JOIN public.plans p ON p.id = s.plan_id
  WHERE public._billing_grant_ids_match(s.metadata, v_ids)
    AND p.key NOT IN ('legacy', 'trial')
  ORDER BY
    CASE WHEN s.status IN ('active', 'past_due') AND s.cancelled_at IS NULL THEN 0 ELSE 1 END,
    s.created_at DESC
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', 1,
      'organization_id', v_org,
      'kind', v_kind,
      'target_key', v_target,
      'matched_external_id', v_matched
    );
  END IF;

  SELECT
    g.organization_id,
    'addon'::TEXT AS kind,
    a.key AS target_key,
    COALESCE(g.metadata->>'external_id', g.metadata->>'checkout_session_id') AS matched_external_id
  INTO v_org, v_kind, v_target, v_matched
  FROM public.organization_addons g
  JOIN public.addons a ON a.id = g.addon_id
  WHERE public._billing_grant_ids_match(g.metadata, v_ids)
  ORDER BY
    CASE WHEN g.status = 'active' AND g.cancelled_at IS NULL THEN 0 ELSE 1 END,
    g.created_at DESC
  LIMIT 1;

  IF v_org IS NOT NULL THEN
    RETURN jsonb_build_object(
      'found', 1,
      'organization_id', v_org,
      'kind', v_kind,
      'target_key', v_target,
      'matched_external_id', v_matched
    );
  END IF;

  SELECT e.organization_id, e.event_type, e.payload
  INTO v_event
  FROM public.billing_events e
  WHERE e.provider = p_provider
    AND public._billing_payload_has_ids(e.payload, v_ids)
  ORDER BY e.processed_at DESC
  LIMIT 1;

  IF v_event.payload IS NULL THEN
    RETURN jsonb_build_object('found', 0);
  END IF;

  v_obj := COALESCE(v_event.payload->'data'->'object', '{}'::jsonb);
  v_meta := COALESCE(v_obj->'metadata', '{}'::jsonb);
  v_ref := COALESCE(v_meta->>'reference', v_obj->>'client_reference_id');
  v_matched := NULLIF(v_obj->>'id', '');

  BEGIN
    v_org := COALESCE(
      v_event.organization_id,
      NULLIF(v_meta->>'organization_id', '')::UUID,
      NULLIF(v_obj->>'client_reference_id', '')::UUID
    );
  EXCEPTION WHEN invalid_text_representation THEN
    v_org := v_event.organization_id;
  END;

  IF COALESCE(v_meta->>'kind', '') = 'addon' OR NULLIF(v_meta->>'addon_key', '') IS NOT NULL THEN
    v_kind := 'addon';
    v_target := NULLIF(v_meta->>'addon_key', '');
  ELSIF NULLIF(v_meta->>'plan_key', '') IS NOT NULL THEN
    v_kind := 'plan';
    v_target := NULLIF(v_meta->>'plan_key', '');
  ELSIF v_ref IS NOT NULL AND split_part(v_ref, ':', 2) = 'addon' THEN
    v_kind := 'addon';
    v_target := NULLIF(split_part(v_ref, ':', 3), '');
    BEGIN
      v_org := COALESCE(v_org, NULLIF(split_part(v_ref, ':', 1), '')::UUID);
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  ELSIF v_ref IS NOT NULL AND NULLIF(split_part(v_ref, ':', 2), '') IS NOT NULL THEN
    v_kind := 'plan';
    v_target := NULLIF(split_part(v_ref, ':', 2), '');
    BEGIN
      v_org := COALESCE(v_org, NULLIF(split_part(v_ref, ':', 1), '')::UUID);
    EXCEPTION WHEN invalid_text_representation THEN
      NULL;
    END;
  END IF;

  IF v_org IS NULL OR v_kind IS NULL THEN
    RETURN jsonb_build_object('found', 0);
  END IF;

  RETURN jsonb_build_object(
    'found', 1,
    'organization_id', v_org,
    'kind', v_kind,
    'target_key', v_target,
    'matched_external_id', v_matched
  );
END;
$$;


-- ===== billing_release_checkout_intents
CREATE OR REPLACE FUNCTION public.billing_release_checkout_intents(
  p_organization_id UUID,
  p_kind TEXT DEFAULT NULL,
  p_target_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_kind IS NOT NULL AND p_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;

  UPDATE public.billing_checkout_intents
  SET cancelled_at = timezone('utc', now())
  WHERE organization_id = p_organization_id
    AND consumed_at IS NULL
    AND cancelled_at IS NULL
    AND (p_kind IS NULL OR kind = p_kind)
    AND (
      p_target_key IS NULL
      OR p_kind = 'plan'
      OR target_key = p_target_key
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('released', v_count);
END;
$$;


-- ===== billing_reverse_paid_grant
CREATE OR REPLACE FUNCTION public.billing_reverse_paid_grant(
  p_organization_id UUID,
  p_kind TEXT,
  p_target_key TEXT DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'refunded',
  p_provider_ids TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
  v_name TEXT;
  v_reason TEXT;
  v_notice UUID;
  v_ids TEXT[];
  v_lookup JSONB;
  v_matched TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    NULL;
  ELSIF auth.role() = 'authenticated' THEN
    PERFORM public.require_platform_admin();
  ELSE
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;

  v_reason := COALESCE(NULLIF(trim(p_reason), ''), 'refunded');
  v_ids := public._billing_normalize_id_list(p_provider_ids, p_external_id);

  IF p_provider IS NOT NULL AND cardinality(v_ids) > 0 THEN
    v_lookup := public.billing_lookup_paid_grant_from_provider_ids(p_provider, v_ids);
    IF COALESCE(v_lookup->>'found', '0') = '1' THEN
      v_matched := NULLIF(v_lookup->>'matched_external_id', '');
      IF v_matched IS NOT NULL THEN
        v_ids := public._billing_normalize_id_list(v_ids, v_matched);
      END IF;
    END IF;
  END IF;

  IF p_kind = 'plan' THEN
    SELECT s.id, p.name
    INTO v_id, v_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.organization_id = p_organization_id
      AND s.status IN ('active', 'past_due')
      AND s.cancelled_at IS NULL
      AND p.key NOT IN ('legacy', 'trial')
      AND public._billing_grant_ids_match(s.metadata, v_ids)
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_subscriptions s2
        WHERE s2.organization_id = p_organization_id
          AND public._billing_grant_ids_match(s2.metadata, v_ids)
      )
    THEN
      RETURN jsonb_build_object('reversed', 0, 'kind', 'plan', 'already_closed', true);
    END IF;

    IF v_id IS NULL
      AND p_target_key IS NOT NULL
      AND p_target_key NOT IN ('legacy', 'trial')
      AND cardinality(v_ids) = 0
    THEN
      SELECT s.id, p.name
      INTO v_id, v_name
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = p_organization_id
        AND s.status IN ('active', 'past_due')
        AND s.cancelled_at IS NULL
        AND p.key = p_target_key
        AND (
          COALESCE(s.metadata->>'source', '') IN ('billing_checkout', 'billing_extend_paid_plan')
          OR COALESCE(s.metadata->>'external_id', '') <> ''
        )
      ORDER BY s.created_at DESC
      LIMIT 1;
    END IF;

    IF v_id IS NULL
      AND p_target_key IS NOT NULL
      AND p_target_key NOT IN ('legacy', 'trial')
      AND cardinality(v_ids) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_subscriptions s2
        WHERE s2.organization_id = p_organization_id
          AND public._billing_grant_ids_match(s2.metadata, v_ids)
      )
      AND (v_lookup IS NULL OR COALESCE(v_lookup->>'found', '0') <> '1')
    THEN
      SELECT s.id, p.name
      INTO v_id, v_name
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = p_organization_id
        AND s.status IN ('active', 'past_due')
        AND s.cancelled_at IS NULL
        AND p.key = p_target_key
      ORDER BY s.created_at DESC
      LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('reversed', 0, 'kind', 'plan');
    END IF;

    UPDATE public.organization_subscriptions
    SET
      status = 'expired',
      cancelled_at = COALESCE(cancelled_at, timezone('utc', now())),
      ends_at = timezone('utc', now()),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'status_source', 'billing_reverse_paid_grant',
        'reverse_reason', v_reason,
        'provider', p_provider,
        'reversed_at', timezone('utc', now())
      )
    WHERE id = v_id;

    v_notice := public.emit_plan_notification(
      p_organization_id,
      'plan_refunded',
      v_id,
      'El pago del plan fue revertido',
      format(
        'El proveedor reembolsó o contracargó el plan%s. Elegí uno para seguir usando los módulos.',
        CASE WHEN v_name IS NULL THEN '' ELSE ' ' || v_name END
      ),
      20
    );

    RETURN jsonb_build_object(
      'reversed', 1,
      'kind', 'plan',
      'subscription_id', v_id,
      'notice_id', v_notice
    );
  END IF;

  SELECT g.id, a.name
  INTO v_id, v_name
  FROM public.organization_addons g
  JOIN public.addons a ON a.id = g.addon_id
  WHERE g.organization_id = p_organization_id
    AND g.status = 'active'
    AND g.cancelled_at IS NULL
    AND public._billing_grant_ids_match(g.metadata, v_ids)
  ORDER BY g.created_at DESC
  LIMIT 1;

  IF v_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.organization_addons g2
      WHERE g2.organization_id = p_organization_id
        AND public._billing_grant_ids_match(g2.metadata, v_ids)
    )
  THEN
    RETURN jsonb_build_object('reversed', 0, 'kind', 'addon', 'already_closed', true);
  END IF;

  IF v_id IS NULL
    AND p_target_key IS NOT NULL
    AND cardinality(v_ids) = 0
  THEN
    SELECT g.id, a.name
    INTO v_id, v_name
    FROM public.organization_addons g
    JOIN public.addons a ON a.id = g.addon_id
    WHERE g.organization_id = p_organization_id
      AND g.status = 'active'
      AND g.cancelled_at IS NULL
      AND a.key = p_target_key
      AND (
        COALESCE(g.metadata->>'source', '') = 'billing_addon_checkout'
        OR COALESCE(g.metadata->>'external_id', '') <> ''
        OR g.reason = 'checkout'
      )
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NULL
    AND p_target_key IS NOT NULL
    AND cardinality(v_ids) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_addons g2
      WHERE g2.organization_id = p_organization_id
        AND public._billing_grant_ids_match(g2.metadata, v_ids)
    )
    AND (v_lookup IS NULL OR COALESCE(v_lookup->>'found', '0') <> '1')
  THEN
    SELECT g.id, a.name
    INTO v_id, v_name
    FROM public.organization_addons g
    JOIN public.addons a ON a.id = g.addon_id
    WHERE g.organization_id = p_organization_id
      AND g.status = 'active'
      AND g.cancelled_at IS NULL
      AND a.key = p_target_key
    ORDER BY g.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('reversed', 0, 'kind', 'addon');
  END IF;

  UPDATE public.organization_addons
  SET
    status = 'expired',
    cancelled_at = COALESCE(cancelled_at, timezone('utc', now())),
    ends_at = timezone('utc', now()),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'status_source', 'billing_reverse_paid_grant',
      'reverse_reason', v_reason,
      'provider', p_provider,
      'reversed_at', timezone('utc', now())
    )
  WHERE id = v_id;

  v_notice := public.emit_plan_notification(
    p_organization_id,
    'addon_refunded',
    v_id,
    format('El pago del extra%s fue revertido', CASE WHEN v_name IS NULL THEN '' ELSE ' ' || v_name END),
    'El proveedor reembolsó o contracargó el extra. Renovalo desde Configuración si lo necesitás.',
    20
  );

  RETURN jsonb_build_object(
    'reversed', 1,
    'kind', 'addon',
    'organization_addon_id', v_id,
    'notice_id', v_notice
  );
END;
$$;


-- ===== billing_set_own_checkout_intent_url
CREATE OR REPLACE FUNCTION public.billing_set_own_checkout_intent_url(
  p_id UUID,
  p_checkout_url TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_count INT;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_org := public.get_user_organization_id();
  IF v_org IS NULL OR p_id IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_checkout_url IS NULL OR p_checkout_url !~ '^https://' THEN
    RAISE EXCEPTION 'invalid checkout url';
  END IF;

  UPDATE public.billing_checkout_intents
  SET checkout_url = p_checkout_url
  WHERE id = p_id
    AND organization_id = v_org
    AND consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at > timezone('utc', now());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'checkout intent not open';
  END IF;

  RETURN jsonb_build_object('id', p_id, 'updated', v_count);
END;
$$;


-- ===== billing_set_subscription_status
CREATE OR REPLACE FUNCTION public.billing_set_subscription_status(
  p_organization_id UUID,
  p_status public.subscription_status,
  p_provider TEXT DEFAULT NULL,
  p_external_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service role only';
  END IF;

  IF p_status NOT IN ('past_due', 'cancelled', 'expired', 'active') THEN
    RAISE EXCEPTION 'invalid billing status';
  END IF;

  UPDATE public.organization_subscriptions
  SET
    status = p_status,
    cancelled_at = CASE
      WHEN p_status IN ('cancelled', 'expired') THEN COALESCE(cancelled_at, timezone('utc', now()))
      ELSE cancelled_at
    END,
    ends_at = CASE
      WHEN p_status IN ('cancelled', 'expired') THEN COALESCE(ends_at, timezone('utc', now()))
      ELSE ends_at
    END,
    metadata = CASE
      WHEN p_provider IS NULL THEN metadata
      ELSE metadata || jsonb_build_object(
        'provider', p_provider,
        'external_id', p_external_id,
        'status_source', 'billing_webhook'
      )
    END
  WHERE organization_id = p_organization_id
    AND status IN ('trialing', 'active', 'past_due')
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_count, 'status', p_status);
END;
$$;


-- ===== calculate_professional_settlement
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


-- ===== close_cash_session
CREATE OR REPLACE FUNCTION public.close_cash_session(
  p_session_id UUID,
  p_counted_cash NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_session public.cash_sessions%ROWTYPE;
  v_expected NUMERIC(14, 2);
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'El efectivo contado no puede ser negativo';
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

  IF v_session.status = 'cerrada' THEN
    RETURN jsonb_build_object(
      'cash_session_id', v_session.id,
      'status', v_session.status
    );
  END IF;

  v_expected := public.cash_session_expected_amount(v_session.id);

  UPDATE public.cash_sessions
  SET
    status = 'cerrada',
    expected_cash = v_expected,
    counted_cash = ROUND(p_counted_cash, 2),
    difference = ROUND(p_counted_cash, 2) - v_expected,
    close_notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
    closed_at = now(),
    closed_by = auth.uid()
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'cash_session_id', v_session.id,
    'expected_cash', v_expected,
    'counted_cash', ROUND(p_counted_cash, 2),
    'difference', ROUND(p_counted_cash, 2) - v_expected
  );
END;
$$;


-- ===== create_prescription
CREATE OR REPLACE FUNCTION public.create_prescription(
  p_patient_id UUID,
  p_owner_id UUID,
  p_branch_id UUID,
  p_items JSONB,
  p_consultation_id UUID DEFAULT NULL,
  p_clinical_entry_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_patient public.patients%ROWTYPE;
  v_branch public.branches%ROWTYPE;
  v_next INT;
  v_number TEXT;
  v_rx_id UUID;
  v_item JSONB;
  v_name TEXT;
  v_dose TEXT;
  v_frequency TEXT;
  v_duration TEXT;
  v_route TEXT;
  v_quantity NUMERIC(14, 3);
  v_product_id UUID;
  v_instructions TEXT;
  v_sort INT := 0;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'Agregá al menos un medicamento';
  END IF;

  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente no encontrado';
  END IF;

  IF v_patient.owner_id <> p_owner_id THEN
    RAISE EXCEPTION 'El propietario no coincide';
  END IF;

  SELECT * INTO v_branch
  FROM public.branches
  WHERE id = p_branch_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal no encontrada';
  END IF;

  INSERT INTO public.prescription_sequences (organization_id, last_number)
  VALUES (v_org_id, 0)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE public.prescription_sequences
  SET last_number = last_number + 1
  WHERE organization_id = v_org_id
  RETURNING last_number INTO v_next;

  v_number := 'R-' || lpad(v_next::TEXT, 6, '0');

  INSERT INTO public.prescriptions (
    organization_id,
    branch_id,
    patient_id,
    owner_id,
    consultation_id,
    clinical_entry_id,
    prescribed_by,
    status,
    number,
    notes,
    prescribed_at
  )
  VALUES (
    v_org_id,
    p_branch_id,
    p_patient_id,
    p_owner_id,
    p_consultation_id,
    p_clinical_entry_id,
    auth.uid(),
    'activa',
    v_number,
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    now()
  )
  RETURNING id INTO v_rx_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_name := NULLIF(btrim(COALESCE(v_item->>'medication_name', '')), '');
    v_dose := NULLIF(btrim(COALESCE(v_item->>'dose', '')), '');
    v_frequency := NULLIF(btrim(COALESCE(v_item->>'frequency', '')), '');
    v_duration := NULLIF(btrim(COALESCE(v_item->>'duration', '')), '');
    v_route := COALESCE(NULLIF(btrim(COALESCE(v_item->>'route', '')), ''), 'oral');
    v_instructions := NULLIF(btrim(COALESCE(v_item->>'instructions', '')), '');
    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::NUMERIC, 0);

    IF v_item->>'inventory_product_id' IS NULL OR btrim(v_item->>'inventory_product_id') = '' THEN
      v_product_id := NULL;
    ELSE
      v_product_id := (v_item->>'inventory_product_id')::UUID;
    END IF;

    IF v_name IS NULL OR char_length(v_name) > 160 THEN
      RAISE EXCEPTION 'Indicá el medicamento';
    END IF;
    IF v_dose IS NULL OR char_length(v_dose) > 80 THEN
      RAISE EXCEPTION 'Indicá la dosis';
    END IF;
    IF v_frequency IS NULL OR char_length(v_frequency) > 80 THEN
      RAISE EXCEPTION 'Indicá la frecuencia';
    END IF;
    IF v_quantity < 0 THEN
      RAISE EXCEPTION 'La cantidad no puede ser negativa';
    END IF;
    IF v_route NOT IN ('oral', 'sc', 'im', 'topico', 'oftalmico', 'otico', 'otro') THEN
      RAISE EXCEPTION 'Vía de administración inválida';
    END IF;

    IF v_product_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.inventory_products ip
        WHERE ip.id = v_product_id
          AND ip.organization_id = v_org_id
          AND ip.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION 'Producto de inventario no encontrado';
      END IF;
    END IF;

    INSERT INTO public.prescription_items (
      organization_id,
      prescription_id,
      inventory_product_id,
      medication_name,
      dose,
      frequency,
      duration,
      route,
      quantity,
      instructions,
      sort_order
    )
    VALUES (
      v_org_id,
      v_rx_id,
      v_product_id,
      v_name,
      v_dose,
      v_frequency,
      v_duration,
      v_route::public.prescription_route,
      v_quantity,
      v_instructions,
      v_sort
    );

    v_sort := v_sort + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'prescription_id', v_rx_id,
    'number', v_number
  );
END;
$$;


-- ===== create_waitlist_entry
CREATE OR REPLACE FUNCTION public.create_waitlist_entry(
  p_branch_id UUID,
  p_owner_id UUID,
  p_patient_id UUID,
  p_appointment_type public.appointment_type DEFAULT 'consulta',
  p_preferred_user_id UUID DEFAULT NULL,
  p_preferred_weekdays SMALLINT[] DEFAULT NULL,
  p_preferred_time_start TIME DEFAULT NULL,
  p_preferred_time_end TIME DEFAULT NULL,
  p_priority INT DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.appointment_waitlist%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para crear lista de espera';
  END IF;

  IF p_branch_id IS NULL OR p_owner_id IS NULL OR p_patient_id IS NULL THEN
    RAISE EXCEPTION 'branch_id, owner_id y patient_id son requeridos';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.owners o
    WHERE o.id = p_owner_id AND o.organization_id = v_org_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Tutor no encontrado';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = p_patient_id AND p.organization_id = v_org_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Paciente no encontrado';
  END IF;

  INSERT INTO public.appointment_waitlist (
    organization_id,
    branch_id,
    owner_id,
    patient_id,
    preferred_user_id,
    appointment_type,
    preferred_weekdays,
    preferred_time_start,
    preferred_time_end,
    priority,
    notes,
    status,
    created_by
  ) VALUES (
    v_org_id,
    p_branch_id,
    p_owner_id,
    p_patient_id,
    p_preferred_user_id,
    COALESCE(p_appointment_type, 'consulta'),
    p_preferred_weekdays,
    p_preferred_time_start,
    p_preferred_time_end,
    COALESCE(p_priority, 0),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    'open',
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'organization_id', v_row.organization_id,
    'branch_id', v_row.branch_id,
    'owner_id', v_row.owner_id,
    'patient_id', v_row.patient_id,
    'preferred_user_id', v_row.preferred_user_id,
    'appointment_type', v_row.appointment_type,
    'preferred_weekdays', to_jsonb(v_row.preferred_weekdays),
    'preferred_time_start', v_row.preferred_time_start,
    'preferred_time_end', v_row.preferred_time_end,
    'priority', v_row.priority,
    'notes', v_row.notes,
    'status', v_row.status,
    'created_at', v_row.created_at
  );
END;
$$;


-- ===== default_recommendation_priority_weights
CREATE OR REPLACE FUNCTION public.default_recommendation_priority_weights()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'critical', 40,
    'warning', 20,
    'info', 8,
    'usage_100', 25,
    'usage_90', 15,
    'usage_80', 8,
    'age_31', 30,
    'age_15', 18,
    'age_8', 10,
    'never_contacted', 15,
    'overdue_follow_up', 22,
    'unassigned', 12,
    'frozen_penalty', 35
  );
$$;


-- ===== dismiss_own_plan_recommendation_notice
CREATE OR REPLACE FUNCTION public.dismiss_own_plan_recommendation_notice()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_uid UUID;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_days INT;
BEGIN
  v_uid := auth.uid();
  v_org := public.get_user_organization_id();
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = v_org;

  IF NOT FOUND OR v_row.recommended_plan_key IS NULL THEN
    RETURN jsonb_build_object('dismissed', false);
  END IF;

  SELECT clinic_snooze_days INTO v_days
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_days IS NULL THEN
    v_days := 14;
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    clinic_dismissed_at = now(),
    clinic_dismissed_fingerprint = fingerprint,
    clinic_dismissed_by = v_uid,
    clinic_snooze_until = timezone('utc', now()) + make_interval(days => v_days),
    updated_at = now()
  WHERE organization_id = v_org
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    v_org,
    'clinic_dismissed',
    'clinic',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    'Clinic owner snoozed soft upgrade notice for ' || v_days::text || ' days'
  );

  RETURN jsonb_build_object(
    'dismissed', true,
    'clinic_snooze_until', v_row.clinic_snooze_until,
    'clinic_snooze_days', v_days
  );
END;
$$;


-- ===== dispense_prescription
CREATE OR REPLACE FUNCTION public.dispense_prescription(
  p_prescription_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_rx public.prescriptions%ROWTYPE;
  v_item public.prescription_items%ROWTYPE;
  v_product public.inventory_products%ROWTYPE;
  v_before NUMERIC(14, 3);
  v_after NUMERIC(14, 3);
  v_reason TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  SELECT * INTO v_rx
  FROM public.prescriptions
  WHERE id = p_prescription_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receta no encontrada';
  END IF;

  IF v_rx.status = 'dispensada' THEN
    RETURN jsonb_build_object(
      'prescription_id', v_rx.id,
      'number', v_rx.number,
      'status', v_rx.status
    );
  END IF;

  IF v_rx.status <> 'activa' THEN
    RAISE EXCEPTION 'Solo se pueden dispensar recetas activas';
  END IF;

  v_reason := 'Receta ' || COALESCE(v_rx.number, v_rx.id::TEXT);

  FOR v_item IN
    SELECT *
    FROM public.prescription_items
    WHERE prescription_id = v_rx.id
      AND deleted_at IS NULL
    ORDER BY sort_order ASC
  LOOP
    IF v_item.inventory_product_id IS NULL OR v_item.quantity <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_product
    FROM public.inventory_products
    WHERE id = v_item.inventory_product_id
      AND organization_id = v_org_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto no encontrado: %', v_item.medication_name;
    END IF;

    v_before := v_product.quantity;
    IF v_before < v_item.quantity THEN
      RAISE EXCEPTION 'Stock insuficiente de %', v_item.medication_name;
    END IF;

    v_after := v_before - v_item.quantity;

    UPDATE public.inventory_products
    SET quantity = v_after
    WHERE id = v_product.id;

    INSERT INTO public.inventory_movements (
      organization_id,
      branch_id,
      product_id,
      movement_type,
      quantity,
      quantity_before,
      quantity_after,
      reason,
      performed_by
    )
    VALUES (
      v_org_id,
      v_product.branch_id,
      v_product.id,
      'salida',
      v_item.quantity,
      v_before,
      v_after,
      v_reason,
      auth.uid()
    );
  END LOOP;

  UPDATE public.prescriptions
  SET
    status = 'dispensada',
    dispensed_at = now(),
    dispensed_by = auth.uid()
  WHERE id = v_rx.id;

  RETURN jsonb_build_object(
    'prescription_id', v_rx.id,
    'number', v_rx.number,
    'status', 'dispensada'
  );
END;
$$;


-- ===== emit_plan_notification
CREATE OR REPLACE FUNCTION public.emit_plan_notification(
  p_organization_id UUID,
  p_related_type TEXT,
  p_related_id UUID,
  p_title TEXT,
  p_body TEXT,
  p_dedupe_hours INT DEFAULT 20
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_organization_id IS NULL
    OR p_related_type IS NULL
    OR p_title IS NULL
    OR btrim(p_title) = ''
  THEN
    RETURN NULL;
  END IF;

  IF p_dedupe_hours IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.organization_id = p_organization_id
        AND n.deleted_at IS NULL
        AND n.kind = 'plan'
        AND n.related_type = p_related_type
        AND n.related_id IS NOT DISTINCT FROM p_related_id
        AND n.created_at >= timezone('utc', now()) - make_interval(hours => p_dedupe_hours)
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    organization_id,
    branch_id,
    kind,
    title,
    body,
    href,
    related_type,
    related_id
  )
  VALUES (
    p_organization_id,
    NULL,
    'plan',
    left(btrim(p_title), 160),
    NULLIF(left(btrim(COALESCE(p_body, '')), 500), ''),
    '/configuracion?tab=plan',
    left(btrim(p_related_type), 40),
    p_related_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ===== ensure_default_organization_subscription
CREATE OR REPLACE FUNCTION public.ensure_default_organization_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan RECORD;
  v_trial_days INT;
  v_trial_ends TIMESTAMPTZ;
BEGIN
  SELECT id, key, is_internal, metadata
  INTO v_plan
  FROM public.plans
  WHERE key = 'trial'
    AND is_active = true
  LIMIT 1;

  IF v_plan.id IS NULL THEN
    RAISE EXCEPTION 'onboarding plan "trial" is missing; cannot create organization subscription';
  END IF;

  IF v_plan.is_internal IS TRUE OR v_plan.key = 'legacy' THEN
    RAISE EXCEPTION 'refusing to auto-assign internal/legacy plan on organization create';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_subscriptions s
    WHERE s.organization_id = NEW.id
      AND s.status IN ('trialing', 'active')
      AND s.cancelled_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_trial_days := NULLIF(v_plan.metadata->>'default_trial_days', '')::INT;
  EXCEPTION WHEN others THEN
    v_trial_days := NULL;
  END;

  IF v_trial_days IS NOT NULL AND v_trial_days > 0 THEN
    v_trial_ends := timezone('utc', now()) + make_interval(days => v_trial_days);
  ELSE
    v_trial_ends := NULL;
  END IF;

  BEGIN
    INSERT INTO public.organization_subscriptions (
      organization_id, plan_id, status, starts_at, trial_ends_at, metadata
    )
    VALUES (
      NEW.id,
      v_plan.id,
      'trialing',
      timezone('utc', now()),
      v_trial_ends,
      jsonb_build_object(
        'source', 'signup_default_trial',
        'plan_key', 'trial',
        'trial_days_applied', v_trial_days
      )
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;


-- ===== get_open_cash_session
CREATE OR REPLACE FUNCTION public.get_open_cash_session(
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  opened_by UUID,
  closed_by UUID,
  status public.cash_session_status,
  opening_amount NUMERIC,
  expected_cash NUMERIC,
  counted_cash NUMERIC,
  difference NUMERIC,
  notes TEXT,
  close_notes TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  movement_count BIGINT,
  opened_by_name TEXT,
  closed_by_name TEXT,
  branch_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
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
    s.id,
    s.organization_id,
    s.branch_id,
    s.opened_by,
    s.closed_by,
    s.status,
    s.opening_amount,
    public.cash_session_expected_amount(s.id),
    s.counted_cash,
    s.difference,
    s.notes,
    s.close_notes,
    s.opened_at,
    s.closed_at,
    (
      SELECT COUNT(*)
      FROM public.cash_movements m
      WHERE m.cash_session_id = s.id AND m.deleted_at IS NULL
    ) AS movement_count,
    opener.full_name AS opened_by_name,
    closer.full_name AS closed_by_name,
    b.name AS branch_name,
    s.created_at,
    s.updated_at,
    s.deleted_at
  FROM public.cash_sessions s
  INNER JOIN public.branches b ON b.id = s.branch_id AND b.deleted_at IS NULL
  LEFT JOIN public.profiles opener ON opener.id = s.opened_by
  LEFT JOIN public.profiles closer ON closer.id = s.closed_by
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL
    AND s.status = 'abierta'
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
  ORDER BY s.opened_at DESC
  LIMIT 1;
END;
$$;


-- ===== get_public_check_in_status
CREATE OR REPLACE FUNCTION public.get_public_check_in_status(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash TEXT;
  v_row public.appointment_check_in_tokens%ROWTYPE;
  v_entry public.waiting_room_entries%ROWTYPE;
  v_patient_name TEXT;
  v_species public.patient_species;
  v_ahead INTEGER := 0;
  v_minutes_per_patient INTEGER;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'token_required');
  END IF;

  v_hash := encode(digest(btrim(p_token), 'sha256'), 'hex');

  SELECT * INTO v_row
  FROM public.appointment_check_in_tokens
  WHERE token_hash = v_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_row.redeemed_waiting_room_entry_id IS NOT NULL THEN
    SELECT * INTO v_entry
    FROM public.waiting_room_entries w
    WHERE w.id = v_row.redeemed_waiting_room_entry_id;
  ELSE
    SELECT * INTO v_entry
    FROM public.waiting_room_entries w
    WHERE w.appointment_id = v_row.appointment_id
      AND w.deleted_at IS NULL
    ORDER BY w.checked_in_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_entry.id IS NULL THEN
    IF v_row.redeemed_at IS NOT NULL THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'session_ended');
    END IF;
    IF v_row.expires_at <= now() THEN
      RETURN jsonb_build_object('valid', false, 'reason', 'expired');
    END IF;
    RETURN jsonb_build_object('valid', false, 'reason', 'not_checked_in');
  END IF;

  IF v_entry.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'session_ended');
  END IF;

  SELECT p.name, p.species
  INTO v_patient_name, v_species
  FROM public.patients p
  WHERE p.id = (
    SELECT a.patient_id
    FROM public.appointments a
    WHERE a.id = v_entry.appointment_id
  );

  IF v_entry.status = 'waiting' THEN
    SELECT COUNT(*)::INTEGER INTO v_ahead
    FROM public.waiting_room_entries w2
    WHERE w2.organization_id = v_entry.organization_id
      AND w2.branch_id = v_entry.branch_id
      AND w2.deleted_at IS NULL
      AND w2.status = 'waiting'
      AND (
        w2.priority > v_entry.priority
        OR (
          w2.priority = v_entry.priority
          AND COALESCE(w2.queue_position, 2147483647) < COALESCE(v_entry.queue_position, 2147483647)
        )
        OR (
          w2.priority = v_entry.priority
          AND COALESCE(w2.queue_position, 2147483647) = COALESCE(v_entry.queue_position, 2147483647)
          AND w2.checked_in_at < v_entry.checked_in_at
        )
      );
  END IF;

  SELECT COALESCE(
    (
      SELECT CASE
        WHEN (o.settings ? 'waitingRoomMinutesPerPatient')
          AND (o.settings->>'waitingRoomMinutesPerPatient') ~ '^[1-9][0-9]{0,2}$'
          AND (o.settings->>'waitingRoomMinutesPerPatient')::INTEGER BETWEEN 1 AND 120
        THEN (o.settings->>'waitingRoomMinutesPerPatient')::INTEGER
        ELSE NULL
      END
      FROM public.organizations o
      WHERE o.id = v_entry.organization_id
    ),
    (
      SELECT CASE
        WHEN avg_minutes IS NOT NULL AND avg_minutes > 0
        THEN LEAST(120, GREATEST(1, ROUND(avg_minutes)::INTEGER))
        ELSE NULL
      END
      FROM (
        SELECT AVG(
          EXTRACT(EPOCH FROM (w3.called_at - w3.checked_in_at)) / 60.0
        ) AS avg_minutes
        FROM public.waiting_room_entries w3
        WHERE w3.organization_id = v_entry.organization_id
          AND w3.branch_id = v_entry.branch_id
          AND w3.deleted_at IS NULL
          AND w3.called_at IS NOT NULL
          AND w3.called_at > w3.checked_in_at
          AND w3.checked_in_at >= (date_trunc('day', now() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires')
      ) measured
    ),
    15
  ) INTO v_minutes_per_patient;

  RETURN jsonb_build_object(
    'valid', true,
    'patient_name', v_patient_name,
    'patient_species', v_species,
    'waiting_room_status', v_entry.status::text,
    'queue_position', v_entry.queue_position,
    'room', v_entry.room,
    'ahead_count', v_ahead,
    'minutes_per_patient', v_minutes_per_patient,
    'checked_in_at', v_entry.checked_in_at,
    'terminal', v_entry.status = 'completed'
  );
END;
$$;


-- ===== get_recommendation_thresholds
CREATE OR REPLACE FUNCTION public.get_recommendation_thresholds()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.commercial_recommendation_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'info', 0.70,
      'warning', 0.85,
      'critical', 1.00,
      'clinic_snooze_days', 14
    );
  END IF;
  RETURN jsonb_build_object(
    'info', v_row.threshold_info,
    'warning', v_row.threshold_warning,
    'critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days
  );
END;
$$;


-- ===== list_active_prescriptions
CREATE OR REPLACE FUNCTION public.list_active_prescriptions(
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  prescribed_by UUID,
  dispensed_by UUID,
  voided_by UUID,
  status public.prescription_status,
  number TEXT,
  notes TEXT,
  void_reason TEXT,
  prescribed_at TIMESTAMPTZ,
  dispensed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  item_count BIGINT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  prescribed_by_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
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
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    rx.id,
    rx.organization_id,
    rx.branch_id,
    rx.patient_id,
    rx.owner_id,
    rx.consultation_id,
    rx.clinical_entry_id,
    rx.prescribed_by,
    rx.dispensed_by,
    rx.voided_by,
    rx.status,
    rx.number,
    rx.notes,
    rx.void_reason,
    rx.prescribed_at,
    rx.dispensed_at,
    rx.voided_at,
    (
      SELECT COUNT(*)
      FROM public.prescription_items i
      WHERE i.prescription_id = rx.id AND i.deleted_at IS NULL
    ) AS item_count,
    p.name AS patient_name,
    p.species AS patient_species,
    ow.full_name AS owner_full_name,
    pr.full_name AS prescribed_by_name,
    rx.created_at,
    rx.updated_at,
    rx.deleted_at
  FROM public.prescriptions rx
  INNER JOIN public.patients p ON p.id = rx.patient_id AND p.deleted_at IS NULL
  INNER JOIN public.owners ow ON ow.id = rx.owner_id AND ow.deleted_at IS NULL
  LEFT JOIN public.profiles pr ON pr.id = rx.prescribed_by
  WHERE rx.organization_id = v_org_id
    AND rx.deleted_at IS NULL
    AND rx.status = 'activa'
    AND (p_branch_id IS NULL OR rx.branch_id = p_branch_id)
  ORDER BY rx.prescribed_at ASC
  LIMIT 100;
END;
$$;


-- ===== list_cash_movements
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


-- ===== list_clinic_reminders
CREATE OR REPLACE FUNCTION public.list_clinic_reminders(
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_today DATE;
  v_horizon DATE;
  v_appointments JSONB := '[]'::jsonb;
  v_vaccinations JSONB := '[]'::jsonb;
  v_invoices JSONB := '[]'::jsonb;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT (
    public.has_permission('appointments:read')
    OR public.has_permission('clinical:read')
    OR public.has_permission('billing:read')
    OR public.has_permission('whatsapp:send')
  ) THEN
    RETURN jsonb_build_object(
      'appointments', '[]'::jsonb,
      'vaccinations', '[]'::jsonb,
      'invoices', '[]'::jsonb
    );
  END IF;

  v_today := (timezone('America/Argentina/Buenos_Aires', now()))::date;
  v_horizon := v_today + 30;

  IF public.has_permission('appointments:read') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_at ASC), '[]'::jsonb)
    INTO v_appointments
    FROM (
      SELECT
        a.id AS related_id,
        'appointment'::text AS reminder_type,
        a.owner_id,
        o.full_name AS owner_name,
        a.patient_id,
        p.name AS patient_name,
        o.phone_whatsapp,
        o.phone,
        a.starts_at AS due_at,
        COALESCE(NULLIF(btrim(a.title), ''), a.appointment_type::text) AS title,
        a.appointment_type::text AS appointment_type,
        a.status::text AS appointment_status,
        NULL::text AS vaccine_name,
        NULL::text AS due_status,
        NULL::text AS invoice_number,
        NULL::numeric AS balance,
        NULL::text AS currency
      FROM public.appointments a
      INNER JOIN public.owners o ON o.id = a.owner_id AND o.deleted_at IS NULL
      INNER JOIN public.patients p ON p.id = a.patient_id AND p.deleted_at IS NULL
      WHERE a.organization_id = v_org_id
        AND a.deleted_at IS NULL
        AND a.status IN ('programada', 'confirmada')
        AND a.starts_at >= now()
        AND a.starts_at < now() + interval '48 hours'
        AND (p_branch_id IS NULL OR a.branch_id = p_branch_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.reminder_logs rl
          WHERE rl.organization_id = v_org_id
            AND rl.deleted_at IS NULL
            AND rl.reminder_type = 'appointment'
            AND rl.related_id = a.id
        )
      ORDER BY a.starts_at ASC
      LIMIT 50
    ) r;
  END IF;

  IF public.has_permission('clinical:read') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_at ASC), '[]'::jsonb)
    INTO v_vaccinations
    FROM (
      SELECT
        latest.id AS related_id,
        'vaccination'::text AS reminder_type,
        latest.owner_id,
        latest.owner_name,
        latest.patient_id,
        latest.patient_name,
        latest.phone_whatsapp,
        latest.phone,
        latest.next_due_at::timestamptz AS due_at,
        latest.vaccine_name AS title,
        NULL::text AS appointment_type,
        NULL::text AS appointment_status,
        latest.vaccine_name,
        CASE
          WHEN latest.next_due_at < v_today THEN 'vencida'
          ELSE 'por_vencer'
        END AS due_status,
        NULL::text AS invoice_number,
        NULL::numeric AS balance,
        NULL::text AS currency
      FROM (
        SELECT DISTINCT ON (v.patient_id, lower(btrim(v.vaccine_name)))
          v.id,
          v.owner_id,
          v.patient_id,
          v.vaccine_name,
          v.next_due_at,
          p.name AS patient_name,
          o.full_name AS owner_name,
          o.phone_whatsapp,
          o.phone
        FROM public.vaccinations v
        INNER JOIN public.patients p
          ON p.id = v.patient_id
          AND p.deleted_at IS NULL
          AND p.is_deceased = false
          AND p.is_active = true
        INNER JOIN public.owners o ON o.id = v.owner_id AND o.deleted_at IS NULL
        WHERE v.organization_id = v_org_id
          AND v.deleted_at IS NULL
          AND v.next_due_at IS NOT NULL
          AND (p_branch_id IS NULL OR v.branch_id = p_branch_id)
        ORDER BY v.patient_id, lower(btrim(v.vaccine_name)), v.administered_at DESC, v.created_at DESC
      ) latest
      WHERE latest.next_due_at <= v_horizon
        AND NOT EXISTS (
          SELECT 1
          FROM public.reminder_logs rl
          WHERE rl.organization_id = v_org_id
            AND rl.deleted_at IS NULL
            AND rl.reminder_type = 'vaccination'
            AND rl.related_id = latest.id
        )
      ORDER BY latest.next_due_at ASC, latest.patient_name ASC
      LIMIT 50
    ) r;
  END IF;

  IF public.has_permission('billing:read') THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.due_at ASC), '[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT
        inv.id AS related_id,
        'invoice'::text AS reminder_type,
        inv.owner_id,
        o.full_name AS owner_name,
        inv.patient_id,
        p.name AS patient_name,
        o.phone_whatsapp,
        o.phone,
        COALESCE(inv.issued_at, inv.created_at) AS due_at,
        COALESCE(inv.number, 'Factura') AS title,
        NULL::text AS appointment_type,
        NULL::text AS appointment_status,
        NULL::text AS vaccine_name,
        NULL::text AS due_status,
        inv.number AS invoice_number,
        inv.balance,
        inv.currency
      FROM public.invoices inv
      INNER JOIN public.owners o ON o.id = inv.owner_id AND o.deleted_at IS NULL
      LEFT JOIN public.patients p ON p.id = inv.patient_id AND p.deleted_at IS NULL
      WHERE inv.organization_id = v_org_id
        AND inv.deleted_at IS NULL
        AND inv.status = 'emitida'
        AND inv.balance > 0
        AND (p_branch_id IS NULL OR inv.branch_id = p_branch_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.reminder_logs rl
          WHERE rl.organization_id = v_org_id
            AND rl.deleted_at IS NULL
            AND rl.reminder_type = 'invoice'
            AND rl.related_id = inv.id
        )
      ORDER BY COALESCE(inv.issued_at, inv.created_at) ASC
      LIMIT 50
    ) r;
  END IF;

  RETURN jsonb_build_object(
    'appointments', v_appointments,
    'vaccinations', v_vaccinations,
    'invoices', v_invoices
  );
END;
$$;


-- ===== list_own_addons
CREATE OR REPLACE FUNCTION public.list_own_addons()
RETURNS TABLE (
  addon_key TEXT,
  addon_name TEXT,
  description TEXT,
  status public.subscription_status,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
BEGIN
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT a.key, a.name, a.description, g.status, g.starts_at, g.ends_at
  FROM public.organization_addons g
  JOIN public.addons a ON a.id = g.addon_id
  WHERE g.organization_id = v_org
    AND g.status = 'active'
    AND g.cancelled_at IS NULL
    AND (g.starts_at IS NULL OR g.starts_at <= timezone('utc', now()))
    AND (g.ends_at IS NULL OR g.ends_at > timezone('utc', now()))
  ORDER BY a.display_order, a.key;
END;
$$;


-- ===== list_own_billing_events
CREATE OR REPLACE FUNCTION public.list_own_billing_events(p_limit INT DEFAULT 25)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  event_type TEXT,
  processed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_limit INT;
BEGIN
  IF NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50);

  RETURN QUERY
  SELECT e.id, e.provider, e.event_type, e.processed_at, e.applied_at
  FROM public.billing_events e
  WHERE e.organization_id = v_org
  ORDER BY e.processed_at DESC
  LIMIT v_limit;
END;
$$;


-- ===== list_own_open_checkout_intents
CREATE OR REPLACE FUNCTION public.list_own_open_checkout_intents()
RETURNS TABLE (
  id UUID,
  kind TEXT,
  target_key TEXT,
  billing_interval TEXT,
  provider TEXT,
  checkout_url TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
BEGIN
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM public._billing_expire_checkout_intents(v_org);

  RETURN QUERY
  SELECT
    i.id,
    i.kind,
    i.target_key,
    i.billing_interval,
    i.provider,
    i.checkout_url,
    i.expires_at
  FROM public.billing_checkout_intents i
  WHERE i.organization_id = v_org
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
    AND i.expires_at > timezone('utc', now())
  ORDER BY i.created_at DESC;
END;
$$;


-- ===== list_own_plan_recommendation_notice
CREATE OR REPLACE FUNCTION public.list_own_plan_recommendation_notice()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = v_org;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_row.status NOT IN ('recommended', 'reviewed') THEN
    RETURN NULL;
  END IF;
  IF v_row.recommended_plan_key IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_row.clinic_dismissed_at IS NOT NULL
     AND v_row.clinic_dismissed_fingerprint IS NOT DISTINCT FROM v_row.fingerprint THEN
    IF v_row.clinic_snooze_until IS NULL OR v_row.clinic_snooze_until > timezone('utc', now()) THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'current_plan_key', v_row.current_plan_key,
    'recommended_plan_key', v_row.recommended_plan_key,
    'severity', v_row.severity,
    'score', v_row.score,
    'usage_level', v_row.usage_level,
    'reasons', v_row.reasons,
    'fingerprint', v_row.fingerprint,
    'recommended_at', v_row.recommended_at
  );
END;
$$;


-- ===== list_owner_portal_alerts
CREATE OR REPLACE FUNCTION public.list_owner_portal_alerts(
  p_unread_only BOOLEAN DEFAULT true,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  body TEXT,
  href TEXT,
  related_type TEXT,
  related_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_lim INT := GREATEST(1, LEAST(COALESCE(p_limit, 20), 50));
BEGIN
  IF v_uid IS NULL OR public.get_portal_owner_id() IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.body,
    a.href,
    a.related_type,
    a.related_id,
    a.read_at,
    a.created_at
  FROM public.owner_portal_alerts a
  WHERE a.portal_user_id = v_uid
    AND (NOT COALESCE(p_unread_only, true) OR a.read_at IS NULL)
  ORDER BY a.created_at DESC
  LIMIT v_lim;
END;
$$;


-- ===== list_plan_seat_limits
CREATE OR REPLACE FUNCTION public.list_plan_seat_limits(p_plan_key TEXT)
RETURNS TABLE (
  feature_key TEXT,
  enabled BOOLEAN,
  limit_value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();
  IF p_plan_key IS NULL OR p_plan_key NOT IN ('trial', 'basic', 'pro', 'premium', 'enterprise') THEN
    RAISE EXCEPTION 'plan is not assignable';
  END IF;

  RETURN QUERY
  SELECT f.key, pf.enabled, pf.limit_value
  FROM public.plans p
  JOIN public.plan_features pf ON pf.plan_id = p.id
  JOIN public.features f ON f.id = pf.feature_id
  WHERE p.key = p_plan_key
    AND p.is_active = true
    AND p.is_internal = false
    AND f.is_active = true
    AND f.feature_type = 'limit'
    AND f.key IN ('users.max', 'branches.max', 'professionals.max', 'patients.max');
END;
$$;


-- ===== list_professional_settlements
CREATE OR REPLACE FUNCTION public.list_professional_settlements(
  p_professional_id UUID DEFAULT NULL,
  p_status public.settlement_status DEFAULT NULL,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
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
  v_page INTEGER := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size INTEGER := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_offset INTEGER;
  v_total BIGINT;
  v_rows JSONB;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('professional_settlements:read') THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', v_page, 'page_size', v_page_size);
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'total', 0, 'page', v_page, 'page_size', v_page_size);
  END IF;

  v_offset := (v_page - 1) * v_page_size;

  SELECT COUNT(*)
  INTO v_total
  FROM public.professional_settlements s
  WHERE s.organization_id = v_org_id
    AND s.deleted_at IS NULL
    AND (p_professional_id IS NULL OR s.professional_id = p_professional_id)
    AND (p_status IS NULL OR s.status = p_status)
    AND (p_period_start IS NULL OR s.period_end >= p_period_start)
    AND (p_period_end IS NULL OR s.period_start <= p_period_end)
    AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
    AND (
      s.branch_id IS NULL
      OR public.user_has_branch_access(s.branch_id)
    );

  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.period_end DESC, x.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT s.*
    FROM public.professional_settlements s
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND (p_professional_id IS NULL OR s.professional_id = p_professional_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND (p_period_start IS NULL OR s.period_end >= p_period_start)
      AND (p_period_end IS NULL OR s.period_start <= p_period_end)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND (
        s.branch_id IS NULL
        OR public.user_has_branch_access(s.branch_id)
      )
    ORDER BY s.period_end DESC, s.created_at DESC
    LIMIT v_page_size
    OFFSET v_offset
  ) x;

  RETURN jsonb_build_object(
    'items', v_rows,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;


-- ===== list_public_addons
CREATE OR REPLACE FUNCTION public.list_public_addons()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'key', a.key,
        'name', a.name,
        'description', a.description,
        'display_order', a.display_order,
        'pricing', COALESCE(a.metadata->'pricing', '{}'::jsonb)
      )
      ORDER BY a.display_order, a.key
    ),
    '[]'::jsonb
  )
  FROM public.addons a
  WHERE a.is_active = true
    AND a.is_public = true;
$$;


-- ===== list_waiting_room_statuses_for_date
CREATE OR REPLACE FUNCTION public.list_waiting_room_statuses_for_date(
  p_date DATE,
  p_branch_id UUID DEFAULT NULL
)
RETURNS TABLE (
  appointment_id UUID,
  waiting_room_status public.waiting_room_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('waiting_room:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_day_start := (p_date::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_day_end := ((p_date + 1)::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  RETURN QUERY
  SELECT
    a.id AS appointment_id,
    w.status AS waiting_room_status
  FROM public.waiting_room_entries w
  INNER JOIN public.appointments a
    ON a.id = w.appointment_id
   AND a.deleted_at IS NULL
   AND a.organization_id = v_org_id
  WHERE w.organization_id = v_org_id
    AND a.starts_at >= v_day_start
    AND a.starts_at < v_day_end
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id OR a.branch_id = p_branch_id)
  ORDER BY a.starts_at ASC;
END;
$$;


-- ===== list_waitlist
CREATE OR REPLACE FUNCTION public.list_waitlist(
  p_branch_id UUID DEFAULT NULL,
  p_status public.waitlist_status DEFAULT NULL
)
RETURNS SETOF public.appointment_waitlist
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_branch_id IS NOT NULL AND NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT w.*
  FROM public.appointment_waitlist w
  WHERE w.organization_id = v_org_id
    AND w.deleted_at IS NULL
    AND public.user_has_branch_access(w.branch_id)
    AND (p_branch_id IS NULL OR w.branch_id = p_branch_id)
    AND (p_status IS NULL OR w.status = p_status)
  ORDER BY w.priority DESC, w.created_at ASC;
END;
$$;


-- ===== mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  v_org_id := public.get_user_organization_id();
  v_user_id := auth.uid();
  IF v_org_id IS NULL OR v_user_id IS NULL OR NOT public.is_clinic_staff() THEN
    RAISE EXCEPTION 'Sin permisos';
  END IF;

  INSERT INTO public.notification_reads (notification_id, user_id)
  SELECT n.id, v_user_id
  FROM public.notifications n
  LEFT JOIN public.notification_reads r
    ON r.notification_id = n.id AND r.user_id = v_user_id
  WHERE n.organization_id = v_org_id
    AND n.deleted_at IS NULL
    AND r.read_at IS NULL
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ===== mark_owner_portal_alerts_read
CREATE OR REPLACE FUNCTION public.mark_owner_portal_alerts_read(p_ids UUID[] DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_count INT := 0;
BEGIN
  IF v_uid IS NULL OR public.get_portal_owner_id() IS NULL THEN
    RETURN 0;
  END IF;

  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    UPDATE public.owner_portal_alerts
    SET read_at = now()
    WHERE portal_user_id = v_uid
      AND read_at IS NULL;
  ELSE
    UPDATE public.owner_portal_alerts
    SET read_at = now()
    WHERE portal_user_id = v_uid
      AND read_at IS NULL
      AND id = ANY (p_ids);
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ===== mark_reminder
CREATE OR REPLACE FUNCTION public.mark_reminder(
  p_reminder_type TEXT,
  p_related_id UUID,
  p_status TEXT,
  p_whatsapp_message_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_type public.reminder_type;
  v_status public.reminder_status;
  v_channel public.reminder_channel;
  v_owner_id UUID;
  v_patient_id UUID;
  v_branch_id UUID;
  v_due_on DATE;
  v_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('whatsapp:send') THEN
    RAISE EXCEPTION 'No tenés permisos para registrar recordatorios';
  END IF;

  IF p_reminder_type NOT IN ('appointment', 'vaccination', 'invoice') THEN
    RAISE EXCEPTION 'Tipo de recordatorio inválido';
  END IF;

  IF p_status NOT IN ('enviado', 'omitido') THEN
    RAISE EXCEPTION 'Estado de recordatorio inválido';
  END IF;

  v_type := p_reminder_type::public.reminder_type;
  v_status := p_status::public.reminder_status;
  v_channel := CASE WHEN p_status = 'enviado' THEN 'whatsapp'::public.reminder_channel ELSE 'omitido'::public.reminder_channel END;

  IF v_type = 'appointment' THEN
    SELECT a.owner_id, a.patient_id, a.branch_id, (timezone('America/Argentina/Buenos_Aires', a.starts_at))::date
    INTO v_owner_id, v_patient_id, v_branch_id, v_due_on
    FROM public.appointments a
    WHERE a.id = p_related_id
      AND a.organization_id = v_org_id
      AND a.deleted_at IS NULL;
  ELSIF v_type = 'vaccination' THEN
    SELECT v.owner_id, v.patient_id, v.branch_id, v.next_due_at
    INTO v_owner_id, v_patient_id, v_branch_id, v_due_on
    FROM public.vaccinations v
    WHERE v.id = p_related_id
      AND v.organization_id = v_org_id
      AND v.deleted_at IS NULL;
  ELSE
    SELECT inv.owner_id, inv.patient_id, inv.branch_id, COALESCE(inv.due_at, (timezone('America/Argentina/Buenos_Aires', COALESCE(inv.issued_at, inv.created_at)))::date)
    INTO v_owner_id, v_patient_id, v_branch_id, v_due_on
    FROM public.invoices inv
    WHERE inv.id = p_related_id
      AND inv.organization_id = v_org_id
      AND inv.deleted_at IS NULL;
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Recordatorio no encontrado';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.reminder_logs rl
    WHERE rl.organization_id = v_org_id
      AND rl.deleted_at IS NULL
      AND rl.reminder_type = v_type
      AND rl.related_id = p_related_id
  ) THEN
    RAISE EXCEPTION 'Ya se registró este recordatorio';
  END IF;

  INSERT INTO public.reminder_logs (
    organization_id,
    branch_id,
    reminder_type,
    related_id,
    owner_id,
    patient_id,
    channel,
    status,
    due_on,
    whatsapp_message_id,
    sent_by
  ) VALUES (
    v_org_id,
    v_branch_id,
    v_type,
    p_related_id,
    v_owner_id,
    v_patient_id,
    v_channel,
    v_status,
    v_due_on,
    p_whatsapp_message_id,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;


-- ===== match_waitlist_for_slot
CREATE OR REPLACE FUNCTION public.match_waitlist_for_slot(
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_branch_id UUID,
  p_assigned_user_id UUID DEFAULT NULL,
  p_appointment_type public.appointment_type DEFAULT NULL
)
RETURNS SETOF public.appointment_waitlist
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_local_start TIMESTAMP;
  v_weekday SMALLINT;
  v_start_time TIME;
  v_end_time TIME;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:read') THEN
    RETURN;
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_branch_id IS NULL THEN
    RAISE EXCEPTION 'starts_at, ends_at y branch_id son requeridos';
  END IF;

  IF NOT public.user_has_branch_access(p_branch_id) THEN
    RETURN;
  END IF;

  v_local_start := (p_starts_at AT TIME ZONE 'America/Argentina/Buenos_Aires');
  v_weekday := EXTRACT(ISODOW FROM v_local_start)::SMALLINT;
  v_start_time := v_local_start::TIME;
  v_end_time := (p_ends_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::TIME;

  RETURN QUERY
  SELECT w.*
  FROM public.appointment_waitlist w
  WHERE w.organization_id = v_org_id
    AND w.branch_id = p_branch_id
    AND w.deleted_at IS NULL
    AND w.status = 'open'
    AND (p_appointment_type IS NULL OR w.appointment_type = p_appointment_type)
    AND (
      w.preferred_user_id IS NULL
      OR p_assigned_user_id IS NULL
      OR w.preferred_user_id = p_assigned_user_id
    )
    AND (
      w.preferred_weekdays IS NULL
      OR cardinality(w.preferred_weekdays) = 0
      OR v_weekday = ANY (w.preferred_weekdays)
    )
    AND (
      w.preferred_time_start IS NULL
      OR w.preferred_time_end IS NULL
      OR (
        v_start_time >= w.preferred_time_start
        AND v_end_time <= w.preferred_time_end
      )
    )
  ORDER BY w.priority DESC, w.created_at ASC;
END;
$$;


-- ===== normalize_commercial_tags
CREATE OR REPLACE FUNCTION public.normalize_commercial_tags(p_tags TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_raw TEXT;
  v_tag TEXT;
  v_out TEXT[] := '{}'::TEXT[];
BEGIN
  IF p_tags IS NULL THEN
    RETURN '{}'::TEXT[];
  END IF;

  FOREACH v_raw IN ARRAY p_tags LOOP
    v_tag := lower(btrim(COALESCE(v_raw, '')));
    v_tag := regexp_replace(v_tag, '\s+', '-', 'g');
    v_tag := regexp_replace(v_tag, '[^a-z0-9_-]', '', 'g');
    v_tag := left(v_tag, 32);
    IF v_tag <> '' AND NOT (v_tag = ANY (v_out)) THEN
      v_out := array_append(v_out, v_tag);
    END IF;
    EXIT WHEN cardinality(v_out) >= 12;
  END LOOP;

  RETURN v_out;
END;
$$;


-- ===== normalize_recommendation_priority_weights
CREATE OR REPLACE FUNCTION public.normalize_recommendation_priority_weights(p_weights JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_defaults JSONB := public.default_recommendation_priority_weights();
  v_key TEXT;
  v_val NUMERIC;
  v_out JSONB := '{}'::JSONB;
BEGIN
  IF p_weights IS NULL OR jsonb_typeof(p_weights) <> 'object' THEN
    RETURN v_defaults;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_defaults) LOOP
    BEGIN
      v_val := NULLIF(p_weights ->> v_key, '')::NUMERIC;
    EXCEPTION WHEN OTHERS THEN
      v_val := NULL;
    END;
    IF v_val IS NULL OR v_val < 0 OR v_val > 200 THEN
      v_val := (v_defaults ->> v_key)::NUMERIC;
    END IF;
    v_out := v_out || jsonb_build_object(v_key, ROUND(v_val)::INT);
  END LOOP;

  RETURN v_out;
END;
$$;


-- ===== open_cash_session
CREATE OR REPLACE FUNCTION public.open_cash_session(
  p_branch_id UUID,
  p_opening_amount NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_session_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_opening_amount IS NULL OR p_opening_amount < 0 THEN
    RAISE EXCEPTION 'El fondo inicial no puede ser negativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.branches b
    WHERE b.id = p_branch_id
      AND b.organization_id = v_org_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Sucursal no encontrada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.cash_sessions s
    WHERE s.organization_id = v_org_id
      AND s.branch_id = p_branch_id
      AND s.status = 'abierta'
      AND s.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya hay una caja abierta en esta sucursal';
  END IF;

  INSERT INTO public.cash_sessions (
    organization_id,
    branch_id,
    opened_by,
    status,
    opening_amount,
    notes,
    opened_at
  )
  VALUES (
    v_org_id,
    p_branch_id,
    auth.uid(),
    'abierta',
    ROUND(p_opening_amount, 2),
    NULLIF(btrim(COALESCE(p_notes, '')), ''),
    now()
  )
  RETURNING id INTO v_session_id;

  RETURN jsonb_build_object('cash_session_id', v_session_id);
END;
$$;


-- ===== organization_metered_overages
CREATE OR REPLACE FUNCTION public.organization_metered_overages(p_organization_id UUID)
RETURNS TABLE (
  feature_key TEXT,
  used BIGINT,
  limit_value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan_id UUID;
  v_period_start DATE;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT s.plan_id
  INTO v_plan_id
  FROM public.organization_subscriptions s
  WHERE s.organization_id = p_organization_id
    AND s.status IN ('trialing', 'active', 'past_due')
    AND s.cancelled_at IS NULL
  ORDER BY s.created_at DESC
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  v_period_start := date_trunc('month', timezone('utc', now()))::date;

  RETURN QUERY
  SELECT
    q.feature_key,
    q.used,
    q.limit_value
  FROM (
    SELECT
      f.key AS feature_key,
      fu.usage_count AS used,
      CASE
        WHEN ovr.enabled IS TRUE THEN ovr.limit_value
        WHEN COALESCE(pf.enabled, false) OR COALESCE(ad.enabled, false) THEN
          CASE
            WHEN (COALESCE(pf.enabled, false) AND pf.limit_value IS NULL)
              OR (COALESCE(ad.enabled, false) AND ad.limit_value IS NULL)
            THEN NULL
            ELSE GREATEST(
              CASE WHEN COALESCE(pf.enabled, false) THEN COALESCE(pf.limit_value, 0) ELSE 0 END,
              CASE WHEN COALESCE(ad.enabled, false) THEN COALESCE(ad.limit_value, 0) ELSE 0 END
            )
          END
        ELSE f.default_limit
      END AS limit_value
    FROM public.features f
    JOIN public.feature_usage fu
      ON fu.feature_id = f.id
     AND fu.organization_id = p_organization_id
     AND fu.period_start = v_period_start
    LEFT JOIN public.plan_features pf
      ON pf.plan_id = v_plan_id
     AND pf.feature_id = f.id
    LEFT JOIN LATERAL (
      SELECT ov.limit_value, ov.enabled
      FROM public.organization_feature_overrides ov
      WHERE ov.organization_id = p_organization_id
        AND ov.feature_id = f.id
        AND (ov.starts_at IS NULL OR ov.starts_at <= timezone('utc', now()))
        AND (ov.ends_at IS NULL OR ov.ends_at > timezone('utc', now()))
      ORDER BY ov.created_at DESC
      LIMIT 1
    ) ovr ON true
    LEFT JOIN LATERAL (
      SELECT
        bool_or(af.enabled) AS enabled,
        CASE
          WHEN bool_or(af.enabled AND af.limit_value IS NULL) THEN NULL
          ELSE MAX(af.limit_value) FILTER (WHERE af.enabled)
        END AS limit_value
      FROM public.organization_addons g
      JOIN public.addons a ON a.id = g.addon_id AND a.is_active = true
      JOIN public.addon_features af ON af.addon_id = g.addon_id AND af.feature_id = f.id
      WHERE g.organization_id = p_organization_id
        AND g.status = 'active'
        AND g.cancelled_at IS NULL
        AND (g.starts_at IS NULL OR g.starts_at <= timezone('utc', now()))
        AND (g.ends_at IS NULL OR g.ends_at > timezone('utc', now()))
    ) ad ON true
    WHERE f.usage_metered = true
      AND f.is_active = true
      AND f.feature_type = 'limit'
      AND (ovr.enabled IS NULL OR ovr.enabled IS TRUE)
  ) q
  WHERE q.limit_value IS NOT NULL
    AND q.limit_value > 0
    AND q.used > q.limit_value;
END;
$$;


-- ===== prevent_unintended_legacy_assignment
CREATE OR REPLACE FUNCTION public.prevent_unintended_legacy_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT p.key INTO v_key
  FROM public.plans p
  WHERE p.id = NEW.plan_id;

  IF v_key IS DISTINCT FROM 'legacy' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.metadata->>'source', '') = 'phase1_legacy_backfill' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.metadata->>'assign_legacy_explicit', '') IN ('true', '1') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'legacy plan is migration-only; assignment requires metadata.assign_legacy_explicit';
END;
$$;


-- ===== protect_legacy_plan_catalog
CREATE OR REPLACE FUNCTION public.protect_legacy_plan_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.key = 'legacy' AND (NEW.is_internal IS NOT TRUE OR NEW.is_public IS TRUE) THEN
    RAISE EXCEPTION 'legacy plan must remain is_internal=true and is_public=false';
  END IF;
  RETURN NEW;
END;
$$;


-- ===== recommendation_commercial_priority
CREATE OR REPLACE FUNCTION public.recommendation_commercial_priority(
  p_now TIMESTAMPTZ,
  p_severity TEXT,
  p_usage_level NUMERIC,
  p_age_days INT,
  p_last_contacted_at TIMESTAMPTZ,
  p_follow_up_at TIMESTAMPTZ,
  p_is_frozen BOOLEAN,
  p_assigned_to UUID,
  p_weights JSONB DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_w JSONB := public.normalize_recommendation_priority_weights(p_weights);
  v_priority INT := 0;
BEGIN
  IF p_severity = 'critical' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'critical')::INT, 40);
  ELSIF p_severity = 'warning' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'warning')::INT, 20);
  ELSIF p_severity = 'info' THEN
    v_priority := v_priority + COALESCE((v_w ->> 'info')::INT, 8);
  END IF;

  IF p_usage_level IS NOT NULL THEN
    IF p_usage_level >= 1.0 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_100')::INT, 25);
    ELSIF p_usage_level >= 0.9 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_90')::INT, 15);
    ELSIF p_usage_level >= 0.8 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'usage_80')::INT, 8);
    END IF;
  END IF;

  IF p_age_days IS NOT NULL THEN
    IF p_age_days >= 31 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_31')::INT, 30);
    ELSIF p_age_days >= 15 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_15')::INT, 18);
    ELSIF p_age_days >= 8 THEN
      v_priority := v_priority + COALESCE((v_w ->> 'age_8')::INT, 10);
    END IF;
  END IF;

  IF p_last_contacted_at IS NULL THEN
    v_priority := v_priority + COALESCE((v_w ->> 'never_contacted')::INT, 15);
  END IF;

  IF p_follow_up_at IS NOT NULL AND p_follow_up_at < p_now THEN
    v_priority := v_priority + COALESCE((v_w ->> 'overdue_follow_up')::INT, 22);
  END IF;

  IF p_assigned_to IS NULL THEN
    v_priority := v_priority + COALESCE((v_w ->> 'unassigned')::INT, 12);
  END IF;

  IF COALESCE(p_is_frozen, false) THEN
    v_priority := GREATEST(
      0,
      v_priority - COALESCE((v_w ->> 'frozen_penalty')::INT, 35)
    );
  END IF;

  RETURN v_priority;
END;
$$;


-- ===== recommendation_commercial_priority_reasons
CREATE OR REPLACE FUNCTION public.recommendation_commercial_priority_reasons(
  p_now TIMESTAMPTZ,
  p_severity TEXT,
  p_usage_level NUMERIC,
  p_age_days INT,
  p_last_contacted_at TIMESTAMPTZ,
  p_follow_up_at TIMESTAMPTZ,
  p_is_frozen BOOLEAN,
  p_assigned_to UUID
)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_reasons TEXT[] := '{}'::TEXT[];
BEGIN
  IF p_severity = 'critical' THEN
    v_reasons := array_append(v_reasons, 'critical');
  ELSIF p_severity = 'warning' THEN
    v_reasons := array_append(v_reasons, 'warning');
  END IF;

  IF p_usage_level IS NOT NULL AND p_usage_level >= 1.0 THEN
    v_reasons := array_append(v_reasons, 'uso >= 100%');
  ELSIF p_usage_level IS NOT NULL AND p_usage_level >= 0.9 THEN
    v_reasons := array_append(v_reasons, 'uso >= 90%');
  END IF;

  IF p_age_days IS NOT NULL AND p_age_days >= 31 THEN
    v_reasons := array_append(v_reasons, '31+ días');
  ELSIF p_age_days IS NOT NULL AND p_age_days >= 15 THEN
    v_reasons := array_append(v_reasons, '15–30 días');
  END IF;

  IF p_last_contacted_at IS NULL THEN
    v_reasons := array_append(v_reasons, 'sin contacto');
  END IF;

  IF p_follow_up_at IS NOT NULL AND p_follow_up_at < p_now THEN
    v_reasons := array_append(v_reasons, 'follow-up vencido');
  END IF;

  IF p_assigned_to IS NULL THEN
    v_reasons := array_append(v_reasons, 'sin responsable');
  END IF;

  IF COALESCE(p_is_frozen, false) THEN
    v_reasons := array_append(v_reasons, 'congelada');
  END IF;

  RETURN v_reasons;
END;
$$;


-- ===== recommendation_commercial_touch_at
CREATE OR REPLACE FUNCTION public.recommendation_commercial_touch_at(
  p_last_contacted_at TIMESTAMPTZ,
  p_last_refreshed_at TIMESTAMPTZ,
  p_recommended_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ
)
RETURNS TIMESTAMPTZ
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at);
$$;


-- ===== recommendation_is_commercially_snoozed
CREATE OR REPLACE FUNCTION public.recommendation_is_commercially_snoozed(
  p_snooze_until TIMESTAMPTZ,
  p_now TIMESTAMPTZ DEFAULT timezone('utc', now())
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_snooze_until IS NOT NULL AND p_snooze_until > p_now;
$$;


-- ===== recommendation_open_age_days
CREATE OR REPLACE FUNCTION public.recommendation_open_age_days(
  p_now TIMESTAMPTZ,
  p_last_contacted_at TIMESTAMPTZ,
  p_last_refreshed_at TIMESTAMPTZ,
  p_recommended_at TIMESTAMPTZ,
  p_updated_at TIMESTAMPTZ
)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN public.recommendation_commercial_touch_at(
      p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at
    ) IS NULL THEN NULL
    ELSE GREATEST(
      0,
      FLOOR(
        EXTRACT(EPOCH FROM (
          p_now - public.recommendation_commercial_touch_at(
            p_last_contacted_at, p_last_refreshed_at, p_recommended_at, p_updated_at
          )
        )) / 86400.0
      )::INT
    )
  END;
$$;


-- ===== recommendation_trends_window
CREATE OR REPLACE FUNCTION public.recommendation_trends_window(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contacted INT := 0;
  v_noted INT := 0;
  v_assigned INT := 0;
  v_unassigned INT := 0;
  v_tagged INT := 0;
  v_follow_up_set INT := 0;
  v_frozen INT := 0;
  v_unfrozen INT := 0;
  v_outcome_won INT := 0;
  v_outcome_lost INT := 0;
  v_outcome_deferred INT := 0;
  v_outcome_not_a_fit INT := 0;
  v_closed INT := 0;
  v_win_rate NUMERIC;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'invalid trend window';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'contacted'),
    COUNT(*) FILTER (WHERE e.event_type = 'noted'),
    COUNT(*) FILTER (WHERE e.event_type = 'assigned'),
    COUNT(*) FILTER (WHERE e.event_type = 'unassigned'),
    COUNT(*) FILTER (WHERE e.event_type = 'tagged'),
    COUNT(*) FILTER (WHERE e.event_type = 'follow_up_set'),
    COUNT(*) FILTER (WHERE e.event_type = 'frozen'),
    COUNT(*) FILTER (WHERE e.event_type = 'unfrozen')
  INTO
    v_contacted,
    v_noted,
    v_assigned,
    v_unassigned,
    v_tagged,
    v_follow_up_set,
    v_frozen,
    v_unfrozen
  FROM public.organization_plan_recommendation_events e
  JOIN public.organizations o ON o.id = e.organization_id
  WHERE o.deleted_at IS NULL
    AND e.created_at >= p_from
    AND e.created_at < p_to;

  SELECT
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit')
  INTO
    v_outcome_won,
    v_outcome_lost,
    v_outcome_deferred,
    v_outcome_not_a_fit
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE o.deleted_at IS NULL
    AND r.commercial_outcome_at IS NOT NULL
    AND r.commercial_outcome_at >= p_from
    AND r.commercial_outcome_at < p_to
    AND r.commercial_outcome IN ('won', 'lost', 'deferred', 'not_a_fit');

  v_closed := COALESCE(v_outcome_won, 0) + COALESCE(v_outcome_lost, 0) + COALESCE(v_outcome_not_a_fit, 0);
  v_win_rate := CASE
    WHEN v_closed > 0 THEN ROUND((COALESCE(v_outcome_won, 0)::NUMERIC / v_closed::NUMERIC) * 100, 1)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'contacted', COALESCE(v_contacted, 0),
    'noted', COALESCE(v_noted, 0),
    'assigned', COALESCE(v_assigned, 0),
    'unassigned', COALESCE(v_unassigned, 0),
    'tagged', COALESCE(v_tagged, 0),
    'follow_up_set', COALESCE(v_follow_up_set, 0),
    'frozen', COALESCE(v_frozen, 0),
    'unfrozen', COALESCE(v_unfrozen, 0),
    'outcome_won', COALESCE(v_outcome_won, 0),
    'outcome_lost', COALESCE(v_outcome_lost, 0),
    'outcome_deferred', COALESCE(v_outcome_deferred, 0),
    'outcome_not_a_fit', COALESCE(v_outcome_not_a_fit, 0),
    'closed_decisions', v_closed,
    'win_rate_pct', v_win_rate
  );
END;
$$;


-- ===== record_commercial_feature_signal
CREATE OR REPLACE FUNCTION public.record_commercial_feature_signal(
  p_feature_key TEXT,
  p_event_type TEXT DEFAULT 'feature_denied'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_uid UUID;
  v_id UUID;
  v_day DATE;
BEGIN
  v_uid := auth.uid();
  v_org := public.get_user_organization_id();
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'feature required';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('feature_denied', 'feature_interest', 'feature_used') THEN
    p_event_type := 'feature_denied';
  END IF;

  v_day := (timezone('utc', now()))::date;
  SELECT s.id INTO v_id
  FROM public.commercial_feature_signals s
  WHERE s.organization_id = v_org
    AND s.feature_key = p_feature_key
    AND s.event_type = p_event_type
    AND (s.created_at AT TIME ZONE 'utc')::date = v_day
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.commercial_feature_signals (organization_id, feature_key, event_type)
  VALUES (v_org, p_feature_key, p_event_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;


-- ===== register_payment
CREATE OR REPLACE FUNCTION public.register_payment(
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_method public.payment_method DEFAULT 'efectivo',
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_paid_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice public.invoices%ROWTYPE;
  v_payment_id UUID;
  v_paid NUMERIC(14, 2);
  v_balance NUMERIC(14, 2);
  v_session_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor a 0';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  IF v_invoice.status <> 'emitida' THEN
    RAISE EXCEPTION 'Solo se pueden cobrar facturas emitidas';
  END IF;

  IF p_amount > v_invoice.balance THEN
    RAISE EXCEPTION 'El importe supera el saldo';
  END IF;

  INSERT INTO public.payments (
    organization_id,
    invoice_id,
    recorded_by,
    method,
    amount,
    paid_at,
    reference,
    notes
  )
  VALUES (
    v_org_id,
    v_invoice.id,
    auth.uid(),
    p_method,
    p_amount,
    COALESCE(p_paid_at, now()),
    NULLIF(btrim(COALESCE(p_reference, '')), ''),
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_payment_id;

  v_paid := v_invoice.paid_amount + p_amount;
  v_balance := v_invoice.total - v_paid;

  UPDATE public.invoices
  SET
    paid_amount = v_paid,
    balance = v_balance,
    status = CASE WHEN v_balance = 0 THEN 'pagada'::public.invoice_status ELSE status END,
    paid_at = CASE WHEN v_balance = 0 THEN now() ELSE paid_at END
  WHERE id = v_invoice.id;

  SELECT s.id INTO v_session_id
  FROM public.cash_sessions s
  WHERE s.organization_id = v_org_id
    AND s.branch_id = v_invoice.branch_id
    AND s.status = 'abierta'
    AND s.deleted_at IS NULL
  LIMIT 1
  FOR UPDATE;

  IF v_session_id IS NOT NULL THEN
    INSERT INTO public.cash_movements (
      organization_id,
      cash_session_id,
      payment_id,
      recorded_by,
      kind,
      method,
      amount,
      notes
    )
    VALUES (
      v_org_id,
      v_session_id,
      v_payment_id,
      auth.uid(),
      'cobro',
      p_method,
      p_amount,
      COALESCE('Cobro ' || NULLIF(v_invoice.number, ''), 'Cobro de factura')
    );
  END IF;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'invoice_id', v_invoice.id,
    'paid_amount', v_paid,
    'balance', v_balance,
    'cash_session_id', v_session_id
  );
END;
$$;


-- ===== run_commercial_lifecycle
CREATE OR REPLACE FUNCTION public.run_commercial_lifecycle(
  p_trial_remind_days INT DEFAULT 3,
  p_quota_warn_ratio NUMERIC DEFAULT 0.8,
  p_dedupe_hours INT DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired INT := 0;
  v_notices INT := 0;
  v_id UUID;
  rec RECORD;
  v_limit NUMERIC;
  v_period_start DATE;
  v_remind INTERVAL;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    PERFORM public.require_platform_admin();
  END IF;

  v_expired := public.expire_due_subscriptions(NULL);
  v_period_start := date_trunc('month', timezone('utc', now()))::date;
  v_remind := make_interval(days => GREATEST(COALESCE(p_trial_remind_days, 3), 1));

  FOR rec IN
    SELECT s.id, s.organization_id, p.name AS plan_name, s.trial_ends_at
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status = 'trialing'
      AND s.cancelled_at IS NULL
      AND s.trial_ends_at IS NOT NULL
      AND s.trial_ends_at > timezone('utc', now())
      AND s.trial_ends_at <= timezone('utc', now()) + v_remind
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_trial_ending',
      rec.id,
      'Tu trial vence pronto',
      format(
        'El trial%s vence el %s. Elegí un plan para no perder el acceso.',
        CASE WHEN rec.plan_name IS NULL THEN '' ELSE ' de ' || rec.plan_name END,
        to_char(rec.trial_ends_at AT TIME ZONE 'UTC', 'DD/MM/YYYY')
      ),
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT s.id, s.organization_id, p.name AS plan_name, s.ends_at
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status IN ('active', 'past_due')
      AND s.cancelled_at IS NULL
      AND p.key NOT IN ('legacy', 'trial')
      AND s.ends_at IS NOT NULL
      AND s.ends_at > timezone('utc', now())
      AND s.ends_at <= timezone('utc', now()) + v_remind
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_ending',
      rec.id,
      'Tu plan vence pronto',
      format(
        'El plan%s vence el %s. Renovalo desde Configuración para no perder el acceso.',
        CASE WHEN rec.plan_name IS NULL THEN '' ELSE ' ' || rec.plan_name END,
        to_char(rec.ends_at AT TIME ZONE 'UTC', 'DD/MM/YYYY')
      ),
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT s.id, s.organization_id, p.name AS plan_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status = 'expired'
      AND COALESCE(s.cancelled_at, s.ends_at, s.updated_at) >= timezone('utc', now()) - interval '24 hours'
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_expired',
      rec.id,
      'Tu plan venció',
      format(
        'El plan%s ya no está activo. Elegí uno para seguir usando los módulos.',
        CASE WHEN rec.plan_name IS NULL THEN '' ELSE ' ' || rec.plan_name END
      ),
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT s.id, s.organization_id, p.name AS plan_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    WHERE s.status = 'past_due'
      AND s.cancelled_at IS NULL
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_past_due',
      rec.id,
      'Hay un pago pendiente',
      format(
        'El plan%s sigue operativo, pero el pago no se acreditó. Actualizá la facturación.',
        CASE WHEN rec.plan_name IS NULL THEN '' ELSE ' ' || rec.plan_name END
      ),
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT g.id, g.organization_id, a.name AS addon_name, g.ends_at
    FROM public.organization_addons g
    JOIN public.addons a ON a.id = g.addon_id
    WHERE g.status = 'active'
      AND g.cancelled_at IS NULL
      AND g.ends_at IS NOT NULL
      AND g.ends_at > timezone('utc', now())
      AND g.ends_at <= timezone('utc', now()) + v_remind
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'addon_ending',
      rec.id,
      format('El extra %s vence pronto', rec.addon_name),
      format(
        'Vence el %s. Renovalo desde Configuración para no perder el módulo.',
        to_char(rec.ends_at AT TIME ZONE 'UTC', 'DD/MM/YYYY')
      ),
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT g.id, g.organization_id, a.name AS addon_name
    FROM public.organization_addons g
    JOIN public.addons a ON a.id = g.addon_id
    WHERE g.status = 'expired'
      AND COALESCE(g.cancelled_at, g.ends_at, g.updated_at) >= timezone('utc', now()) - interval '24 hours'
  LOOP
    v_id := public.emit_plan_notification(
      rec.organization_id,
      'addon_expired',
      rec.id,
      format('El extra %s venció', rec.addon_name),
      'Ya no está activo. Renovalo desde Configuración → Plan si lo necesitás.',
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT
      s.organization_id,
      f.id AS feature_id,
      f.name AS feature_name,
      fu.usage_count,
      CASE
        WHEN ov.enabled IS TRUE THEN ov.limit_value
        WHEN COALESCE(pf.enabled, false) OR COALESCE(ad.enabled, false) THEN
          CASE
            WHEN (COALESCE(pf.enabled, false) AND pf.limit_value IS NULL)
              OR (COALESCE(ad.enabled, false) AND ad.limit_value IS NULL)
            THEN NULL
            ELSE GREATEST(
              CASE WHEN COALESCE(pf.enabled, false) THEN COALESCE(pf.limit_value, 0) ELSE 0 END,
              CASE WHEN COALESCE(ad.enabled, false) THEN COALESCE(ad.limit_value, 0) ELSE 0 END
            )
          END
        ELSE f.default_limit
      END AS limit_value
    FROM public.organization_subscriptions s
    JOIN public.features f
      ON f.usage_metered = true
     AND f.is_active = true
     AND f.feature_type = 'limit'
    JOIN public.feature_usage fu
      ON fu.organization_id = s.organization_id
     AND fu.feature_id = f.id
     AND fu.period_start = v_period_start
    LEFT JOIN public.plan_features pf
      ON pf.plan_id = s.plan_id
     AND pf.feature_id = f.id
    LEFT JOIN LATERAL (
      SELECT o.limit_value, o.enabled
      FROM public.organization_feature_overrides o
      WHERE o.organization_id = s.organization_id
        AND o.feature_id = f.id
        AND (o.starts_at IS NULL OR o.starts_at <= timezone('utc', now()))
        AND (o.ends_at IS NULL OR o.ends_at > timezone('utc', now()))
      ORDER BY o.created_at DESC
      LIMIT 1
    ) ov ON true
    LEFT JOIN LATERAL (
      SELECT
        bool_or(af.enabled) AS enabled,
        CASE
          WHEN bool_or(af.enabled AND af.limit_value IS NULL) THEN NULL
          ELSE MAX(af.limit_value) FILTER (WHERE af.enabled)
        END AS limit_value
      FROM public.organization_addons g
      JOIN public.addons a ON a.id = g.addon_id AND a.is_active = true
      JOIN public.addon_features af ON af.addon_id = g.addon_id AND af.feature_id = f.id
      WHERE g.organization_id = s.organization_id
        AND g.status = 'active'
        AND g.cancelled_at IS NULL
        AND (g.starts_at IS NULL OR g.starts_at <= timezone('utc', now()))
        AND (g.ends_at IS NULL OR g.ends_at > timezone('utc', now()))
    ) ad ON true
    WHERE s.status IN ('trialing', 'active', 'past_due')
      AND s.cancelled_at IS NULL
      AND (ov.enabled IS NULL OR ov.enabled IS TRUE)
  LOOP
    v_limit := rec.limit_value;
    IF v_limit IS NULL OR v_limit <= 0 THEN
      CONTINUE;
    END IF;
    IF rec.usage_count < ceil(v_limit * GREATEST(COALESCE(p_quota_warn_ratio, 0.8), 0.5)) THEN
      CONTINUE;
    END IF;

    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_quota',
      rec.feature_id,
      format('Cupo de %s cerca del límite', rec.feature_name),
      'Usaste el 80% o más del cupo mensual. Revisá el plan o esperá al próximo mes.',
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT
      s.organization_id,
      f.id AS feature_id,
      f.name AS feature_name,
      u.used,
      CASE
        WHEN ov.enabled IS TRUE THEN ov.limit_value
        WHEN COALESCE(pf.enabled, false) THEN pf.limit_value
        ELSE f.default_limit
      END AS limit_value
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    JOIN LATERAL public.organization_seat_usage(s.organization_id) u ON true
    JOIN public.features f
      ON f.key = u.feature_key
     AND f.is_active = true
     AND f.feature_type = 'limit'
    LEFT JOIN public.plan_features pf
      ON pf.plan_id = s.plan_id
     AND pf.feature_id = f.id
    LEFT JOIN LATERAL (
      SELECT o.limit_value, o.enabled
      FROM public.organization_feature_overrides o
      WHERE o.organization_id = s.organization_id
        AND o.feature_id = f.id
        AND (o.starts_at IS NULL OR o.starts_at <= timezone('utc', now()))
        AND (o.ends_at IS NULL OR o.ends_at > timezone('utc', now()))
      ORDER BY o.created_at DESC
      LIMIT 1
    ) ov ON true
    WHERE s.status IN ('trialing', 'active', 'past_due')
      AND s.cancelled_at IS NULL
      AND p.key IS DISTINCT FROM 'legacy'
      AND (ov.enabled IS NULL OR ov.enabled IS TRUE)
  LOOP
    v_limit := rec.limit_value;
    IF v_limit IS NULL OR v_limit <= 0 THEN
      CONTINUE;
    END IF;
    IF rec.used < ceil(v_limit * GREATEST(COALESCE(p_quota_warn_ratio, 0.8), 0.5)) THEN
      CONTINUE;
    END IF;

    v_id := public.emit_plan_notification(
      rec.organization_id,
      'plan_quota',
      rec.feature_id,
      format('Cupo de %s cerca del límite', rec.feature_name),
      'Usaste el 80% o más del cupo del plan. No es un cupo mensual: reducí el uso o subí de plan.',
      p_dedupe_hours
    );
    IF v_id IS NOT NULL THEN
      v_notices := v_notices + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'expired', v_expired,
    'notices', v_notices
  );
END;
$$;


-- ===== sanitize_commercial_saved_view_params
CREATE OR REPLACE FUNCTION public.sanitize_commercial_saved_view_params(p_params JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out JSONB := '{}'::JSONB;
  v_key TEXT;
  v_val TEXT;
  v_allowed TEXT[] := ARRAY[
    'assignee',
    'outcome',
    'digest',
    'activity',
    'tag',
    'aging',
    'note',
    'pipeline',
    'psort',
    'priority',
    'pfrozen',
    'psnooze',
    'upgrade',
    'recommended'
  ];
BEGIN
  IF p_params IS NULL OR jsonb_typeof(p_params) <> 'object' THEN
    RETURN '{}'::JSONB;
  END IF;

  FOREACH v_key IN ARRAY v_allowed LOOP
    IF p_params ? v_key THEN
      v_val := NULLIF(btrim(COALESCE(p_params ->> v_key, '')), '');
      IF v_val IS NOT NULL AND char_length(v_val) <= 120 THEN
        v_out := v_out || jsonb_build_object(v_key, v_val);
      END IF;
    END IF;
  END LOOP;

  RETURN v_out;
END;
$$;


-- ===== save_ai_suggestion
CREATE OR REPLACE FUNCTION public.save_ai_suggestion(
  p_patient_id UUID,
  p_kind TEXT,
  p_prompt_hash TEXT,
  p_output JSONB,
  p_model TEXT,
  p_input_excerpt TEXT DEFAULT NULL,
  p_consultation_id UUID DEFAULT NULL,
  p_clinical_entry_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_owner_id UUID;
  v_branch_id UUID;
  v_id UUID;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('clinical:write') THEN
    RAISE EXCEPTION 'No tenés permisos para generar sugerencias de IA';
  END IF;

  IF p_kind NOT IN ('patient_summary', 'soap_assist', 'owner_instructions') THEN
    RAISE EXCEPTION 'Tipo de sugerencia inválido';
  END IF;

  SELECT p.owner_id, COALESCE(p_branch_id, p.branch_id)
  INTO v_owner_id, v_branch_id
  FROM public.patients p
  WHERE p.id = p_patient_id
    AND p.organization_id = v_org_id
    AND p.deleted_at IS NULL;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Paciente no encontrado';
  END IF;

  INSERT INTO public.ai_suggestions (
    organization_id,
    branch_id,
    patient_id,
    owner_id,
    consultation_id,
    clinical_entry_id,
    kind,
    prompt_hash,
    input_excerpt,
    output,
    model,
    created_by
  ) VALUES (
    v_org_id,
    v_branch_id,
    p_patient_id,
    v_owner_id,
    p_consultation_id,
    p_clinical_entry_id,
    p_kind::public.ai_suggestion_kind,
    p_prompt_hash,
    NULLIF(btrim(COALESCE(p_input_excerpt, '')), ''),
    COALESCE(p_output, '{}'::jsonb),
    p_model,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id);
END;
$$;


-- ===== search_ai_suggestions
CREATE OR REPLACE FUNCTION public.search_ai_suggestions(
  p_patient_id UUID DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  kind public.ai_suggestion_kind,
  prompt_hash TEXT,
  input_excerpt TEXT,
  output JSONB,
  model TEXT,
  created_by UUID,
  patient_name TEXT,
  owner_full_name TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT s.*
    FROM public.ai_suggestions s
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND (p_patient_id IS NULL OR s.patient_id = p_patient_id)
      AND (p_kind IS NULL OR btrim(p_kind) = '' OR s.kind::text = p_kind)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.patient_id,
    f.owner_id,
    f.consultation_id,
    f.clinical_entry_id,
    f.kind,
    f.prompt_hash,
    f.input_excerpt,
    f.output,
    f.model,
    f.created_by,
    p.name,
    o.full_name,
    pr.full_name,
    f.created_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  INNER JOIN public.patients p ON p.id = f.patient_id
  INNER JOIN public.owners o ON o.id = f.owner_id
  LEFT JOIN public.profiles pr ON pr.id = f.created_by
  ORDER BY f.created_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_audit_logs
CREATE OR REPLACE FUNCTION public.search_audit_logs(
  p_search TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  user_id UUID,
  action TEXT,
  entity_type TEXT,
  entity_id UUID,
  user_full_name TEXT,
  branch_name TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('audit:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      al.*,
      pr.full_name AS usr_name,
      b.name AS br_name,
      public.audit_event_summary(al.action, al.entity_type, al.old_data, al.new_data) AS evt_summary
    FROM public.audit_logs al
    LEFT JOIN public.profiles pr ON pr.id = al.user_id
    LEFT JOIN public.branches b ON b.id = al.branch_id
    WHERE al.organization_id = v_org_id
      AND (p_action IS NULL OR btrim(p_action) = '' OR al.action = p_action)
      AND (
        p_entity_type IS NULL
        OR btrim(p_entity_type) = ''
        OR (
          p_entity_type = 'liquidaciones_family'
          AND al.entity_type IN (
            'professionals',
            'professional_compensation_schemes',
            'professional_compensation_rules',
            'professional_settlements',
            'professional_settlement_items',
            'professional_settlement_item_omissions',
            'professional_settlement_adjustments',
            'professional_payments'
          )
        )
        OR al.entity_type = p_entity_type
      )
      AND (p_from IS NULL OR al.created_at >= p_from)
      AND (p_to IS NULL OR al.created_at < p_to)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR al.action ILIKE '%' || p_search || '%'
        OR al.entity_type ILIKE '%' || p_search || '%'
        OR al.entity_id::TEXT ILIKE '%' || p_search || '%'
        OR pr.full_name ILIKE '%' || p_search || '%'
        OR COALESCE(al.new_data->>'name', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.new_data->>'full_name', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.new_data->>'title', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.new_data->>'number', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.new_data->>'settlement_id', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.old_data->>'name', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.old_data->>'full_name', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.old_data->>'settlement_id', '') ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.user_id,
    f.action,
    f.entity_type,
    f.entity_id,
    f.usr_name,
    f.br_name,
    f.evt_summary,
    f.created_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.created_at DESC, f.id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_cash_sessions
CREATE OR REPLACE FUNCTION public.search_cash_sessions(
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  opened_by UUID,
  closed_by UUID,
  status public.cash_session_status,
  opening_amount NUMERIC,
  expected_cash NUMERIC,
  counted_cash NUMERIC,
  difference NUMERIC,
  notes TEXT,
  close_notes TEXT,
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  movement_count BIGINT,
  opened_by_name TEXT,
  closed_by_name TEXT,
  branch_name TEXT,
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
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.*,
      opener.full_name AS open_name,
      closer.full_name AS close_name,
      b.name AS br_name,
      (
        SELECT COUNT(*)
        FROM public.cash_movements m
        WHERE m.cash_session_id = s.id AND m.deleted_at IS NULL
      ) AS mov_cnt,
      CASE
        WHEN s.status = 'cerrada' THEN COALESCE(s.expected_cash, public.cash_session_expected_amount(s.id))
        ELSE public.cash_session_expected_amount(s.id)
      END AS exp_cash
    FROM public.cash_sessions s
    INNER JOIN public.branches b ON b.id = s.branch_id AND b.deleted_at IS NULL
    LEFT JOIN public.profiles opener ON opener.id = s.opened_by
    LEFT JOIN public.profiles closer ON closer.id = s.closed_by
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND (p_status IS NULL OR btrim(p_status) = '' OR s.status::TEXT = p_status)
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.opened_by,
    f.closed_by,
    f.status,
    f.opening_amount,
    f.exp_cash,
    f.counted_cash,
    f.difference,
    f.notes,
    f.close_notes,
    f.opened_at,
    f.closed_at,
    f.mov_cnt,
    f.open_name,
    f.close_name,
    f.br_name,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.opened_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_clinical_images
CREATE OR REPLACE FUNCTION public.search_clinical_images(
  p_search TEXT DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_kind TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  uploaded_by UUID,
  kind public.clinical_image_kind,
  title TEXT,
  notes TEXT,
  storage_path TEXT,
  mime_type TEXT,
  file_size INT,
  original_name TEXT,
  taken_at TIMESTAMPTZ,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  uploaded_by_name TEXT,
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
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      i.*,
      p.name AS pat_name,
      p.species AS pat_species,
      ow.full_name AS own_name,
      pr.full_name AS up_name
    FROM public.clinical_images i
    INNER JOIN public.patients p ON p.id = i.patient_id AND p.deleted_at IS NULL
    INNER JOIN public.owners ow ON ow.id = i.owner_id AND ow.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = i.uploaded_by
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (p_patient_id IS NULL OR i.patient_id = p_patient_id)
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_kind IS NULL OR btrim(p_kind) = '' OR i.kind::TEXT = p_kind)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR i.title ILIKE '%' || p_search || '%'
        OR i.original_name ILIKE '%' || p_search || '%'
        OR i.notes ILIKE '%' || p_search || '%'
        OR p.name ILIKE '%' || p_search || '%'
        OR ow.full_name ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.patient_id,
    f.owner_id,
    f.consultation_id,
    f.clinical_entry_id,
    f.uploaded_by,
    f.kind,
    f.title,
    f.notes,
    f.storage_path,
    f.mime_type,
    f.file_size,
    f.original_name,
    f.taken_at,
    f.pat_name,
    f.pat_species,
    f.own_name,
    f.up_name,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.taken_at DESC, f.created_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_inventory_products
CREATE OR REPLACE FUNCTION public.search_inventory_products(
  p_search TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_low_stock BOOLEAN DEFAULT FALSE,
  p_active_only BOOLEAN DEFAULT TRUE,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  name TEXT,
  sku TEXT,
  category public.inventory_product_category,
  unit public.inventory_unit,
  quantity NUMERIC,
  min_quantity NUMERIC,
  unit_cost NUMERIC,
  unit_price NUMERIC,
  manufacturer TEXT,
  notes TEXT,
  is_active BOOLEAN,
  is_low_stock BOOLEAN,
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
  v_page INT;
  v_page_size INT;
  v_search TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('inventory:read') THEN
    RETURN;
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.*,
      (p.is_active AND p.quantity <= p.min_quantity) AS is_low_stock
    FROM public.inventory_products p
    WHERE p.organization_id = v_org_id
      AND p.deleted_at IS NULL
      AND (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND (p_category IS NULL OR p.category::TEXT = p_category)
      AND (NOT COALESCE(p_active_only, true) OR p.is_active = true)
      AND (
        v_search IS NULL
        OR p.name ILIKE '%' || v_search || '%'
        OR COALESCE(p.sku, '') ILIKE '%' || v_search || '%'
        OR COALESCE(p.manufacturer, '') ILIKE '%' || v_search || '%'
      )
      AND (
        NOT COALESCE(p_low_stock, false)
        OR (p.is_active AND p.quantity <= p.min_quantity)
      )
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.name,
    f.sku,
    f.category,
    f.unit,
    f.quantity,
    f.min_quantity,
    f.unit_cost,
    f.unit_price,
    f.manufacturer,
    f.notes,
    f.is_active,
    f.is_low_stock,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN f.is_low_stock THEN 0 ELSE 1 END,
    f.name ASC
  LIMIT v_page_size
  OFFSET (v_page - 1) * v_page_size;
END;
$$;


-- ===== search_invoices
CREATE OR REPLACE FUNCTION public.search_invoices(
  p_search TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  owner_id UUID,
  patient_id UUID,
  consultation_id UUID,
  created_by UUID,
  issued_by UUID,
  status public.invoice_status,
  number TEXT,
  currency TEXT,
  issued_at TIMESTAMPTZ,
  due_at DATE,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  subtotal NUMERIC,
  tax_amount NUMERIC,
  total NUMERIC,
  paid_amount NUMERIC,
  balance NUMERIC,
  notes TEXT,
  item_count BIGINT,
  owner_full_name TEXT,
  patient_name TEXT,
  patient_species public.patient_species,
  created_by_name TEXT,
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
  v_page INT;
  v_page_size INT;
  v_search TEXT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:read') THEN
    RETURN;
  END IF;

  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_search := NULLIF(btrim(COALESCE(p_search, '')), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT i.*
    FROM public.invoices i
    INNER JOIN public.owners o ON o.id = i.owner_id
    LEFT JOIN public.patients p ON p.id = i.patient_id
    WHERE i.organization_id = v_org_id
      AND i.deleted_at IS NULL
      AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      AND (p_owner_id IS NULL OR i.owner_id = p_owner_id)
      AND (p_patient_id IS NULL OR i.patient_id = p_patient_id)
      AND (p_status IS NULL OR i.status::TEXT = p_status)
      AND (
        v_search IS NULL
        OR COALESCE(i.number, '') ILIKE '%' || v_search || '%'
        OR o.full_name ILIKE '%' || v_search || '%'
        OR COALESCE(p.name, '') ILIKE '%' || v_search || '%'
      )
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.owner_id,
    f.patient_id,
    f.consultation_id,
    f.created_by,
    f.issued_by,
    f.status,
    f.number,
    f.currency,
    f.issued_at,
    f.due_at,
    f.paid_at,
    f.voided_at,
    f.subtotal,
    f.tax_amount,
    f.total,
    f.paid_amount,
    f.balance,
    f.notes,
    (
      SELECT COUNT(*)
      FROM public.invoice_items it
      WHERE it.invoice_id = f.id AND it.deleted_at IS NULL
    ) AS item_count,
    o.full_name AS owner_full_name,
    p.name AS patient_name,
    p.species AS patient_species,
    pr.full_name AS created_by_name,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  INNER JOIN public.owners o ON o.id = f.owner_id
  LEFT JOIN public.patients p ON p.id = f.patient_id
  LEFT JOIN public.profiles pr ON pr.id = f.created_by
  ORDER BY
    CASE f.status
      WHEN 'emitida' THEN 0
      WHEN 'borrador' THEN 1
      WHEN 'pagada' THEN 2
      ELSE 3
    END,
    f.created_at DESC
  LIMIT v_page_size
  OFFSET (v_page - 1) * v_page_size;
END;
$$;


-- ===== search_lab_orders
CREATE OR REPLACE FUNCTION public.search_lab_orders(
  p_search TEXT DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  ordered_by UUID,
  completed_by UUID,
  status public.lab_order_status,
  priority public.lab_priority,
  sample_type public.lab_sample_type,
  title TEXT,
  ordered_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  interpretation TEXT,
  notes TEXT,
  item_count BIGINT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  ordered_by_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      o.*,
      p.name AS pat_name,
      p.species AS pat_species,
      ow.full_name AS own_name,
      pr.full_name AS ord_name,
      (
        SELECT COUNT(*)
        FROM public.lab_order_items i
        WHERE i.lab_order_id = o.id AND i.deleted_at IS NULL
      ) AS items_cnt
    FROM public.lab_orders o
    INNER JOIN public.patients p ON p.id = o.patient_id AND p.deleted_at IS NULL
    INNER JOIN public.owners ow ON ow.id = o.owner_id AND ow.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = o.ordered_by
    WHERE o.organization_id = v_org_id
      AND o.deleted_at IS NULL
      AND (p_patient_id IS NULL OR o.patient_id = p_patient_id)
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND (p_status IS NULL OR btrim(p_status) = '' OR o.status::TEXT = p_status)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR o.title ILIKE '%' || p_search || '%'
        OR o.interpretation ILIKE '%' || p_search || '%'
        OR p.name ILIKE '%' || p_search || '%'
        OR ow.full_name ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id, f.organization_id, f.branch_id, f.patient_id, f.owner_id,
    f.consultation_id, f.clinical_entry_id, f.ordered_by, f.completed_by,
    f.status, f.priority, f.sample_type, f.title, f.ordered_at, f.collected_at,
    f.completed_at, f.interpretation, f.notes, f.items_cnt,
    f.pat_name, f.pat_species, f.own_name, f.ord_name,
    f.created_at, f.updated_at, c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.ordered_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_notifications
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


-- ===== search_prescriptions
CREATE OR REPLACE FUNCTION public.search_prescriptions(
  p_search TEXT DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  prescribed_by UUID,
  dispensed_by UUID,
  voided_by UUID,
  status public.prescription_status,
  number TEXT,
  notes TEXT,
  void_reason TEXT,
  prescribed_at TIMESTAMPTZ,
  dispensed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  item_count BIGINT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  prescribed_by_name TEXT,
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
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      rx.*,
      p.name AS pat_name,
      p.species AS pat_species,
      ow.full_name AS own_name,
      pr.full_name AS presc_name,
      (
        SELECT COUNT(*)
        FROM public.prescription_items i
        WHERE i.prescription_id = rx.id AND i.deleted_at IS NULL
      ) AS items_cnt
    FROM public.prescriptions rx
    INNER JOIN public.patients p ON p.id = rx.patient_id AND p.deleted_at IS NULL
    INNER JOIN public.owners ow ON ow.id = rx.owner_id AND ow.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = rx.prescribed_by
    WHERE rx.organization_id = v_org_id
      AND rx.deleted_at IS NULL
      AND (p_patient_id IS NULL OR rx.patient_id = p_patient_id)
      AND (p_branch_id IS NULL OR rx.branch_id = p_branch_id)
      AND (p_status IS NULL OR btrim(p_status) = '' OR rx.status::TEXT = p_status)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR rx.number ILIKE '%' || p_search || '%'
        OR p.name ILIKE '%' || p_search || '%'
        OR ow.full_name ILIKE '%' || p_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.prescription_items i
          WHERE i.prescription_id = rx.id
            AND i.deleted_at IS NULL
            AND i.medication_name ILIKE '%' || p_search || '%'
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
    f.patient_id,
    f.owner_id,
    f.consultation_id,
    f.clinical_entry_id,
    f.prescribed_by,
    f.dispensed_by,
    f.voided_by,
    f.status,
    f.number,
    f.notes,
    f.void_reason,
    f.prescribed_at,
    f.dispensed_at,
    f.voided_at,
    f.items_cnt,
    f.pat_name,
    f.pat_species,
    f.own_name,
    f.presc_name,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.prescribed_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== search_surgeries
CREATE OR REPLACE FUNCTION public.search_surgeries(
  p_search TEXT DEFAULT NULL,
  p_patient_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  patient_id UUID,
  owner_id UUID,
  appointment_id UUID,
  consultation_id UUID,
  clinical_entry_id UUID,
  surgeon_id UUID,
  status public.surgery_status,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  procedure_name TEXT,
  diagnosis TEXT,
  anesthesia public.surgery_anesthesia,
  asa public.surgery_asa,
  preop_notes TEXT,
  intraop_notes TEXT,
  postop_notes TEXT,
  complications TEXT,
  notes TEXT,
  patient_name TEXT,
  patient_species public.patient_species,
  owner_full_name TEXT,
  surgeon_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_offset INT;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('clinical:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.*,
      p.name AS pat_name,
      p.species AS pat_species,
      o.full_name AS own_name,
      pr.full_name AS surg_name
    FROM public.surgeries s
    INNER JOIN public.patients p ON p.id = s.patient_id AND p.deleted_at IS NULL
    INNER JOIN public.owners o ON o.id = s.owner_id AND o.deleted_at IS NULL
    LEFT JOIN public.profiles pr ON pr.id = s.surgeon_id
    WHERE s.organization_id = v_org_id
      AND s.deleted_at IS NULL
      AND (p_patient_id IS NULL OR s.patient_id = p_patient_id)
      AND (p_branch_id IS NULL OR s.branch_id = p_branch_id)
      AND (p_status IS NULL OR btrim(p_status) = '' OR s.status::TEXT = p_status)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR s.procedure_name ILIKE '%' || p_search || '%'
        OR s.diagnosis ILIKE '%' || p_search || '%'
        OR p.name ILIKE '%' || p_search || '%'
        OR o.full_name ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id, f.organization_id, f.branch_id, f.patient_id, f.owner_id,
    f.appointment_id, f.consultation_id, f.clinical_entry_id, f.surgeon_id,
    f.status, f.scheduled_at, f.started_at, f.completed_at, f.procedure_name,
    f.diagnosis, f.anesthesia, f.asa, f.preop_notes, f.intraop_notes,
    f.postop_notes, f.complications, f.notes,
    f.pat_name, f.pat_species, f.own_name, f.surg_name,
    f.created_at, f.updated_at, c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY f.scheduled_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_assignee
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(
  p_organization_ids UUID[],
  p_assigned_to UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      WHERE pa.user_id = p_assigned_to
        AND pa.is_active = true
    ) THEN
      RAISE EXCEPTION 'assignee must be an active platform admin';
    END IF;
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      v_result := public.superadmin_set_plan_recommendation_assignee(v_id, p_assigned_to);
      IF COALESCE((v_result ->> 'unchanged')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'assigned_to', p_assigned_to,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_commercial_snooze
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(
  p_organization_ids UUID[],
  p_days INT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 90) THEN
    RAISE EXCEPTION 'snooze days must be between 1 and 90';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_set_plan_recommendation_commercial_snooze(v_id, p_days, p_note);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'errors', v_errors,
    'days', p_days
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_follow_up
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(
  p_organization_ids UUID[],
  p_follow_up_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_set_plan_recommendation_follow_up(v_id, p_follow_up_at);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', 0,
    'errors', v_errors,
    'follow_up_at', p_follow_up_at,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_freeze
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(
  p_organization_ids UUID[],
  p_frozen BOOLEAN DEFAULT true,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_set_plan_recommendation_freeze(
        v_id,
        COALESCE(p_frozen, true),
        p_note
      );
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', 0,
    'errors', v_errors,
    'frozen', COALESCE(p_frozen, true),
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_note
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_note(
  p_organization_ids UUID[],
  p_note TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'replace'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
  v_mode TEXT;
  v_incoming TEXT;
  v_existing TEXT;
  v_final TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'replace'));
  IF v_mode NOT IN ('replace', 'append', 'clear') THEN
    RAISE EXCEPTION 'invalid note mode';
  END IF;

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  v_incoming := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_mode = 'clear' THEN
    v_incoming := NULL;
  ELSIF v_mode IN ('replace', 'append') AND v_incoming IS NULL THEN
    RAISE EXCEPTION 'note required for replace/append';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      IF v_mode = 'append' THEN
        SELECT r.commercial_note INTO v_existing
        FROM public.organization_plan_recommendations r
        WHERE r.organization_id = v_id;
        IF v_existing IS NULL OR btrim(v_existing) = '' THEN
          v_final := v_incoming;
        ELSE
          v_final := left(v_existing || E'\n' || v_incoming, 2000);
        END IF;
      ELSE
        v_final := v_incoming;
      END IF;

      PERFORM public.superadmin_set_plan_recommendation_note(v_id, v_final);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', 0,
    'errors', v_errors,
    'mode', CASE WHEN v_mode = 'clear' THEN 'clear' ELSE v_mode END,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_outcome
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(
  p_organization_ids UUID[],
  p_outcome TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost', 'deferred', 'not_a_fit') THEN
    RAISE EXCEPTION 'invalid commercial outcome';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      v_result := public.superadmin_set_plan_recommendation_outcome(v_id, p_outcome, p_note);
      IF COALESCE((v_result ->> 'unchanged')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'outcome', p_outcome,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_set_plan_recommendation_tags
CREATE OR REPLACE FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(
  p_organization_ids UUID[],
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_mode TEXT DEFAULT 'add'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_skipped INT := 0;
  v_errors INT := 0;
  v_result JSONB;
  v_mode TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'add'));
  IF v_mode NOT IN ('replace', 'add', 'remove') THEN
    RAISE EXCEPTION 'invalid tag mode';
  END IF;

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  IF v_mode <> 'replace' AND (p_tags IS NULL OR cardinality(public.normalize_commercial_tags(p_tags)) = 0) THEN
    RAISE EXCEPTION 'tags required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      v_result := public.superadmin_set_plan_recommendation_tags(v_id, p_tags, v_mode);
      IF COALESCE((v_result ->> 'unchanged')::boolean, false) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_updated := v_updated + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'skipped', v_skipped,
    'errors', v_errors,
    'mode', v_mode,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_bulk_touch_plan_recommendation_contact
CREATE OR REPLACE FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(
  p_organization_ids UUID[],
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_ids UUID[];
  v_id UUID;
  v_updated INT := 0;
  v_errors INT := 0;
BEGIN
  v_uid := public.require_platform_admin();

  IF p_organization_ids IS NULL OR cardinality(p_organization_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT x
    FROM unnest(p_organization_ids) AS x
    WHERE x IS NOT NULL
    LIMIT 50
  ) INTO v_ids;

  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'organization ids required';
  END IF;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      PERFORM public.superadmin_touch_plan_recommendation_contact(v_id, p_note);
      v_updated := v_updated + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'requested', cardinality(v_ids),
    'updated', v_updated,
    'errors', v_errors,
    'actor_user_id', v_uid
  );
END;
$$;


-- ===== superadmin_cancel_checkout_intents
CREATE OR REPLACE FUNCTION public.superadmin_cancel_checkout_intents(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  UPDATE public.billing_checkout_intents
  SET cancelled_at = timezone('utc', now())
  WHERE organization_id = p_organization_id
    AND consumed_at IS NULL
    AND cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('cancelled', v_count);
END;
$$;


-- ===== superadmin_clear_idle_plan_recommendation
CREATE OR REPLACE FUNCTION public.superadmin_clear_idle_plan_recommendation(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF NOT FOUND OR v_prev.status NOT IN ('recommended', 'reviewed') THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'not_active');
  END IF;

  IF v_prev.is_frozen THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'frozen');
  END IF;

  IF v_prev.commercial_outcome IN ('won', 'lost', 'not_a_fit') THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'closed_outcome');
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    status = 'none',
    recommended_plan_key = NULL,
    severity = 'none',
    score = 0,
    reasons = '[]'::jsonb,
    fingerprint = NULL,
    clinic_dismissed_at = NULL,
    clinic_dismissed_fingerprint = NULL,
    clinic_dismissed_by = NULL,
    clinic_snooze_until = NULL,
    updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    'cleared',
    'superadmin',
    v_uid,
    v_prev.current_plan_key,
    v_prev.recommended_plan_key,
    v_prev.severity,
    v_prev.score,
    v_prev.usage_level,
    v_prev.reasons,
    v_prev.fingerprint,
    'Bulk refresh cleared idle recommendation'
  );

  RETURN jsonb_build_object(
    'cleared', true,
    'organization_id', v_row.organization_id
  );
END;
$$;


-- ===== superadmin_commercial_summary
CREATE OR REPLACE FUNCTION public.superadmin_commercial_summary(
  p_remind_days INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remind INTERVAL;
BEGIN
  PERFORM public.require_platform_admin();
  PERFORM public.expire_due_subscriptions(NULL);
  v_remind := make_interval(days => GREATEST(COALESCE(p_remind_days, 3), 1));

  RETURN (
    SELECT jsonb_build_object(
      'organizations', COUNT(*) FILTER (WHERE o.deleted_at IS NULL),
      'trialing', COUNT(*) FILTER (WHERE ls.status = 'trialing'),
      'active', COUNT(*) FILTER (WHERE ls.status = 'active'),
      'past_due', COUNT(*) FILTER (WHERE ls.status = 'past_due'),
      'expired', COUNT(*) FILTER (WHERE ls.status = 'expired'),
      'cancelled', COUNT(*) FILTER (WHERE ls.status = 'cancelled'),
      'plans_ending_soon', COUNT(*) FILTER (
        WHERE ls.status IN ('active', 'past_due')
          AND ls.plan_key NOT IN ('legacy', 'trial')
          AND ls.ends_at IS NOT NULL
          AND ls.ends_at > timezone('utc', now())
          AND ls.ends_at <= timezone('utc', now()) + v_remind
      ),
      'addons_active', (
        SELECT COUNT(*)
        FROM public.organization_addons g
        WHERE g.status = 'active'
          AND g.cancelled_at IS NULL
          AND (g.starts_at IS NULL OR g.starts_at <= timezone('utc', now()))
          AND (g.ends_at IS NULL OR g.ends_at > timezone('utc', now()))
      ),
      'addons_ending_soon', (
        SELECT COUNT(*)
        FROM public.organization_addons g
        WHERE g.status = 'active'
          AND g.cancelled_at IS NULL
          AND g.ends_at IS NOT NULL
          AND g.ends_at > timezone('utc', now())
          AND g.ends_at <= timezone('utc', now()) + v_remind
      ),
      'orgs_over_seats', (
        SELECT COUNT(*)::INT
        FROM public.organizations o2
        JOIN LATERAL (
          SELECT s.plan_id, p.key AS plan_key
          FROM public.organization_subscriptions s
          JOIN public.plans p ON p.id = s.plan_id
          WHERE s.organization_id = o2.id
            AND s.status IN ('trialing', 'active', 'past_due')
            AND s.cancelled_at IS NULL
          ORDER BY s.created_at DESC
          LIMIT 1
        ) cs ON true
        WHERE o2.deleted_at IS NULL
          AND cs.plan_key IS DISTINCT FROM 'legacy'
          AND (
            EXISTS (
              SELECT 1
              FROM public.organization_seat_usage(o2.id) u
              JOIN public.features f
                ON f.key = u.feature_key
               AND f.is_active = true
               AND f.feature_type = 'limit'
              LEFT JOIN public.plan_features pf
                ON pf.plan_id = cs.plan_id
               AND pf.feature_id = f.id
              LEFT JOIN LATERAL (
                SELECT ov.limit_value, ov.enabled
                FROM public.organization_feature_overrides ov
                WHERE ov.organization_id = o2.id
                  AND ov.feature_id = f.id
                  AND (ov.starts_at IS NULL OR ov.starts_at <= timezone('utc', now()))
                  AND (ov.ends_at IS NULL OR ov.ends_at > timezone('utc', now()))
                ORDER BY ov.created_at DESC
                LIMIT 1
              ) ovr ON true
              WHERE (ovr.enabled IS NULL OR ovr.enabled IS TRUE)
                AND (
                  CASE
                    WHEN ovr.enabled IS TRUE THEN ovr.limit_value
                    WHEN pf.enabled IS TRUE THEN pf.limit_value
                    ELSE f.default_limit
                  END
                ) IS NOT NULL
                AND (
                  CASE
                    WHEN ovr.enabled IS TRUE THEN ovr.limit_value
                    WHEN pf.enabled IS TRUE THEN pf.limit_value
                    ELSE f.default_limit
                  END
                ) > 0
                AND u.used > (
                  CASE
                    WHEN ovr.enabled IS TRUE THEN ovr.limit_value
                    WHEN pf.enabled IS TRUE THEN pf.limit_value
                    ELSE f.default_limit
                  END
                )
            )
            OR EXISTS (
              SELECT 1
              FROM public.organization_metered_overages(o2.id)
            )
          )
      )
    )
    FROM public.organizations o
    LEFT JOIN LATERAL (
      SELECT s.status, s.ends_at, p.key AS plan_key
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = o.id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) ls ON true
    WHERE o.deleted_at IS NULL
  );
END;
$$;


-- ===== superadmin_delete_recommendation_saved_view
CREATE OR REPLACE FUNCTION public.superadmin_delete_recommendation_saved_view(
  p_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_deleted INT := 0;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'id required';
  END IF;

  DELETE FROM public.commercial_recommendation_saved_views v
  WHERE v.id = p_id
    AND v.owner_user_id = v_uid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'saved view not found';
  END IF;

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$$;


-- ===== superadmin_end_trial
CREATE OR REPLACE FUNCTION public.superadmin_end_trial(
  p_organization_id UUID,
  p_plan_key TEXT DEFAULT 'basic',
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_plan_key IS NULL OR btrim(p_plan_key) = '' THEN
    p_plan_key := 'basic';
  END IF;
  IF p_plan_key = 'trial' THEN
    RAISE EXCEPTION 'end trial requires a commercial plan, not trial';
  END IF;
  RETURN public.superadmin_change_plan(
    p_organization_id, p_plan_key, COALESCE(p_reason, 'end trial'), false, NULL
  );
END;
$$;


-- ===== superadmin_get_plan_recommendation_note
CREATE OR REPLACE FUNCTION public.superadmin_get_plan_recommendation_note(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_email TEXT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT * INTO v_row
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'commercial_note', NULL,
      'commercial_note_updated_at', NULL,
      'last_refreshed_at', NULL,
      'follow_up_at', NULL,
      'follow_up_by', NULL,
      'is_frozen', false,
      'frozen_at', NULL,
      'frozen_note', NULL,
      'assigned_to', NULL,
      'assigned_at', NULL,
      'assigned_email', NULL,
      'commercial_outcome', NULL,
      'commercial_outcome_at', NULL,
      'commercial_outcome_note', NULL,
      'last_contacted_at', NULL,
      'last_contact_note', NULL,
      'commercial_tags', '[]'::jsonb,
      'commercial_snooze_until', NULL,
      'commercial_snooze_note', NULL,
      'commercial_snoozed_at', NULL,
      'is_commercially_snoozed', false,
      'status', NULL
    );
  END IF;

  SELECT pa.email INTO v_email
  FROM public.platform_admins pa
  WHERE pa.user_id = v_row.assigned_to
  LIMIT 1;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_note', v_row.commercial_note,
    'commercial_note_updated_at', v_row.commercial_note_updated_at,
    'last_refreshed_at', v_row.last_refreshed_at,
    'follow_up_at', v_row.follow_up_at,
    'follow_up_by', v_row.follow_up_by,
    'is_frozen', v_row.is_frozen,
    'frozen_at', v_row.frozen_at,
    'frozen_note', v_row.frozen_note,
    'assigned_to', v_row.assigned_to,
    'assigned_at', v_row.assigned_at,
    'assigned_email', v_email,
    'commercial_outcome', v_row.commercial_outcome,
    'commercial_outcome_at', v_row.commercial_outcome_at,
    'commercial_outcome_note', v_row.commercial_outcome_note,
    'last_contacted_at', v_row.last_contacted_at,
    'last_contact_note', v_row.last_contact_note,
    'commercial_tags', to_jsonb(COALESCE(v_row.commercial_tags, '{}'::TEXT[])),
    'commercial_snooze_until', v_row.commercial_snooze_until,
    'commercial_snooze_note', v_row.commercial_snooze_note,
    'commercial_snoozed_at', v_row.commercial_snoozed_at,
    'is_commercially_snoozed', public.recommendation_is_commercially_snoozed(
      v_row.commercial_snooze_until, v_now
    ),
    'status', v_row.status
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


-- ===== superadmin_get_unapplied_billing_event
CREATE OR REPLACE FUNCTION public.superadmin_get_unapplied_billing_event(p_event_id UUID)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  provider TEXT,
  event_id TEXT,
  event_type TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event required';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.organization_id,
    e.provider,
    e.event_id,
    e.event_type,
    e.payload,
    e.processed_at
  FROM public.billing_events e
  WHERE e.id = p_event_id
    AND e.applied_at IS NULL;
END;
$$;


-- ===== superadmin_grant_addon
CREATE OR REPLACE FUNCTION public.superadmin_grant_addon(
  p_organization_id UUID,
  p_addon_key TEXT,
  p_reason TEXT DEFAULT NULL,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin UUID;
  v_addon RECORD;
  v_id UUID;
BEGIN
  v_admin := public.require_platform_admin();

  IF NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = p_organization_id AND o.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'organization not found';
  END IF;

  SELECT id, key, is_active
  INTO v_addon
  FROM public.addons
  WHERE key = p_addon_key;

  IF v_addon.id IS NULL THEN
    RAISE EXCEPTION 'unknown add-on: %', p_addon_key;
  END IF;

  IF v_addon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'inactive add-on: %', p_addon_key;
  END IF;

  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'addon ends_at must be after starts_at';
  END IF;

  UPDATE public.organization_addons g
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    reason = COALESCE(p_reason, g.reason),
    metadata = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'replaced_by_grant', true,
      'replaced_at', timezone('utc', now())
    )
  WHERE g.organization_id = p_organization_id
    AND g.addon_id = v_addon.id
    AND g.status = 'active'
    AND g.cancelled_at IS NULL;

  INSERT INTO public.organization_addons (
    organization_id, addon_id, status, starts_at, ends_at, reason, granted_by, metadata
  )
  VALUES (
    p_organization_id,
    v_addon.id,
    'active',
    COALESCE(p_starts_at, timezone('utc', now())),
    p_ends_at,
    p_reason,
    v_admin,
    jsonb_build_object('source', 'superadmin_grant_addon')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('organization_addon_id', v_id, 'addon_key', p_addon_key);
END;
$$;


-- ===== superadmin_list_addons_ending_soon
CREATE OR REPLACE FUNCTION public.superadmin_list_addons_ending_soon(
  p_remind_days INT DEFAULT 3,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  addon_key TEXT,
  addon_name TEXT,
  ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remind INTERVAL;
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_remind := make_interval(days => GREATEST(COALESCE(p_remind_days, 3), 1));
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    a.key,
    a.name,
    g.ends_at
  FROM public.organization_addons g
  JOIN public.addons a ON a.id = g.addon_id
  JOIN public.organizations o ON o.id = g.organization_id
  WHERE o.deleted_at IS NULL
    AND g.status = 'active'
    AND g.cancelled_at IS NULL
    AND g.ends_at IS NOT NULL
    AND g.ends_at > timezone('utc', now())
    AND g.ends_at <= timezone('utc', now()) + v_remind
  ORDER BY g.ends_at ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_billing_events
CREATE OR REPLACE FUNCTION public.superadmin_list_billing_events(
  p_organization_id UUID,
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  event_id TEXT,
  event_type TEXT,
  processed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  RETURN QUERY
  SELECT e.id, e.provider, e.event_id, e.event_type, e.processed_at, e.applied_at
  FROM public.billing_events e
  WHERE e.organization_id = p_organization_id
  ORDER BY e.processed_at DESC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_checkout_intents
CREATE OR REPLACE FUNCTION public.superadmin_list_checkout_intents(
  p_organization_id UUID
)
RETURNS TABLE (
  id UUID,
  kind TEXT,
  target_key TEXT,
  billing_interval TEXT,
  provider TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  PERFORM public._billing_expire_checkout_intents(p_organization_id);

  RETURN QUERY
  SELECT
    i.id,
    i.kind,
    i.target_key,
    i.billing_interval,
    i.provider,
    i.expires_at,
    i.created_at
  FROM public.billing_checkout_intents i
  WHERE i.organization_id = p_organization_id
    AND i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
    AND i.expires_at > timezone('utc', now())
  ORDER BY i.created_at DESC;
END;
$$;


-- ===== superadmin_list_open_checkout_intents
CREATE OR REPLACE FUNCTION public.superadmin_list_open_checkout_intents(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  kind TEXT,
  target_key TEXT,
  billing_interval TEXT,
  provider TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  UPDATE public.billing_checkout_intents AS bci
  SET cancelled_at = timezone('utc', now())
  WHERE bci.consumed_at IS NULL
    AND bci.cancelled_at IS NULL
    AND bci.expires_at <= timezone('utc', now());

  RETURN QUERY
  SELECT
    i.id,
    i.organization_id,
    o.name,
    o.slug,
    i.kind,
    i.target_key,
    i.billing_interval,
    i.provider,
    i.expires_at,
    i.created_at
  FROM public.billing_checkout_intents i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.consumed_at IS NULL
    AND i.cancelled_at IS NULL
    AND i.expires_at > timezone('utc', now())
    AND o.deleted_at IS NULL
  ORDER BY i.created_at ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_open_recommendation_pipeline
CREATE OR REPLACE FUNCTION public.superadmin_list_open_recommendation_pipeline(
  p_limit INT DEFAULT 100,
  p_mine_only BOOLEAN DEFAULT false,
  p_sort TEXT DEFAULT 'age_desc'
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  score INT,
  usage_level NUMERIC,
  age_days INT,
  last_touch_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  is_frozen BOOLEAN,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  commercial_tags TEXT[],
  commercial_note TEXT,
  recommended_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_uid UUID;
  v_sort TEXT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
  v_sort := lower(COALESCE(NULLIF(btrim(p_sort), ''), 'age_desc'));
  IF v_sort NOT IN ('age_desc', 'age_asc', 'severity', 'name', 'follow_up') THEN
    v_sort := 'age_desc';
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.score,
    r.usage_level,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS age_days,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    r.last_contacted_at,
    r.follow_up_at,
    COALESCE(r.is_frozen, false) AS is_frozen,
    r.assigned_to,
    pa.email,
    r.commercial_outcome,
    r.commercial_tags,
    r.commercial_note,
    r.recommended_at
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
    )
  ORDER BY
    CASE
      WHEN v_sort = 'severity' AND r.severity = 'critical' THEN 0
      WHEN v_sort = 'severity' AND r.severity = 'warning' THEN 1
      WHEN v_sort = 'severity' THEN 2
      ELSE 0
    END,
    CASE
      WHEN v_sort = 'age_asc' THEN public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      )
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN v_sort = 'age_desc' THEN public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      )
      ELSE NULL
    END DESC NULLS LAST,
    CASE
      WHEN v_sort = 'follow_up' THEN r.follow_up_at
      ELSE NULL
    END ASC NULLS LAST,
    CASE
      WHEN v_sort = 'name' THEN o.name
      ELSE NULL
    END ASC,
    o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_org_seat_usage
CREATE OR REPLACE FUNCTION public.superadmin_list_org_seat_usage(p_organization_id UUID)
RETURNS TABLE (
  feature_key TEXT,
  used BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  RETURN QUERY SELECT * FROM public.organization_seat_usage(p_organization_id);
END;
$$;


-- ===== superadmin_list_organizations
CREATE OR REPLACE FUNCTION public.superadmin_list_organizations(
  p_search TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25,
  p_plan_key TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan_key TEXT,
  plan_name TEXT,
  status public.subscription_status,
  trial_ends_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page INT;
  v_size INT;
  v_q TEXT;
  v_plan TEXT;
  v_status public.subscription_status;
BEGIN
  PERFORM public.require_platform_admin();
  PERFORM public.expire_due_subscriptions(NULL);
  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_plan := NULLIF(btrim(COALESCE(p_plan_key, '')), '');
  IF p_status IS NULL OR btrim(p_status) = '' THEN
    v_status := NULL;
  ELSIF p_status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired') THEN
    v_status := p_status::public.subscription_status;
  ELSE
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  RETURN QUERY
  WITH latest_sub AS (
    SELECT DISTINCT ON (s.organization_id)
      s.organization_id,
      s.status,
      s.trial_ends_at,
      s.starts_at,
      p.key AS plan_key,
      p.name AS plan_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    ORDER BY s.organization_id, s.created_at DESC
  ),
  filtered AS (
    SELECT
      o.id,
      o.name,
      o.slug,
      cs.plan_key,
      cs.plan_name,
      cs.status,
      cs.trial_ends_at,
      cs.starts_at,
      o.created_at,
      COUNT(*) OVER () AS total_count
    FROM public.organizations o
    LEFT JOIN latest_sub cs ON cs.organization_id = o.id
    WHERE o.deleted_at IS NULL
      AND (
        v_q IS NULL
        OR o.name ILIKE '%' || v_q || '%'
        OR o.slug ILIKE '%' || v_q || '%'
      )
      AND (v_plan IS NULL OR cs.plan_key = v_plan)
      AND (v_status IS NULL OR cs.status = v_status)
  )
  SELECT
    f.id, f.name, f.slug, f.plan_key, f.plan_name, f.status,
    f.trial_ends_at, f.starts_at, f.created_at, f.total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  OFFSET (v_page - 1) * v_size
  LIMIT v_size;
END;
$$;


-- ===== superadmin_list_orgs_over_seats
CREATE OR REPLACE FUNCTION public.superadmin_list_orgs_over_seats(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  plan_key TEXT,
  plan_name TEXT,
  feature_key TEXT,
  used BIGINT,
  limit_value NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN QUERY
  SELECT
    q.organization_id,
    q.organization_name,
    q.organization_slug,
    q.plan_key,
    q.plan_name,
    q.feature_key,
    q.used,
    q.limit_value
  FROM (
    SELECT
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      cs.plan_key,
      cs.plan_name,
      overage.feature_key,
      overage.used,
      overage.limit_value
    FROM public.organizations o
    JOIN LATERAL (
      SELECT s.plan_id, p.key AS plan_key, p.name AS plan_name
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = o.id
        AND s.status IN ('trialing', 'active', 'past_due')
        AND s.cancelled_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1
    ) cs ON true
    JOIN LATERAL (
      SELECT
        u.feature_key,
        u.used,
        (
          CASE
            WHEN ovr.enabled IS TRUE THEN ovr.limit_value
            WHEN pf.enabled IS TRUE THEN pf.limit_value
            ELSE f.default_limit
          END
        ) AS limit_value
      FROM public.organization_seat_usage(o.id) u
      JOIN public.features f
        ON f.key = u.feature_key
       AND f.is_active = true
       AND f.feature_type = 'limit'
      LEFT JOIN public.plan_features pf
        ON pf.plan_id = cs.plan_id
       AND pf.feature_id = f.id
      LEFT JOIN LATERAL (
        SELECT ov.limit_value, ov.enabled
        FROM public.organization_feature_overrides ov
        WHERE ov.organization_id = o.id
          AND ov.feature_id = f.id
          AND (ov.starts_at IS NULL OR ov.starts_at <= timezone('utc', now()))
          AND (ov.ends_at IS NULL OR ov.ends_at > timezone('utc', now()))
        ORDER BY ov.created_at DESC
        LIMIT 1
      ) ovr ON true
      WHERE (ovr.enabled IS NULL OR ovr.enabled IS TRUE)
        AND (
          CASE
            WHEN ovr.enabled IS TRUE THEN ovr.limit_value
            WHEN pf.enabled IS TRUE THEN pf.limit_value
            ELSE f.default_limit
          END
        ) IS NOT NULL
        AND (
          CASE
            WHEN ovr.enabled IS TRUE THEN ovr.limit_value
            WHEN pf.enabled IS TRUE THEN pf.limit_value
            ELSE f.default_limit
          END
        ) > 0
        AND u.used > (
          CASE
            WHEN ovr.enabled IS TRUE THEN ovr.limit_value
            WHEN pf.enabled IS TRUE THEN pf.limit_value
            ELSE f.default_limit
          END
        )
    ) overage ON true
    WHERE o.deleted_at IS NULL
      AND cs.plan_key IS DISTINCT FROM 'legacy'

    UNION ALL

    SELECT
      o.id,
      o.name,
      o.slug,
      cs.plan_key,
      cs.plan_name,
      m.feature_key,
      m.used,
      m.limit_value
    FROM public.organizations o
    JOIN LATERAL (
      SELECT s.plan_id, p.key AS plan_key, p.name AS plan_name
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE s.organization_id = o.id
        AND s.status IN ('trialing', 'active', 'past_due')
        AND s.cancelled_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT 1
    ) cs ON true
    JOIN public.organization_metered_overages(o.id) m ON true
    WHERE o.deleted_at IS NULL
      AND cs.plan_key IS DISTINCT FROM 'legacy'
  ) q
  ORDER BY q.organization_name ASC, q.feature_key ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_orgs_recommendation_inputs
CREATE OR REPLACE FUNCTION public.superadmin_list_orgs_recommendation_inputs(
  p_search TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25,
  p_plan_key TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_recommended_plan TEXT DEFAULT NULL,
  p_upgrade_filter TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan_key TEXT,
  plan_name TEXT,
  status public.subscription_status,
  trial_ends_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  owner_name TEXT,
  users_used BIGINT,
  branches_used BIGINT,
  professionals_used BIGINT,
  patients_used BIGINT,
  ai_used BIGINT,
  whatsapp_used BIGINT,
  storage_used BIGINT,
  has_hospitalization BOOLEAN,
  has_surgery BOOLEAN,
  has_laboratory BOOLEAN,
  has_inventory BOOLEAN,
  has_pharmacy BOOLEAN,
  has_billing BOOLEAN,
  has_cash BOOLEAN,
  has_portal BOOLEAN,
  has_reports BOOLEAN,
  has_ai BOOLEAN,
  has_whatsapp BOOLEAN,
  has_images BOOLEAN,
  has_advanced_reports BOOLEAN,
  access_attempt_features TEXT[],
  rec_status TEXT,
  rec_recommended_plan_key TEXT,
  rec_fingerprint TEXT,
  rec_dismissed_at TIMESTAMPTZ,
  rec_max_usage_ratio_at_dismiss NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page INT;
  v_size INT;
  v_q TEXT;
  v_plan TEXT;
  v_status public.subscription_status;
  v_period_start DATE;
BEGIN
  PERFORM public.require_platform_admin();
  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_plan := NULLIF(btrim(COALESCE(p_plan_key, '')), '');
  v_period_start := date_trunc('month', timezone('utc', now()))::date;

  IF p_status IS NULL OR btrim(p_status) = '' THEN
    v_status := NULL;
  ELSIF p_status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired') THEN
    v_status := p_status::public.subscription_status;
  ELSE
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  RETURN QUERY
  WITH latest_sub AS (
    SELECT DISTINCT ON (s.organization_id)
      s.organization_id,
      s.status,
      s.trial_ends_at,
      s.starts_at,
      p.key AS plan_key,
      p.name AS plan_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    ORDER BY s.organization_id, s.created_at DESC
  ),
  owners AS (
    SELECT DISTINCT ON (bm.organization_id)
      bm.organization_id,
      pr.full_name AS owner_name
    FROM public.branch_members bm
    JOIN public.profiles pr ON pr.id = bm.user_id
    WHERE bm.role = 'owner'
      AND bm.is_active = true
      AND bm.deleted_at IS NULL
      AND pr.deleted_at IS NULL
    ORDER BY bm.organization_id, bm.created_at ASC
  ),
  seats AS (
    SELECT
      o.id AS organization_id,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'users.max') AS users_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'branches.max') AS branches_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'professionals.max') AS professionals_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'patients.max') AS patients_used
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
  ),
  meters AS (
    SELECT
      fu.organization_id,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'ai.monthly_requests'), 0)::BIGINT AS ai_used,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'whatsapp.monthly_messages'), 0)::BIGINT AS whatsapp_used,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'storage.max_mb'), 0)::BIGINT AS storage_used
    FROM public.feature_usage fu
    JOIN public.features f ON f.id = fu.feature_id
    WHERE fu.period_start = v_period_start
    GROUP BY fu.organization_id
  ),
  activity AS (
    SELECT
      o.id AS organization_id,
      EXISTS (
        SELECT 1 FROM public.hospitalizations h
        WHERE h.organization_id = o.id AND h.deleted_at IS NULL
      ) AS has_hospitalization,
      EXISTS (
        SELECT 1 FROM public.surgeries sg
        WHERE sg.organization_id = o.id AND sg.deleted_at IS NULL
      ) AS has_surgery,
      EXISTS (
        SELECT 1 FROM public.lab_orders lo
        WHERE lo.organization_id = o.id AND lo.deleted_at IS NULL
      ) AS has_laboratory,
      EXISTS (
        SELECT 1 FROM public.inventory_products ip
        WHERE ip.organization_id = o.id AND ip.deleted_at IS NULL
      ) AS has_inventory,
      EXISTS (
        SELECT 1 FROM public.prescriptions rx
        WHERE rx.organization_id = o.id AND rx.deleted_at IS NULL
      ) AS has_pharmacy,
      EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.organization_id = o.id AND inv.deleted_at IS NULL
      ) AS has_billing,
      EXISTS (
        SELECT 1 FROM public.cash_sessions cs
        WHERE cs.organization_id = o.id AND cs.deleted_at IS NULL
      ) AS has_cash,
      EXISTS (
        SELECT 1 FROM public.owner_portal_invites opi
        WHERE opi.organization_id = o.id
      ) AS has_portal,
      EXISTS (
        SELECT 1 FROM public.commercial_feature_signals s
        WHERE s.organization_id = o.id
          AND s.feature_key IN ('reports.basic', 'reports.advanced')
          AND s.created_at >= (timezone('utc', now()) - interval '90 days')
      ) AS has_reports,
      EXISTS (
        SELECT 1 FROM public.ai_suggestions ai
        WHERE ai.organization_id = o.id AND ai.deleted_at IS NULL
      ) AS has_ai,
      EXISTS (
        SELECT 1 FROM public.whatsapp_messages wm
        WHERE wm.organization_id = o.id AND wm.deleted_at IS NULL
      ) AS has_whatsapp,
      EXISTS (
        SELECT 1 FROM public.clinical_images ci
        WHERE ci.organization_id = o.id AND ci.deleted_at IS NULL
      ) AS has_images,
      EXISTS (
        SELECT 1 FROM public.commercial_feature_signals s
        WHERE s.organization_id = o.id
          AND s.feature_key = 'reports.advanced'
          AND s.created_at >= (timezone('utc', now()) - interval '90 days')
      ) AS has_advanced_reports
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
  ),
  attempts AS (
    SELECT
      s.organization_id,
      array_agg(DISTINCT s.feature_key) AS access_attempt_features
    FROM public.commercial_feature_signals s
    WHERE s.created_at >= (timezone('utc', now()) - interval '45 days')
    GROUP BY s.organization_id
  ),
  base AS (
    SELECT
      o.id,
      o.name,
      o.slug,
      ls.plan_key,
      ls.plan_name,
      ls.status,
      ls.trial_ends_at,
      ls.starts_at,
      o.created_at,
      ow.owner_name,
      COALESCE(se.users_used, 0) AS users_used,
      COALESCE(se.branches_used, 0) AS branches_used,
      COALESCE(se.professionals_used, 0) AS professionals_used,
      COALESCE(se.patients_used, 0) AS patients_used,
      COALESCE(m.ai_used, 0) AS ai_used,
      COALESCE(m.whatsapp_used, 0) AS whatsapp_used,
      COALESCE(m.storage_used, 0) AS storage_used,
      COALESCE(a.has_hospitalization, false) AS has_hospitalization,
      COALESCE(a.has_surgery, false) AS has_surgery,
      COALESCE(a.has_laboratory, false) AS has_laboratory,
      COALESCE(a.has_inventory, false) AS has_inventory,
      COALESCE(a.has_pharmacy, false) AS has_pharmacy,
      COALESCE(a.has_billing, false) AS has_billing,
      COALESCE(a.has_cash, false) AS has_cash,
      COALESCE(a.has_portal, false) AS has_portal,
      COALESCE(a.has_reports, false) AS has_reports,
      COALESCE(a.has_ai, false) AS has_ai,
      COALESCE(a.has_whatsapp, false) AS has_whatsapp,
      COALESCE(a.has_images, false) AS has_images,
      COALESCE(a.has_advanced_reports, false) AS has_advanced_reports,
      COALESCE(at.access_attempt_features, ARRAY[]::TEXT[]) AS access_attempt_features,
      rec.status AS rec_status,
      rec.recommended_plan_key AS rec_recommended_plan_key,
      rec.fingerprint AS rec_fingerprint,
      rec.dismissed_at AS rec_dismissed_at,
      rec.max_usage_ratio_at_dismiss AS rec_max_usage_ratio_at_dismiss
    FROM public.organizations o
    LEFT JOIN latest_sub ls ON ls.organization_id = o.id
    LEFT JOIN owners ow ON ow.organization_id = o.id
    LEFT JOIN seats se ON se.organization_id = o.id
    LEFT JOIN meters m ON m.organization_id = o.id
    LEFT JOIN activity a ON a.organization_id = o.id
    LEFT JOIN attempts at ON at.organization_id = o.id
    LEFT JOIN public.organization_plan_recommendations rec ON rec.organization_id = o.id
    WHERE o.deleted_at IS NULL
      AND (p_organization_id IS NULL OR o.id = p_organization_id)
      AND (v_q IS NULL OR o.name ILIKE '%' || v_q || '%' OR o.slug ILIKE '%' || v_q || '%')
      AND (v_plan IS NULL OR ls.plan_key = v_plan)
      AND (v_status IS NULL OR ls.status = v_status)
      AND (
        p_recommended_plan IS NULL OR btrim(p_recommended_plan) = ''
        OR rec.recommended_plan_key = btrim(p_recommended_plan)
      )
      AND (
        p_upgrade_filter IS NULL OR btrim(p_upgrade_filter) = ''
        OR (p_upgrade_filter = 'upgrade_recommended' AND rec.status = 'recommended' AND (rec.commercial_outcome IS NULL OR rec.commercial_outcome = 'deferred'))
        OR (p_upgrade_filter = 'closed_outcome' AND rec.commercial_outcome IN ('won', 'lost', 'not_a_fit'))
        OR (p_upgrade_filter = 'stale' AND rec.status IN ('recommended', 'reviewed') AND (rec.commercial_outcome IS NULL OR rec.commercial_outcome = 'deferred') AND COALESCE(rec.last_refreshed_at, rec.recommended_at, rec.updated_at) < timezone('utc', now()) - make_interval(days => COALESCE((SELECT crs.stale_days FROM public.commercial_recommendation_settings crs WHERE crs.id = 1), 14)))
        OR (p_upgrade_filter = 'trial' AND ls.plan_key = 'trial')
        OR (p_upgrade_filter = 'legacy' AND ls.plan_key = 'legacy')
        OR (p_upgrade_filter = 'dismissed' AND rec.status = 'dismissed')
        OR (p_upgrade_filter = 'inactive' AND (ls.status IS NULL OR ls.status IN ('cancelled', 'expired')))
      )
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER() AS total_count
    FROM base b
  )
  SELECT
    c.id,
    c.name,
    c.slug,
    c.plan_key,
    c.plan_name,
    c.status,
    c.trial_ends_at,
    c.starts_at,
    c.created_at,
    c.owner_name,
    c.users_used,
    c.branches_used,
    c.professionals_used,
    c.patients_used,
    c.ai_used,
    c.whatsapp_used,
    c.storage_used,
    c.has_hospitalization,
    c.has_surgery,
    c.has_laboratory,
    c.has_inventory,
    c.has_pharmacy,
    c.has_billing,
    c.has_cash,
    c.has_portal,
    c.has_reports,
    c.has_ai,
    c.has_whatsapp,
    c.has_images,
    c.has_advanced_reports,
    c.access_attempt_features,
    c.rec_status,
    c.rec_recommended_plan_key,
    c.rec_fingerprint,
    c.rec_dismissed_at,
    c.rec_max_usage_ratio_at_dismiss,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'usage_desc' THEN c.patients_used ELSE 0 END DESC,
    CASE WHEN p_sort = 'recommended_recent' THEN c.rec_dismissed_at ELSE NULL END DESC NULLS LAST,
    c.name ASC
  LIMIT v_size
  OFFSET (v_page - 1) * v_size;
END;
$$;


-- ===== superadmin_list_plans_ending_soon
CREATE OR REPLACE FUNCTION public.superadmin_list_plans_ending_soon(
  p_remind_days INT DEFAULT 3,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  plan_key TEXT,
  plan_name TEXT,
  status TEXT,
  ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remind INTERVAL;
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_remind := make_interval(days => GREATEST(COALESCE(p_remind_days, 3), 1));
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.slug,
    p.key,
    p.name,
    s.status::TEXT,
    s.ends_at
  FROM public.organizations o
  JOIN LATERAL (
    SELECT s2.plan_id, s2.status, s2.ends_at
    FROM public.organization_subscriptions s2
    WHERE s2.organization_id = o.id
      AND s2.status IN ('active', 'past_due')
      AND s2.cancelled_at IS NULL
    ORDER BY s2.created_at DESC
    LIMIT 1
  ) s ON true
  JOIN public.plans p ON p.id = s.plan_id
  WHERE o.deleted_at IS NULL
    AND p.key NOT IN ('legacy', 'trial')
    AND s.ends_at IS NOT NULL
    AND s.ends_at > timezone('utc', now())
    AND s.ends_at <= timezone('utc', now()) + v_remind
  ORDER BY s.ends_at ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recent_recommendation_events
CREATE OR REPLACE FUNCTION public.superadmin_list_recent_recommendation_events(
  p_limit INT DEFAULT 40,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  event_type TEXT,
  actor_kind TEXT,
  actor_user_id UUID,
  actor_email TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  severity TEXT,
  score INT,
  note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    e.id,
    e.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    e.event_type,
    e.actor_kind,
    e.actor_user_id,
    pa.email AS actor_email,
    e.current_plan_key,
    e.recommended_plan_key,
    e.severity,
    e.score,
    e.note,
    e.created_at
  FROM public.organization_plan_recommendation_events e
  JOIN public.organizations o ON o.id = e.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = e.actor_user_id
  WHERE o.deleted_at IS NULL
    AND e.event_type IN (
      'noted',
      'follow_up_set',
      'follow_up_cleared',
      'frozen',
      'unfrozen',
      'assigned',
      'unassigned',
      'outcome_set',
      'outcome_cleared',
      'contacted',
      'accepted',
      'dismissed',
      'reopened',
      'cleared',
      'tagged',
      'untagged',
      'commercial_snoozed',
      'commercial_unsnoozed'
    )
    AND (
      COALESCE(p_mine_only, false) = false
      OR e.actor_user_id = v_uid
    )
  ORDER BY e.created_at DESC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_aging
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_aging(
  p_bucket TEXT,
  p_limit INT DEFAULT 40
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  age_days INT,
  last_touch_at TIMESTAMPTZ,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_tags TEXT[],
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_bucket TEXT;
  v_limit INT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  PERFORM public.require_platform_admin();
  v_bucket := lower(COALESCE(NULLIF(btrim(p_bucket), ''), ''));
  IF v_bucket NOT IN ('0-7', '8-14', '15-30', '31-plus', 'unknown') THEN
    RAISE EXCEPTION 'invalid aging bucket';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS age_days,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    r.assigned_to,
    pa.email,
    r.commercial_tags,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      (
        v_bucket = '0-7'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 0 AND 7
      )
      OR (
        v_bucket = '8-14'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 8 AND 14
      )
      OR (
        v_bucket = '15-30'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) BETWEEN 15 AND 30
      )
      OR (
        v_bucket = '31-plus'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) >= 31
      )
      OR (
        v_bucket = 'unknown'
        AND public.recommendation_open_age_days(
          v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) IS NULL
      )
    )
  ORDER BY
    CASE WHEN v_bucket = 'unknown' THEN 0 ELSE 1 END,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_assignees
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_assignees()
RETURNS TABLE (
  user_id UUID,
  email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  RETURN QUERY
  SELECT pa.user_id, pa.email
  FROM public.platform_admins pa
  WHERE pa.is_active = true
  ORDER BY pa.email ASC;
END;
$$;


-- ===== superadmin_list_recommendation_by_tag
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_by_tag(
  p_tag TEXT,
  p_limit INT DEFAULT 40
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  commercial_tags TEXT[],
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tag TEXT;
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_tag := (public.normalize_commercial_tags(ARRAY[p_tag]))[1];
  IF v_tag IS NULL THEN
    RAISE EXCEPTION 'tag required';
  END IF;
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.commercial_tags,
    r.assigned_to,
    pa.email,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND v_tag = ANY (COALESCE(r.commercial_tags, '{}'::TEXT[]))
  ORDER BY o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_commercial_snoozed
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_commercial_snoozed(
  p_limit INT DEFAULT 40,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  commercial_snooze_until TIMESTAMPTZ,
  commercial_snooze_note TEXT,
  commercial_snoozed_at TIMESTAMPTZ,
  snoozed_by UUID,
  snoozed_by_email TEXT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_tags TEXT[],
  is_frozen BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.commercial_snooze_until,
    r.commercial_snooze_note,
    r.commercial_snoozed_at,
    r.commercial_snoozed_by,
    sb.email,
    r.assigned_to,
    pa.email,
    r.commercial_tags,
    COALESCE(r.is_frozen, false)
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  LEFT JOIN public.platform_admins sb ON sb.user_id = r.commercial_snoozed_by
  WHERE o.deleted_at IS NULL
    AND public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
      OR r.commercial_snoozed_by = v_uid
    )
  ORDER BY r.commercial_snooze_until ASC NULLS LAST, o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_follow_ups
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_follow_ups(
  p_limit INT DEFAULT 25,
  p_assigned_to UUID DEFAULT NULL,
  p_unassigned_only BOOLEAN DEFAULT false
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  follow_up_at TIMESTAMPTZ,
  commercial_note TEXT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    r.follow_up_at,
    r.commercial_note,
    r.assigned_to,
    pa.email AS assigned_email,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.follow_up_at IS NOT NULL
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_unassigned_only, false) = false
      OR r.assigned_to IS NULL
    )
    AND (
      p_assigned_to IS NULL
      OR r.assigned_to = p_assigned_to
    )
  ORDER BY r.follow_up_at ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_outcomes
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_outcomes(
  p_limit INT DEFAULT 25,
  p_outcome TEXT DEFAULT NULL
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  commercial_outcome TEXT,
  commercial_outcome_at TIMESTAMPTZ,
  commercial_outcome_note TEXT,
  assigned_to UUID,
  assigned_email TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  IF p_outcome IS NOT NULL AND p_outcome NOT IN ('won', 'lost', 'deferred', 'not_a_fit') THEN
    RAISE EXCEPTION 'invalid commercial outcome filter';
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    r.commercial_outcome,
    r.commercial_outcome_at,
    r.commercial_outcome_note,
    r.assigned_to,
    pa.email AS assigned_email
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.commercial_outcome IS NOT NULL
    AND (p_outcome IS NULL OR r.commercial_outcome = p_outcome)
  ORDER BY r.commercial_outcome_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_priority_queue
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_priority_queue(
  p_limit INT DEFAULT 25,
  p_mine_only BOOLEAN DEFAULT false,
  p_include_frozen BOOLEAN DEFAULT false,
  p_include_snoozed BOOLEAN DEFAULT false
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  score INT,
  usage_level NUMERIC,
  age_days INT,
  priority INT,
  priority_reasons TEXT[],
  last_touch_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  follow_up_at TIMESTAMPTZ,
  is_frozen BOOLEAN,
  commercial_snooze_until TIMESTAMPTZ,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  commercial_tags TEXT[],
  commercial_note TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_uid UUID;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_weights JSONB;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  SELECT public.normalize_recommendation_priority_weights(s.priority_weights)
  INTO v_weights
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;

  IF v_weights IS NULL THEN
    v_weights := public.default_recommendation_priority_weights();
  END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.score,
    r.usage_level,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS age_days,
    public.recommendation_commercial_priority(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to,
      v_weights
    ) AS priority,
    public.recommendation_commercial_priority_reasons(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to
    ) AS priority_reasons,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    r.last_contacted_at,
    r.follow_up_at,
    COALESCE(r.is_frozen, false) AS is_frozen,
    r.commercial_snooze_until,
    r.assigned_to,
    pa.email,
    r.commercial_outcome,
    r.commercial_tags,
    r.commercial_note
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND (
      COALESCE(p_include_frozen, false) = true
      OR COALESCE(r.is_frozen, false) = false
    )
    AND (
      COALESCE(p_include_snoozed, false) = true
      OR NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
    )
    AND (
      COALESCE(p_mine_only, false) = false
      OR r.assigned_to = v_uid
    )
  ORDER BY
    public.recommendation_commercial_priority(
      v_now,
      r.severity,
      r.usage_level,
      public.recommendation_open_age_days(
        v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ),
      r.last_contacted_at,
      r.follow_up_at,
      COALESCE(r.is_frozen, false),
      r.assigned_to,
      v_weights
    ) DESC,
    public.recommendation_open_age_days(
      v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_saved_views
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_saved_views()
RETURNS TABLE (
  id UUID,
  name TEXT,
  query_params JSONB,
  is_shared BOOLEAN,
  owner_user_id UUID,
  owner_email TEXT,
  is_mine BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := public.require_platform_admin();

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.query_params,
    v.is_shared,
    v.owner_user_id,
    pa.email,
    (v.owner_user_id = v_uid) AS is_mine,
    v.created_at,
    v.updated_at
  FROM public.commercial_recommendation_saved_views v
  LEFT JOIN public.platform_admins pa ON pa.user_id = v.owner_user_id
  WHERE v.owner_user_id = v_uid
     OR v.is_shared = true
  ORDER BY
    (v.owner_user_id = v_uid) DESC,
    v.updated_at DESC,
    v.name ASC
  LIMIT 100;
END;
$$;


-- ===== superadmin_list_recommendation_stale
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_stale(
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  last_touch_at TIMESTAMPTZ,
  stale_days INT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  last_contacted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_stale INT := 14;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  SELECT s.stale_days INTO v_stale
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) AS last_touch_at,
    v_stale AS stale_days,
    r.assigned_to,
    pa.email AS assigned_email,
    r.commercial_outcome,
    r.last_contacted_at
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) < timezone('utc', now()) - make_interval(days => v_stale)
  ORDER BY public.recommendation_commercial_touch_at(
    r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
  ) ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_list_recommendation_tag_catalog
CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_tag_catalog()
RETURNS TABLE (
  tag TEXT,
  org_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  RETURN QUERY
  SELECT t.tag, COUNT(DISTINCT r.organization_id) AS org_count
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  CROSS JOIN LATERAL unnest(COALESCE(r.commercial_tags, '{}'::TEXT[])) AS t(tag)
  WHERE o.deleted_at IS NULL
    AND cardinality(COALESCE(r.commercial_tags, '{}'::TEXT[])) > 0
  GROUP BY t.tag
  ORDER BY org_count DESC, t.tag ASC
  LIMIT 100;
END;
$$;


-- ===== superadmin_list_unapplied_billing_events
CREATE OR REPLACE FUNCTION public.superadmin_list_unapplied_billing_events(
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  provider TEXT,
  event_id TEXT,
  event_type TEXT,
  processed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);

  RETURN QUERY
  SELECT
    e.id,
    e.organization_id,
    o.name,
    o.slug,
    e.provider,
    e.event_id,
    e.event_type,
    e.processed_at
  FROM public.billing_events e
  LEFT JOIN public.organizations o ON o.id = e.organization_id
  WHERE e.applied_at IS NULL
  ORDER BY e.processed_at ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_open_checkout_intents
CREATE OR REPLACE FUNCTION public.superadmin_open_checkout_intents()
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();

  UPDATE public.billing_checkout_intents
  SET cancelled_at = timezone('utc', now())
  WHERE consumed_at IS NULL
    AND cancelled_at IS NULL
    AND expires_at <= timezone('utc', now());

  RETURN (
    SELECT COUNT(*)::INT
    FROM public.billing_checkout_intents i
    WHERE i.consumed_at IS NULL
      AND i.cancelled_at IS NULL
      AND i.expires_at > timezone('utc', now())
  );
END;
$$;


-- ===== superadmin_pending_billing_events
CREATE OR REPLACE FUNCTION public.superadmin_pending_billing_events()
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.require_platform_admin();
  RETURN (
    SELECT COUNT(*)::INT
    FROM public.billing_events e
    WHERE e.applied_at IS NULL
  );
END;
$$;


-- ===== superadmin_recommendation_aging
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_aging()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_open INT := 0;
  v_d0_7 INT := 0;
  v_d8_14 INT := 0;
  v_d15_30 INT := 0;
  v_d31_plus INT := 0;
  v_unknown INT := 0;
  v_avg_age NUMERIC;
  v_median_age NUMERIC;
BEGIN
  PERFORM public.require_platform_admin();

  WITH open_rows AS (
    SELECT
      public.recommendation_open_age_days(
        v_now,
        r.last_contacted_at,
        r.last_refreshed_at,
        r.recommended_at,
        r.updated_at
      ) AS age_days
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days <= 7),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days BETWEEN 8 AND 14),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days BETWEEN 15 AND 30),
    COUNT(*) FILTER (WHERE age_days IS NOT NULL AND age_days >= 31),
    COUNT(*) FILTER (WHERE age_days IS NULL),
    AVG(age_days) FILTER (WHERE age_days IS NOT NULL)
  INTO
    v_open,
    v_d0_7,
    v_d8_14,
    v_d15_30,
    v_d31_plus,
    v_unknown,
    v_avg_age
  FROM open_rows;

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY age_days)
  INTO v_median_age
  FROM (
    SELECT
      public.recommendation_open_age_days(
        v_now,
        r.last_contacted_at,
        r.last_refreshed_at,
        r.recommended_at,
        r.updated_at
      ) AS age_days
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
  ) aged
  WHERE age_days IS NOT NULL;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'open_pipeline', v_open,
    'bucket_0_7', v_d0_7,
    'bucket_8_14', v_d8_14,
    'bucket_15_30', v_d15_30,
    'bucket_31_plus', v_d31_plus,
    'bucket_unknown', v_unknown,
    'avg_age_days', CASE WHEN v_avg_age IS NULL THEN NULL ELSE ROUND(v_avg_age, 1) END,
    'median_age_days', CASE WHEN v_median_age IS NULL THEN NULL ELSE ROUND(v_median_age::NUMERIC, 1) END
  );
END;
$$;


-- ===== superadmin_recommendation_assignee_scorecard
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_assignee_scorecard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_rows JSONB := '[]'::JSONB;
  v_unassigned JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_open DESC, sort_email ASC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'assignee_user_id', pa.user_id,
        'assignee_email', pa.email,
        'open_pipeline', COALESCE(s.open_pipeline, 0),
        'contacted_open', COALESCE(s.contacted_open, 0),
        'with_follow_up', COALESCE(s.with_follow_up, 0),
        'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
        'frozen_open', COALESCE(s.frozen_open, 0),
        'outcome_won', COALESCE(s.outcome_won, 0),
        'outcome_lost', COALESCE(s.outcome_lost, 0),
        'outcome_deferred', COALESCE(s.outcome_deferred, 0),
        'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
        'closed_decisions', COALESCE(s.closed_decisions, 0),
        'contact_rate_pct', CASE
          WHEN COALESCE(s.open_pipeline, 0) > 0
            THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'win_rate_pct', CASE
          WHEN COALESCE(s.closed_decisions, 0) > 0
            THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'avg_days_open', CASE
          WHEN s.avg_days_open IS NULL THEN NULL
          ELSE ROUND(s.avg_days_open, 1)
        END
      ) AS row_data,
      COALESCE(s.open_pipeline, 0) AS sort_open,
      pa.email AS sort_email
    FROM public.platform_admins pa
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        ) AS open_pipeline,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.last_contacted_at IS NOT NULL
        ) AS contacted_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
        ) AS with_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
            AND r.follow_up_at < v_now
        ) AS overdue_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.is_frozen = true
        ) AS frozen_open,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
        COUNT(*) FILTER (
          WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
        ) AS closed_decisions,
        AVG(
          EXTRACT(EPOCH FROM (
            v_now - public.recommendation_commercial_touch_at(
              r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            )
          )) / 86400.0
        ) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_commercial_touch_at(
              r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) IS NOT NULL
        ) AS avg_days_open
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE o.deleted_at IS NULL
        AND r.assigned_to = pa.user_id
    ) s ON true
    WHERE pa.is_active = true
      AND (
        COALESCE(s.open_pipeline, 0)
        + COALESCE(s.closed_decisions, 0)
        + COALESCE(s.outcome_deferred, 0)
      ) > 0
  ) scored;

  SELECT jsonb_build_object(
    'assignee_user_id', NULL,
    'assignee_email', NULL,
    'open_pipeline', COALESCE(s.open_pipeline, 0),
    'contacted_open', COALESCE(s.contacted_open, 0),
    'with_follow_up', COALESCE(s.with_follow_up, 0),
    'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
    'frozen_open', COALESCE(s.frozen_open, 0),
    'outcome_won', COALESCE(s.outcome_won, 0),
    'outcome_lost', COALESCE(s.outcome_lost, 0),
    'outcome_deferred', COALESCE(s.outcome_deferred, 0),
    'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
    'closed_decisions', COALESCE(s.closed_decisions, 0),
    'contact_rate_pct', CASE
      WHEN COALESCE(s.open_pipeline, 0) > 0
        THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'win_rate_pct', CASE
      WHEN COALESCE(s.closed_decisions, 0) > 0
        THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'avg_days_open', CASE
      WHEN s.avg_days_open IS NULL THEN NULL
      ELSE ROUND(s.avg_days_open, 1)
    END
  )
  INTO v_unassigned
  FROM (
    SELECT
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      ) AS open_pipeline,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.last_contacted_at IS NOT NULL
      ) AS contacted_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
      ) AS with_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
          AND r.follow_up_at < v_now
      ) AS overdue_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.is_frozen = true
      ) AS frozen_open,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
      COUNT(*) FILTER (
        WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      ) AS closed_decisions,
      AVG(
        EXTRACT(EPOCH FROM (
          v_now - public.recommendation_commercial_touch_at(
            r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          )
        )) / 86400.0
      ) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_commercial_touch_at(
            r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) IS NOT NULL
      ) AS avg_days_open
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.assigned_to IS NULL
  ) s;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'assignees', v_rows,
    'unassigned', v_unassigned
  );
END;
$$;


-- ===== superadmin_recommendation_assignee_workload
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_assignee_workload()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_weights JSONB;
  v_rows JSONB := '[]'::JSONB;
  v_unassigned JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT public.normalize_recommendation_priority_weights(s.priority_weights)
  INTO v_weights
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;

  IF v_weights IS NULL THEN
    v_weights := public.default_recommendation_priority_weights();
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_priority DESC, sort_open DESC, sort_email ASC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'assignee_user_id', pa.user_id,
        'assignee_email', pa.email,
        'open_pipeline', COALESCE(s.open_pipeline, 0),
        'open_active', COALESCE(s.open_active, 0),
        'critical_open', COALESCE(s.critical_open, 0),
        'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
        'aging_31_plus', COALESCE(s.aging_31_plus, 0),
        'never_contacted', COALESCE(s.never_contacted, 0),
        'frozen_open', COALESCE(s.frozen_open, 0),
        'priority_sum', COALESCE(s.priority_sum, 0),
        'avg_priority', CASE
          WHEN COALESCE(s.open_active, 0) > 0
            THEN ROUND(s.priority_sum::NUMERIC / s.open_active::NUMERIC, 1)
          ELSE NULL
        END
      ) AS row_data,
      COALESCE(s.priority_sum, 0) AS sort_priority,
      COALESCE(s.open_pipeline, 0) AS sort_open,
      pa.email AS sort_email
    FROM public.platform_admins pa
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        ) AS open_pipeline,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = false
        ) AS open_active,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.severity = 'critical'
            AND COALESCE(r.is_frozen, false) = false
        ) AS critical_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
            AND r.follow_up_at < v_now
            AND COALESCE(r.is_frozen, false) = false
        ) AS overdue_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_open_age_days(
              v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) >= 31
            AND COALESCE(r.is_frozen, false) = false
        ) AS aging_31_plus,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.last_contacted_at IS NULL
            AND COALESCE(r.is_frozen, false) = false
        ) AS never_contacted,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = true
        ) AS frozen_open,
        COALESCE(SUM(
          public.recommendation_commercial_priority(
            v_now,
            r.severity,
            r.usage_level,
            public.recommendation_open_age_days(
              v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ),
            r.last_contacted_at,
            r.follow_up_at,
            COALESCE(r.is_frozen, false),
            r.assigned_to,
            v_weights
          )
        ) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND COALESCE(r.is_frozen, false) = false
        ), 0) AS priority_sum
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE o.deleted_at IS NULL
        AND r.assigned_to = pa.user_id
    ) s ON true
    WHERE pa.is_active = true
      AND COALESCE(s.open_pipeline, 0) > 0
  ) scored;

  SELECT jsonb_build_object(
    'assignee_user_id', NULL,
    'assignee_email', NULL,
    'open_pipeline', COALESCE(s.open_pipeline, 0),
    'open_active', COALESCE(s.open_active, 0),
    'critical_open', COALESCE(s.critical_open, 0),
    'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
    'aging_31_plus', COALESCE(s.aging_31_plus, 0),
    'never_contacted', COALESCE(s.never_contacted, 0),
    'frozen_open', COALESCE(s.frozen_open, 0),
    'priority_sum', COALESCE(s.priority_sum, 0),
    'avg_priority', CASE
      WHEN COALESCE(s.open_active, 0) > 0
        THEN ROUND(s.priority_sum::NUMERIC / s.open_active::NUMERIC, 1)
      ELSE NULL
    END
  )
  INTO v_unassigned
  FROM (
    SELECT
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      ) AS open_pipeline,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = false
      ) AS open_active,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.severity = 'critical'
          AND COALESCE(r.is_frozen, false) = false
      ) AS critical_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
          AND r.follow_up_at < v_now
          AND COALESCE(r.is_frozen, false) = false
      ) AS overdue_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_open_age_days(
            v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) >= 31
          AND COALESCE(r.is_frozen, false) = false
      ) AS aging_31_plus,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.last_contacted_at IS NULL
          AND COALESCE(r.is_frozen, false) = false
      ) AS never_contacted,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = true
      ) AS frozen_open,
      COALESCE(SUM(
        public.recommendation_commercial_priority(
          v_now,
          r.severity,
          r.usage_level,
          public.recommendation_open_age_days(
            v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ),
          r.last_contacted_at,
          r.follow_up_at,
          COALESCE(r.is_frozen, false),
          r.assigned_to,
          v_weights
        )
      ) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND COALESCE(r.is_frozen, false) = false
      ), 0) AS priority_sum
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND r.assigned_to IS NULL
  ) s;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'assignees', v_rows,
    'unassigned', v_unassigned
  );
END;
$$;


-- ===== superadmin_recommendation_digest
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_digest(
  p_limit INT DEFAULT 12,
  p_mine_only BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_limit INT;
  v_stale INT := 14;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_today_start TIMESTAMPTZ;
  v_today_end TIMESTAMPTZ;
  v_overdue JSONB;
  v_due_today JSONB;
  v_stale_unassigned JSONB;
  v_critical_unassigned JSONB;
  v_recent_outcomes JSONB;
  v_never_contacted JSONB;
  v_mine UUID;
BEGIN
  v_uid := public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50);
  v_mine := CASE WHEN COALESCE(p_mine_only, false) THEN v_uid ELSE NULL END;

  SELECT s.stale_days INTO v_stale
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  v_today_start := date_trunc('day', v_now);
  v_today_end := v_today_start + interval '1 day';

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC), '[]'::jsonb)
  INTO v_overdue
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.follow_up_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'overdue_follow_up'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.follow_up_at IS NOT NULL
      AND r.follow_up_at < v_today_start
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.follow_up_at ASC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC), '[]'::jsonb)
  INTO v_due_today
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.follow_up_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'due_today'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.follow_up_at IS NOT NULL
      AND r.follow_up_at >= v_today_start
      AND r.follow_up_at < v_today_end
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.follow_up_at ASC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC NULLS FIRST), '[]'::jsonb)
  INTO v_stale_unassigned
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      public.recommendation_commercial_touch_at(
        r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ) AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      CASE WHEN v_mine IS NOT NULL THEN 'stale_mine' ELSE 'stale_unassigned' END AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
      AND public.recommendation_commercial_touch_at(
        r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
      ) < v_now - make_interval(days => v_stale)
      AND (
        (v_mine IS NULL AND r.assigned_to IS NULL)
        OR (v_mine IS NOT NULL AND r.assigned_to = v_mine)
      )
    ORDER BY public.recommendation_commercial_touch_at(
      r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
    ) ASC NULLS FIRST
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.usage_level DESC), '[]'::jsonb)
  INTO v_critical_unassigned
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.recommended_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      CASE WHEN v_mine IS NOT NULL THEN 'critical_mine' ELSE 'critical_unassigned' END AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status = 'recommended'
      AND r.severity = 'critical'
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
      AND (
        (v_mine IS NULL AND r.assigned_to IS NULL)
        OR (v_mine IS NOT NULL AND r.assigned_to = v_mine)
      )
    ORDER BY r.usage_level DESC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_recent_outcomes
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      r.commercial_outcome_at AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_outcome_note AS commercial_note,
      ('outcome_' || r.commercial_outcome)::TEXT AS kind,
      r.commercial_outcome
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.commercial_outcome IS NOT NULL
      AND r.commercial_outcome_at IS NOT NULL
      AND r.commercial_outcome_at >= v_now - interval '7 days'
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY r.commercial_outcome_at DESC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_at ASC NULLS FIRST), '[]'::jsonb)
  INTO v_never_contacted
  FROM (
    SELECT
      r.organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      r.current_plan_key,
      r.recommended_plan_key,
      r.status,
      r.severity,
      r.usage_level,
      COALESCE(r.recommended_at, r.updated_at) AS sort_at,
      r.assigned_to,
      pa.email AS assigned_email,
      r.commercial_note,
      'never_contacted'::TEXT AS kind
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
    WHERE o.deleted_at IS NULL
      AND r.status IN ('recommended', 'reviewed')
      AND r.last_contacted_at IS NULL
      AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      AND NOT public.recommendation_is_commercially_snoozed(r.commercial_snooze_until, v_now)
      AND (v_mine IS NULL OR r.assigned_to = v_mine)
    ORDER BY COALESCE(r.recommended_at, r.updated_at) ASC NULLS FIRST
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'stale_days', v_stale,
    'mine_only', COALESCE(p_mine_only, false),
    'counts', jsonb_build_object(
      'overdue_follow_ups', jsonb_array_length(v_overdue),
      'due_today', jsonb_array_length(v_due_today),
      'stale_unassigned', jsonb_array_length(v_stale_unassigned),
      'critical_unassigned', jsonb_array_length(v_critical_unassigned),
      'recent_outcomes', jsonb_array_length(v_recent_outcomes),
      'never_contacted', jsonb_array_length(v_never_contacted)
    ),
    'overdue_follow_ups', v_overdue,
    'due_today', v_due_today,
    'stale_unassigned', v_stale_unassigned,
    'critical_unassigned', v_critical_unassigned,
    'recent_outcomes', v_recent_outcomes,
    'never_contacted', v_never_contacted
  );
END;
$$;


-- ===== superadmin_recommendation_funnel
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_funnel()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_open INT := 0;
  v_contacted_open INT := 0;
  v_with_follow_up INT := 0;
  v_with_assignee INT := 0;
  v_frozen_open INT := 0;
  v_won INT := 0;
  v_lost INT := 0;
  v_deferred INT := 0;
  v_not_a_fit INT := 0;
  v_closed INT := 0;
  v_accepted INT := 0;
  v_avg_days_to_contact NUMERIC;
  v_avg_days_to_outcome NUMERIC;
  v_avg_days_open NUMERIC;
  v_contact_rate NUMERIC;
  v_win_rate NUMERIC;
  v_close_rate NUMERIC;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.last_contacted_at IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.follow_up_at IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.assigned_to IS NOT NULL
    ),
    COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.is_frozen = true
    ),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit'),
    COUNT(*) FILTER (WHERE r.status = 'accepted'),
    AVG(
      EXTRACT(EPOCH FROM (r.last_contacted_at - COALESCE(r.recommended_at, r.created_at))) / 86400.0
    ) FILTER (
      WHERE r.last_contacted_at IS NOT NULL
        AND COALESCE(r.recommended_at, r.created_at) IS NOT NULL
        AND r.last_contacted_at >= COALESCE(r.recommended_at, r.created_at)
    ),
    AVG(
      EXTRACT(EPOCH FROM (r.commercial_outcome_at - COALESCE(r.recommended_at, r.created_at))) / 86400.0
    ) FILTER (
      WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
        AND r.commercial_outcome_at IS NOT NULL
        AND COALESCE(r.recommended_at, r.created_at) IS NOT NULL
        AND r.commercial_outcome_at >= COALESCE(r.recommended_at, r.created_at)
    ),
    AVG(
      EXTRACT(EPOCH FROM (
        v_now - public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        )
      )) / 86400.0
    ) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) IS NOT NULL
    )
  INTO
    v_open,
    v_contacted_open,
    v_with_follow_up,
    v_with_assignee,
    v_frozen_open,
    v_won,
    v_lost,
    v_deferred,
    v_not_a_fit,
    v_accepted,
    v_avg_days_to_contact,
    v_avg_days_to_outcome,
    v_avg_days_open
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  WHERE o.deleted_at IS NULL;

  v_closed := v_won + v_lost + v_not_a_fit;
  v_contact_rate := CASE
    WHEN v_open > 0 THEN ROUND((v_contacted_open::NUMERIC / v_open::NUMERIC) * 100, 1)
    ELSE NULL
  END;
  v_win_rate := CASE
    WHEN v_closed > 0 THEN ROUND((v_won::NUMERIC / v_closed::NUMERIC) * 100, 1)
    ELSE NULL
  END;
  v_close_rate := CASE
    WHEN (v_open + v_closed) > 0 THEN ROUND((v_closed::NUMERIC / (v_open + v_closed)::NUMERIC) * 100, 1)
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'open_pipeline', v_open,
    'contacted_open', v_contacted_open,
    'with_follow_up', v_with_follow_up,
    'with_assignee', v_with_assignee,
    'frozen_open', v_frozen_open,
    'outcome_won', v_won,
    'outcome_lost', v_lost,
    'outcome_deferred', v_deferred,
    'outcome_not_a_fit', v_not_a_fit,
    'closed_decisions', v_closed,
    'accepted_plan_changes', v_accepted,
    'contact_rate_pct', v_contact_rate,
    'win_rate_pct', v_win_rate,
    'close_rate_pct', v_close_rate,
    'avg_days_to_first_contact', CASE
      WHEN v_avg_days_to_contact IS NULL THEN NULL
      ELSE ROUND(v_avg_days_to_contact, 1)
    END,
    'avg_days_to_outcome', CASE
      WHEN v_avg_days_to_outcome IS NULL THEN NULL
      ELSE ROUND(v_avg_days_to_outcome, 1)
    END,
    'avg_days_open', CASE
      WHEN v_avg_days_open IS NULL THEN NULL
      ELSE ROUND(v_avg_days_open, 1)
    END
  );
END;
$$;


-- ===== superadmin_recommendation_summary
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_warn NUMERIC := 0.85;
  v_crit NUMERIC := 1.00;
  v_stale INT := 14;
  v_uid UUID;
BEGIN
  v_uid := public.require_platform_admin();

  SELECT threshold_warning, threshold_critical, stale_days
  INTO v_warn, v_crit, v_stale
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_warn IS NULL THEN v_warn := 0.85; END IF;
  IF v_crit IS NULL THEN v_crit := 1.00; END IF;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  SELECT jsonb_build_object(
    'upgrade_recommended', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'reviewed', COUNT(*) FILTER (WHERE r.status = 'reviewed'),
    'dismissed', COUNT(*) FILTER (WHERE r.status = 'dismissed'),
    'accepted', COUNT(*) FILTER (WHERE r.status = 'accepted'),
    'basic_to_pro', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'basic'
        AND r.recommended_plan_key = 'pro'
    ),
    'pro_to_premium', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'pro'
        AND r.recommended_plan_key = 'premium'
    ),
    'premium_to_enterprise', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'premium'
        AND r.recommended_plan_key = 'enterprise'
    ),
    'trial_conversion', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'trial'
    ),
    'legacy_rows', (
      SELECT COUNT(*)
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE p.key = 'legacy'
        AND s.cancelled_at IS NULL
        AND s.status IN ('trialing', 'active', 'past_due')
    ),
    'near_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.usage_level >= v_warn
        AND r.usage_level < v_crit
    ),
    'at_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.usage_level >= v_crit
    ),
    'clinic_dismissed_active', COUNT(*) FILTER (
      WHERE r.clinic_dismissed_at IS NOT NULL
        AND r.clinic_dismissed_fingerprint IS NOT DISTINCT FROM r.fingerprint
        AND r.status IN ('recommended', 'reviewed')
        AND (r.clinic_snooze_until IS NULL OR r.clinic_snooze_until > timezone('utc', now()))
    ),
    'frozen', COUNT(*) FILTER (WHERE r.is_frozen = true),
    'follow_ups_open', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'follow_ups_overdue', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND r.follow_up_at < timezone('utc', now())
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'unassigned_recommended', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_to_me', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to = v_uid
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'outcome_won', COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    'outcome_lost', COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    'outcome_deferred', COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    'outcome_not_a_fit', COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit'),
    'stale_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND public.recommendation_commercial_touch_at(
          r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
        ) < timezone('utc', now()) - make_interval(days => v_stale)
    ),
    'stale_days', v_stale,
    'never_contacted_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.last_contacted_at IS NULL
    )
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;


-- ===== superadmin_recommendation_tag_scorecard
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_tag_scorecard()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_rows JSONB := '[]'::JSONB;
  v_untagged JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_open DESC, sort_tag ASC), '[]'::JSONB)
  INTO v_rows
  FROM (
    SELECT
      jsonb_build_object(
        'tag', t.tag,
        'open_pipeline', COALESCE(s.open_pipeline, 0),
        'contacted_open', COALESCE(s.contacted_open, 0),
        'with_follow_up', COALESCE(s.with_follow_up, 0),
        'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
        'frozen_open', COALESCE(s.frozen_open, 0),
        'aging_31_plus', COALESCE(s.aging_31_plus, 0),
        'outcome_won', COALESCE(s.outcome_won, 0),
        'outcome_lost', COALESCE(s.outcome_lost, 0),
        'outcome_deferred', COALESCE(s.outcome_deferred, 0),
        'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
        'closed_decisions', COALESCE(s.closed_decisions, 0),
        'contact_rate_pct', CASE
          WHEN COALESCE(s.open_pipeline, 0) > 0
            THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'win_rate_pct', CASE
          WHEN COALESCE(s.closed_decisions, 0) > 0
            THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
          ELSE NULL
        END,
        'avg_days_open', CASE
          WHEN s.avg_days_open IS NULL THEN NULL
          ELSE ROUND(s.avg_days_open, 1)
        END
      ) AS row_data,
      COALESCE(s.open_pipeline, 0) AS sort_open,
      t.tag AS sort_tag
    FROM (
      SELECT DISTINCT x AS tag
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      CROSS JOIN LATERAL unnest(COALESCE(r.commercial_tags, '{}'::TEXT[])) AS x
      WHERE o.deleted_at IS NULL
        AND x IS NOT NULL
        AND x <> ''
    ) t
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        ) AS open_pipeline,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.last_contacted_at IS NOT NULL
        ) AS contacted_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
        ) AS with_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.follow_up_at IS NOT NULL
            AND r.follow_up_at < v_now
        ) AS overdue_follow_up,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND r.is_frozen = true
        ) AS frozen_open,
        COUNT(*) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_open_age_days(
              v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) >= 31
        ) AS aging_31_plus,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
        COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
        COUNT(*) FILTER (
          WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
        ) AS closed_decisions,
        AVG(
          EXTRACT(EPOCH FROM (
            v_now - public.recommendation_commercial_touch_at(
              r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            )
          )) / 86400.0
        ) FILTER (
          WHERE r.status IN ('recommended', 'reviewed')
            AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
            AND public.recommendation_commercial_touch_at(
              r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
            ) IS NOT NULL
        ) AS avg_days_open
      FROM public.organization_plan_recommendations r
      JOIN public.organizations o ON o.id = r.organization_id
      WHERE o.deleted_at IS NULL
        AND t.tag = ANY (COALESCE(r.commercial_tags, '{}'::TEXT[]))
    ) s ON true
    WHERE (
      COALESCE(s.open_pipeline, 0)
      + COALESCE(s.closed_decisions, 0)
      + COALESCE(s.outcome_deferred, 0)
    ) > 0
  ) scored;

  SELECT jsonb_build_object(
    'tag', NULL,
    'open_pipeline', COALESCE(s.open_pipeline, 0),
    'contacted_open', COALESCE(s.contacted_open, 0),
    'with_follow_up', COALESCE(s.with_follow_up, 0),
    'overdue_follow_up', COALESCE(s.overdue_follow_up, 0),
    'frozen_open', COALESCE(s.frozen_open, 0),
    'aging_31_plus', COALESCE(s.aging_31_plus, 0),
    'outcome_won', COALESCE(s.outcome_won, 0),
    'outcome_lost', COALESCE(s.outcome_lost, 0),
    'outcome_deferred', COALESCE(s.outcome_deferred, 0),
    'outcome_not_a_fit', COALESCE(s.outcome_not_a_fit, 0),
    'closed_decisions', COALESCE(s.closed_decisions, 0),
    'contact_rate_pct', CASE
      WHEN COALESCE(s.open_pipeline, 0) > 0
        THEN ROUND((s.contacted_open::NUMERIC / s.open_pipeline::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'win_rate_pct', CASE
      WHEN COALESCE(s.closed_decisions, 0) > 0
        THEN ROUND((s.outcome_won::NUMERIC / s.closed_decisions::NUMERIC) * 100, 1)
      ELSE NULL
    END,
    'avg_days_open', CASE
      WHEN s.avg_days_open IS NULL THEN NULL
      ELSE ROUND(s.avg_days_open, 1)
    END
  )
  INTO v_untagged
  FROM (
    SELECT
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
      ) AS open_pipeline,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.last_contacted_at IS NOT NULL
      ) AS contacted_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
      ) AS with_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.follow_up_at IS NOT NULL
          AND r.follow_up_at < v_now
      ) AS overdue_follow_up,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND r.is_frozen = true
      ) AS frozen_open,
      COUNT(*) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_open_age_days(
            v_now, r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) >= 31
      ) AS aging_31_plus,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'won') AS outcome_won,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost') AS outcome_lost,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred') AS outcome_deferred,
      COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit') AS outcome_not_a_fit,
      COUNT(*) FILTER (
        WHERE r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      ) AS closed_decisions,
      AVG(
        EXTRACT(EPOCH FROM (
          v_now - public.recommendation_commercial_touch_at(
            r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          )
        )) / 86400.0
      ) FILTER (
        WHERE r.status IN ('recommended', 'reviewed')
          AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
          AND public.recommendation_commercial_touch_at(
            r.last_contacted_at, r.last_refreshed_at, r.recommended_at, r.updated_at
          ) IS NOT NULL
      ) AS avg_days_open
    FROM public.organization_plan_recommendations r
    JOIN public.organizations o ON o.id = r.organization_id
    WHERE o.deleted_at IS NULL
      AND cardinality(COALESCE(r.commercial_tags, '{}'::TEXT[])) = 0
  ) s;

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'tags', v_rows,
    'untagged', v_untagged
  );
END;
$$;


-- ===== superadmin_recommendation_trends
CREATE OR REPLACE FUNCTION public.superadmin_recommendation_trends()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_d7 TIMESTAMPTZ := v_now - interval '7 days';
  v_d14 TIMESTAMPTZ := v_now - interval '14 days';
  v_d30 TIMESTAMPTZ := v_now - interval '30 days';
  v_d7_cur JSONB;
  v_d7_prev JSONB;
  v_d30_cur JSONB;
BEGIN
  PERFORM public.require_platform_admin();

  v_d7_cur := public.recommendation_trends_window(v_d7, v_now);
  v_d7_prev := public.recommendation_trends_window(v_d14, v_d7);
  v_d30_cur := public.recommendation_trends_window(v_d30, v_now);

  RETURN jsonb_build_object(
    'generated_at', v_now,
    'd7', v_d7_cur,
    'd7_prev', v_d7_prev,
    'd30', v_d30_cur
  );
END;
$$;


-- ===== superadmin_revoke_addon
CREATE OR REPLACE FUNCTION public.superadmin_revoke_addon(
  p_organization_id UUID,
  p_addon_key TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_addon_id UUID;
  v_count INT;
BEGIN
  PERFORM public.require_platform_admin();

  SELECT a.id INTO v_addon_id
  FROM public.addons a
  WHERE a.key = p_addon_key;

  IF v_addon_id IS NULL THEN
    RAISE EXCEPTION 'unknown add-on: %', p_addon_key;
  END IF;

  UPDATE public.organization_addons g
  SET
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    reason = COALESCE(p_reason, g.reason),
    metadata = COALESCE(g.metadata, '{}'::jsonb) || jsonb_build_object(
      'revoked_at', timezone('utc', now())
    )
  WHERE g.organization_id = p_organization_id
    AND g.addon_id = v_addon_id
    AND g.status = 'active'
    AND g.cancelled_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('revoked', v_count, 'addon_key', p_addon_key);
END;
$$;


-- ===== superadmin_search_recommendation_notes
CREATE OR REPLACE FUNCTION public.superadmin_search_recommendation_notes(
  p_query TEXT,
  p_limit INT DEFAULT 40
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  commercial_note TEXT,
  commercial_outcome_note TEXT,
  last_contact_note TEXT,
  frozen_note TEXT,
  commercial_tags TEXT[],
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT,
  matched_in TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q TEXT;
  v_limit INT;
  v_pattern TEXT;
BEGIN
  PERFORM public.require_platform_admin();
  v_q := NULLIF(btrim(COALESCE(p_query, '')), '');
  IF v_q IS NULL OR char_length(v_q) < 2 THEN
    RAISE EXCEPTION 'query too short';
  END IF;
  IF char_length(v_q) > 80 THEN
    RAISE EXCEPTION 'query too long';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100);
  v_pattern := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name,
    o.slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.commercial_note,
    r.commercial_outcome_note,
    r.last_contact_note,
    r.frozen_note,
    r.commercial_tags,
    r.assigned_to,
    pa.email,
    r.commercial_outcome,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN r.commercial_note ILIKE v_pattern ESCAPE '\' THEN 'commercial_note' END,
      CASE WHEN r.commercial_outcome_note ILIKE v_pattern ESCAPE '\' THEN 'outcome_note' END,
      CASE WHEN r.last_contact_note ILIKE v_pattern ESCAPE '\' THEN 'contact_note' END,
      CASE WHEN r.frozen_note ILIKE v_pattern ESCAPE '\' THEN 'frozen_note' END
    ], NULL) AS matched_in
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND (
      r.commercial_note ILIKE v_pattern ESCAPE '\'
      OR r.commercial_outcome_note ILIKE v_pattern ESCAPE '\'
      OR r.last_contact_note ILIKE v_pattern ESCAPE '\'
      OR r.frozen_note ILIKE v_pattern ESCAPE '\'
    )
  ORDER BY
    CASE
      WHEN r.commercial_note ILIKE v_pattern ESCAPE '\' THEN 0
      ELSE 1
    END,
    COALESCE(r.commercial_note_updated_at, r.updated_at) DESC NULLS LAST,
    o.name ASC
  LIMIT v_limit;
END;
$$;


-- ===== superadmin_set_plan_recommendation_commercial_snooze
CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(
  p_organization_id UUID,
  p_days INT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_note TEXT;
  v_until TIMESTAMPTZ;
  v_event TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note too long';
  END IF;

  IF p_days IS NULL THEN
    v_until := NULL;
  ELSE
    IF p_days < 1 OR p_days > 90 THEN
      RAISE EXCEPTION 'snooze days must be between 1 and 90';
    END IF;
    v_until := timezone('utc', now()) + make_interval(days => p_days);
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_snooze_until,
    commercial_snooze_note,
    commercial_snoozed_at,
    commercial_snoozed_by
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    v_until,
    CASE WHEN v_until IS NULL THEN NULL ELSE v_note END,
    CASE WHEN v_until IS NULL THEN NULL ELSE timezone('utc', now()) END,
    CASE WHEN v_until IS NULL THEN NULL ELSE v_uid END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_snooze_until = EXCLUDED.commercial_snooze_until,
    commercial_snooze_note = EXCLUDED.commercial_snooze_note,
    commercial_snoozed_at = EXCLUDED.commercial_snoozed_at,
    commercial_snoozed_by = EXCLUDED.commercial_snoozed_by,
    updated_at = timezone('utc', now())
  RETURNING * INTO v_row;

  IF v_until IS NULL THEN
    v_event := 'commercial_unsnoozed';
  ELSE
    v_event := 'commercial_snoozed';
  END IF;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    v_event,
    'superadmin',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    COALESCE(
      v_note,
      CASE
        WHEN v_until IS NULL THEN 'Commercial snooze cleared'
        ELSE format('Commercial snooze %s days until %s', p_days, v_until::TEXT)
      END
    )
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_snooze_until', v_row.commercial_snooze_until,
    'commercial_snooze_note', v_row.commercial_snooze_note,
    'commercial_snoozed_at', v_row.commercial_snoozed_at,
    'days', p_days
  );
END;
$$;


-- ===== superadmin_set_plan_recommendation_tags
CREATE OR REPLACE FUNCTION public.superadmin_set_plan_recommendation_tags(
  p_organization_id UUID,
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_mode TEXT DEFAULT 'replace'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev TEXT[];
  v_incoming TEXT[];
  v_next TEXT[];
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_mode TEXT;
  v_event TEXT;
  v_note TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_mode := lower(COALESCE(NULLIF(btrim(p_mode), ''), 'replace'));
  IF v_mode NOT IN ('replace', 'add', 'remove') THEN
    RAISE EXCEPTION 'invalid tag mode';
  END IF;

  v_incoming := public.normalize_commercial_tags(p_tags);

  SELECT COALESCE(r.commercial_tags, '{}'::TEXT[]) INTO v_prev
  FROM public.organization_plan_recommendations r
  WHERE r.organization_id = p_organization_id;

  IF NOT FOUND THEN
    v_prev := '{}'::TEXT[];
  END IF;

  IF v_mode = 'replace' THEN
    v_next := v_incoming;
  ELSIF v_mode = 'add' THEN
    SELECT ARRAY(
      SELECT DISTINCT x
      FROM unnest(v_prev || v_incoming) AS x
      WHERE x IS NOT NULL AND x <> ''
      LIMIT 12
    ) INTO v_next;
  ELSE
    SELECT COALESCE(ARRAY(
      SELECT x
      FROM unnest(v_prev) AS x
      WHERE NOT (x = ANY (v_incoming))
    ), '{}'::TEXT[]) INTO v_next;
  END IF;

  v_next := COALESCE(v_next, '{}'::TEXT[]);

  IF v_prev IS NOT DISTINCT FROM v_next THEN
    RETURN jsonb_build_object(
      'organization_id', p_organization_id,
      'commercial_tags', to_jsonb(v_prev),
      'unchanged', true
    );
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    commercial_tags
  )
  VALUES (p_organization_id, 'none', v_next)
  ON CONFLICT (organization_id) DO UPDATE SET
    commercial_tags = EXCLUDED.commercial_tags,
    updated_at = now()
  RETURNING * INTO v_row;

  IF cardinality(v_next) > cardinality(v_prev)
     OR EXISTS (
       SELECT 1 FROM unnest(v_next) t WHERE NOT (t = ANY (v_prev))
     ) THEN
    v_event := 'tagged';
  ELSE
    v_event := 'untagged';
  END IF;

  v_note := left(
    CASE
      WHEN v_mode = 'add' THEN 'Tags +: ' || array_to_string(v_incoming, ', ')
      WHEN v_mode = 'remove' THEN 'Tags -: ' || array_to_string(v_incoming, ', ')
      ELSE 'Tags: ' || COALESCE(NULLIF(array_to_string(v_next, ', '), ''), '(vacío)')
    END,
    500
  );

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    v_event,
    'superadmin',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    v_note
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'commercial_tags', to_jsonb(v_row.commercial_tags),
    'unchanged', false
  );
END;
$$;


-- ===== superadmin_set_recommendation_settings
CREATE OR REPLACE FUNCTION public.superadmin_set_recommendation_settings(
  p_threshold_info NUMERIC DEFAULT NULL,
  p_threshold_warning NUMERIC DEFAULT NULL,
  p_threshold_critical NUMERIC DEFAULT NULL,
  p_clinic_snooze_days INT DEFAULT NULL,
  p_stale_days INT DEFAULT NULL,
  p_priority_weights JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_row public.commercial_recommendation_settings%ROWTYPE;
  v_weights JSONB;
BEGIN
  v_uid := public.require_platform_admin();
  v_weights := CASE
    WHEN p_priority_weights IS NULL THEN NULL
    ELSE public.normalize_recommendation_priority_weights(p_priority_weights)
  END;

  INSERT INTO public.commercial_recommendation_settings AS s (
    id,
    threshold_info,
    threshold_warning,
    threshold_critical,
    clinic_snooze_days,
    stale_days,
    priority_weights,
    updated_at,
    updated_by
  )
  VALUES (
    1,
    COALESCE(p_threshold_info, 0.70),
    COALESCE(p_threshold_warning, 0.85),
    COALESCE(p_threshold_critical, 1.00),
    COALESCE(p_clinic_snooze_days, 14),
    COALESCE(p_stale_days, 14),
    COALESCE(v_weights, public.default_recommendation_priority_weights()),
    now(),
    v_uid
  )
  ON CONFLICT (id) DO UPDATE SET
    threshold_info = COALESCE(p_threshold_info, s.threshold_info),
    threshold_warning = COALESCE(p_threshold_warning, s.threshold_warning),
    threshold_critical = COALESCE(p_threshold_critical, s.threshold_critical),
    clinic_snooze_days = COALESCE(p_clinic_snooze_days, s.clinic_snooze_days),
    stale_days = COALESCE(p_stale_days, s.stale_days),
    priority_weights = COALESCE(v_weights, s.priority_weights),
    updated_at = now(),
    updated_by = v_uid
  RETURNING * INTO v_row;

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


-- ===== superadmin_skip_billing_event
CREATE OR REPLACE FUNCTION public.superadmin_skip_billing_event(
  p_event_id UUID,
  p_kind TEXT DEFAULT NULL,
  p_target_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
  v_released INT := 0;
  v_org UUID;
  v_kind TEXT;
  v_target TEXT;
BEGIN
  PERFORM public.require_platform_admin();

  IF p_event_id IS NULL THEN
    RAISE EXCEPTION 'event required';
  END IF;

  v_kind := NULLIF(trim(COALESCE(p_kind, '')), '');
  v_target := NULLIF(trim(COALESCE(p_target_key, '')), '');
  IF v_kind IS NOT NULL AND v_kind NOT IN ('plan', 'addon') THEN
    RAISE EXCEPTION 'invalid checkout kind';
  END IF;
  IF v_kind = 'addon' AND v_target IS NULL THEN
    v_kind := NULL;
  END IF;

  SELECT e.organization_id
  INTO v_org
  FROM public.billing_events e
  WHERE e.id = p_event_id
    AND e.applied_at IS NULL;

  UPDATE public.billing_events
  SET applied_at = timezone('utc', now())
  WHERE id = p_event_id
    AND applied_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 AND v_org IS NOT NULL AND v_kind IS NOT NULL THEN
    UPDATE public.billing_checkout_intents
    SET cancelled_at = timezone('utc', now())
    WHERE organization_id = v_org
      AND consumed_at IS NULL
      AND cancelled_at IS NULL
      AND kind = v_kind
      AND (v_kind = 'plan' OR target_key = v_target);
    GET DIAGNOSTICS v_released = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'skipped', v_count,
    'organization_id', v_org,
    'released', v_released
  );
END;
$$;


-- ===== superadmin_start_trial
CREATE OR REPLACE FUNCTION public.superadmin_start_trial(
  p_organization_id UUID,
  p_trial_days INT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.superadmin_change_plan(
    p_organization_id, 'trial', p_reason, false, p_trial_days
  );
END;
$$;


-- ===== superadmin_touch_plan_recommendation_contact
CREATE OR REPLACE FUNCTION public.superadmin_touch_plan_recommendation_contact(
  p_organization_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_note TEXT;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    last_contacted_at,
    last_contacted_by,
    last_contact_note
  )
  VALUES (
    p_organization_id,
    COALESCE(v_prev.status, 'none'),
    now(),
    v_uid,
    v_note
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    last_contacted_at = now(),
    last_contacted_by = v_uid,
    last_contact_note = COALESCE(v_note, r.last_contact_note),
    updated_at = now()
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    'contacted',
    'superadmin',
    v_uid,
    v_row.current_plan_key,
    v_row.recommended_plan_key,
    v_row.severity,
    v_row.score,
    v_row.usage_level,
    v_row.reasons,
    v_row.fingerprint,
    COALESCE(v_note, 'Commercial contact registered')
  );

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'last_contacted_at', v_row.last_contacted_at,
    'last_contact_note', v_row.last_contact_note
  );
END;
$$;


-- ===== superadmin_touch_plan_recommendation_refresh
CREATE OR REPLACE FUNCTION public.superadmin_touch_plan_recommendation_refresh(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  PERFORM public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    last_refreshed_at
  )
  VALUES (p_organization_id, 'none', now())
  ON CONFLICT (organization_id) DO UPDATE SET
    last_refreshed_at = now(),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'last_refreshed_at', v_row.last_refreshed_at
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


-- ===== trg_notify_hospitalization
CREATE OR REPLACE FUNCTION public.trg_notify_hospitalization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_patient
  FROM public.patients p
  WHERE p.id = NEW.patient_id;

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'internacion',
    'Internación: ' || COALESCE(v_patient, 'paciente'),
    left(COALESCE(NEW.reason, 'Ingreso a internación'), 500),
    '/internacion/' || NEW.id::TEXT,
    'hospitalization',
    NEW.id,
    NULL
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ===== trg_notify_inventory_stock
CREATE OR REPLACE FUNCTION public.trg_notify_inventory_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.is_active IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.quantity > NEW.min_quantity THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND OLD.quantity <= OLD.min_quantity
    AND OLD.is_active IS TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'stock',
    'Stock bajo: ' || NEW.name,
    'Quedan ' || trim(to_char(NEW.quantity, 'FM999999990.00')) ||
      ' (mínimo ' || trim(to_char(NEW.min_quantity, 'FM999999990.00')) || ')',
    '/inventario/' || NEW.id::TEXT,
    'inventory_product',
    NEW.id,
    168
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ===== trg_notify_invoice
CREATE OR REPLACE FUNCTION public.trg_notify_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'emitida' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'emitida' THEN
    RETURN NEW;
  END IF;

  SELECT o.full_name INTO v_owner
  FROM public.owners o
  WHERE o.id = NEW.owner_id;

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'factura',
    'Factura emitida: ' || COALESCE(NEW.number, 'sin número'),
    COALESCE(v_owner, 'Tutor') || ' · saldo pendiente',
    '/facturacion/' || NEW.id::TEXT,
    'invoice',
    NEW.id,
    NULL
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ===== trg_notify_lab_order
CREATE OR REPLACE FUNCTION public.trg_notify_lab_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'completada' OR OLD.status IS NOT DISTINCT FROM 'completada' THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_patient
  FROM public.patients p
  WHERE p.id = NEW.patient_id;

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'laboratorio',
    'Resultado de laboratorio: ' || COALESCE(v_patient, 'paciente'),
    COALESCE(NEW.title, 'Estudio') || ' listo para revisar',
    '/laboratorio/' || NEW.id::TEXT,
    'lab_order',
    NEW.id,
    NULL
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ===== trg_notify_prescription
CREATE OR REPLACE FUNCTION public.trg_notify_prescription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient TEXT;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.name INTO v_patient
  FROM public.patients p
  WHERE p.id = NEW.patient_id;

  PERFORM public.emit_notification(
    NEW.organization_id,
    NEW.branch_id,
    'receta',
    'Nueva receta: ' || COALESCE(NEW.number, 'sin número'),
    COALESCE(v_patient, 'paciente'),
    '/farmacia/' || NEW.id::TEXT,
    'prescription',
    NEW.id,
    NULL
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;


-- ===== update_waitlist_status
CREATE OR REPLACE FUNCTION public.update_waitlist_status(
  p_id UUID,
  p_status public.waitlist_status,
  p_matched_appointment_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_row public.appointment_waitlist%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();

  IF v_org_id IS NULL OR NOT public.has_permission('appointments:write') THEN
    RAISE EXCEPTION 'Sin permisos para actualizar lista de espera';
  END IF;

  IF p_id IS NULL OR p_status IS NULL THEN
    RAISE EXCEPTION 'id y status son requeridos';
  END IF;

  SELECT * INTO v_row
  FROM public.appointment_waitlist
  WHERE id = p_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entrada de lista de espera no encontrada';
  END IF;

  IF NOT public.user_has_branch_access(v_row.branch_id) THEN
    RAISE EXCEPTION 'Sin acceso a la sucursal';
  END IF;

  IF p_matched_appointment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = p_matched_appointment_id
        AND a.organization_id = v_org_id
        AND a.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cita asociada no encontrada';
    END IF;
  END IF;

  UPDATE public.appointment_waitlist
  SET
    status = p_status,
    matched_appointment_id = COALESCE(p_matched_appointment_id, matched_appointment_id)
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'matched_appointment_id', v_row.matched_appointment_id,
    'updated_at', v_row.updated_at
  );
END;
$$;


-- ===== void_invoice
CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('billing:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  IF v_invoice.status NOT IN ('borrador', 'emitida') THEN
    RAISE EXCEPTION 'No se puede anular esta factura';
  END IF;

  IF v_invoice.paid_amount > 0 THEN
    RAISE EXCEPTION 'No se puede anular una factura con pagos';
  END IF;

  UPDATE public.invoices
  SET
    status = 'anulada',
    voided_at = now()
  WHERE id = v_invoice.id;

  RETURN jsonb_build_object('invoice_id', v_invoice.id);
END;
$$;


-- ===== void_prescription
CREATE OR REPLACE FUNCTION public.void_prescription(
  p_prescription_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_rx public.prescriptions%ROWTYPE;
BEGIN
  v_org_id := public.get_user_organization_id();
  IF v_org_id IS NULL OR NOT public.has_permission('clinical:write') THEN
    RAISE EXCEPTION 'Permiso denegado';
  END IF;

  SELECT * INTO v_rx
  FROM public.prescriptions
  WHERE id = p_prescription_id
    AND organization_id = v_org_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receta no encontrada';
  END IF;

  IF v_rx.status = 'anulada' THEN
    RETURN jsonb_build_object(
      'prescription_id', v_rx.id,
      'number', v_rx.number,
      'status', v_rx.status
    );
  END IF;

  IF v_rx.status <> 'activa' THEN
    RAISE EXCEPTION 'Solo se pueden anular recetas activas';
  END IF;

  UPDATE public.prescriptions
  SET
    status = 'anulada',
    voided_at = now(),
    voided_by = auth.uid(),
    void_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = v_rx.id;

  RETURN jsonb_build_object(
    'prescription_id', v_rx.id,
    'number', v_rx.number,
    'status', 'anulada'
  );
END;
$$;


-- ===== grants / comments
REVOKE ALL ON FUNCTION public._billing_expire_checkout_intents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._billing_expire_checkout_intents(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._billing_grant_ids_match(JSONB, TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._billing_normalize_id_list(TEXT[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._billing_payload_has_ids(JSONB, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_cash_movement(
  UUID,
  TEXT,
  NUMERIC,
  public.payment_method,
  TEXT,
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
GRANT EXECUTE ON FUNCTION public.apply_professional_appointment_hourly_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_lab_pharmacy_vaccination_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_lab_pharmacy_vaccination_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_procedure_shift_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_professional_procedure_shift_rules(
  UUID,
  UUID,
  public.professionals,
  DATE,
  DATE,
  UUID,
  UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_event_summary TO authenticated;
REVOKE ALL ON FUNCTION public.billing_apply_paid_addon(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_apply_paid_addon(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.billing_apply_paid_plan(UUID, TEXT, TEXT, TEXT, TEXT, public.subscription_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_apply_paid_plan(UUID, TEXT, TEXT, TEXT, TEXT, public.subscription_status) TO service_role;
COMMENT ON FUNCTION public.billing_apply_paid_plan(UUID, TEXT, TEXT, TEXT, TEXT, public.subscription_status) IS
  'Webhook/service-role only. Activates a public paid plan. Never legacy/trial.';
REVOKE ALL ON FUNCTION public.billing_attach_paid_grant_ids(UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_attach_paid_grant_ids(UUID, TEXT, TEXT, JSONB) TO service_role;
COMMENT ON FUNCTION public.billing_attach_paid_grant_ids(UUID, TEXT, TEXT, JSONB) IS
  'Webhook/service-role: persist Stripe session/payment_intent/invoice ids on the open grant.';
REVOKE ALL ON FUNCTION public.billing_begin_event(TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_begin_event(TEXT, TEXT, TEXT, UUID, JSONB) TO service_role;
COMMENT ON FUNCTION public.billing_begin_event(TEXT, TEXT, TEXT, UUID, JSONB) IS
  'Service-role only. Claims a provider event. already_applied=true means apply must not run again.';
REVOKE ALL ON FUNCTION public.billing_begin_own_checkout_intent(TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_begin_own_checkout_intent(TEXT, TEXT, TEXT, TEXT, INT) TO authenticated;
COMMENT ON FUNCTION public.billing_begin_own_checkout_intent(TEXT, TEXT, TEXT, TEXT, INT) IS
  'Clinic org:manage starts or reuses a checkout intent. One open plan intent per clinic.';
REVOKE ALL ON FUNCTION public.billing_cancel_own_addon(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_cancel_own_addon(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_cancel_own_checkout_intents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_cancel_own_checkout_intents() TO authenticated;
REVOKE ALL ON FUNCTION public.billing_cancel_own_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_cancel_own_subscription() TO authenticated;
COMMENT ON FUNCTION public.billing_cancel_own_subscription() IS
  'Clinic org:manage may cancel the current non-legacy subscription. Immediate cancel.';
REVOKE ALL ON FUNCTION public.billing_consume_checkout_intents(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_consume_checkout_intents(UUID, TEXT, TEXT) TO service_role;
COMMENT ON FUNCTION public.billing_consume_checkout_intents(UUID, TEXT, TEXT) IS
  'Webhook/service-role: clear open intents after a paid plan or add-on is applied.';
REVOKE ALL ON FUNCTION public.billing_extend_paid_plan(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_extend_paid_plan(UUID, TEXT, TEXT, TEXT) TO service_role;
COMMENT ON FUNCTION public.billing_extend_paid_plan(UUID, TEXT, TEXT, TEXT) IS
  'Webhook/service-role only. Extends the current public paid plan. Never legacy/trial.';
REVOKE ALL ON FUNCTION public.billing_finish_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_finish_event(UUID) TO service_role;
COMMENT ON FUNCTION public.billing_finish_event(UUID) IS
  'Service-role only. Marks a claimed billing event as applied or skipped.';
REVOKE ALL ON FUNCTION public.billing_lookup_paid_grant_from_provider_ids(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_lookup_paid_grant_from_provider_ids(TEXT, TEXT[]) TO service_role;
COMMENT ON FUNCTION public.billing_lookup_paid_grant_from_provider_ids(TEXT, TEXT[]) IS
  'Webhook/service-role: map Stripe charge/payment_intent/invoice ids to the checkout grant.';
REVOKE ALL ON FUNCTION public.billing_release_checkout_intents(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_release_checkout_intents(UUID, TEXT, TEXT) TO service_role;
COMMENT ON FUNCTION public.billing_release_checkout_intents(UUID, TEXT, TEXT) IS
  'Webhook/service-role: unlock a clinic when the provider rejects, expires, or refunds a checkout.';
REVOKE ALL ON FUNCTION public.billing_reverse_paid_grant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_reverse_paid_grant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.billing_reverse_paid_grant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO authenticated;
COMMENT ON FUNCTION public.billing_reverse_paid_grant(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) IS
  'Expire the paid grant tied to a refund/chargeback. Matches any stored provider id. Superadmin may call without ids for a missed webhook.';
REVOKE ALL ON FUNCTION public.billing_set_own_checkout_intent_url(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_set_own_checkout_intent_url(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.billing_set_subscription_status(UUID, public.subscription_status, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_set_subscription_status(UUID, public.subscription_status, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_professional_settlement(UUID, DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_professional_settlement(UUID, DATE, DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_prescription TO authenticated;
REVOKE ALL ON FUNCTION public.create_waitlist_entry(UUID, UUID, UUID, public.appointment_type, UUID, SMALLINT[], TIME, TIME, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_waitlist_entry(UUID, UUID, UUID, public.appointment_type, UUID, SMALLINT[], TIME, TIME, INT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.dismiss_own_plan_recommendation_notice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dismiss_own_plan_recommendation_notice() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispense_prescription TO authenticated;
REVOKE ALL ON FUNCTION public.emit_plan_notification(UUID, TEXT, UUID, TEXT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_plan_notification(UUID, TEXT, UUID, TEXT, TEXT, INT) TO service_role;
COMMENT ON FUNCTION public.ensure_default_organization_subscription IS
  'Assigns trial (never legacy) to newly created organizations. Legacy is migration-only via one-time backfill.';
COMMENT ON FUNCTION public.ensure_default_organization_subscription() IS
  'Assigns trial (never legacy) to newly created organizations. Legacy is migration-only via one-time backfill.';
REVOKE ALL ON FUNCTION public.ensure_default_organization_subscription() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_check_in_status(TEXT) TO anon, authenticated;
COMMENT ON FUNCTION public.get_public_check_in_status(TEXT) IS
  'Sanitized waiting-room status for tutors on the public QR check-in page (token-scoped).';
REVOKE ALL ON FUNCTION public.get_recommendation_thresholds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recommendation_thresholds() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_prescriptions TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cash_movements(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_clinic_reminders TO authenticated;
REVOKE ALL ON FUNCTION public.list_own_addons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_own_addons() TO authenticated;
REVOKE ALL ON FUNCTION public.list_own_billing_events(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_own_billing_events(INT) TO authenticated;
REVOKE ALL ON FUNCTION public.list_own_open_checkout_intents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_own_open_checkout_intents() TO authenticated;
REVOKE ALL ON FUNCTION public.list_own_plan_recommendation_notice() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_own_plan_recommendation_notice() TO authenticated;
COMMENT ON FUNCTION public.list_own_plan_recommendation_notice() IS
  'Soft clinic upgrade notice for org managers. Hidden after clinic dismiss until fingerprint changes.';
GRANT EXECUTE ON FUNCTION public.list_owner_portal_alerts(BOOLEAN, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.list_plan_seat_limits(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_plan_seat_limits(TEXT) TO authenticated;
COMMENT ON FUNCTION public.list_plan_seat_limits(TEXT) IS
  'Seat limits of an assignable commercial plan (trial + public). Platform-admin only.';
GRANT EXECUTE ON FUNCTION public.list_professional_settlements(
  UUID,
  public.settlement_status,
  DATE,
  DATE,
  UUID,
  INTEGER,
  INTEGER
) TO authenticated;
REVOKE ALL ON FUNCTION public.list_public_addons() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_addons() TO anon, authenticated;
REVOKE ALL ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) TO service_role;
COMMENT ON FUNCTION public.list_waiting_room_statuses_for_date(DATE, UUID) IS
  'Agenda hot path: appointment_id + waiting_room_status for a single local day.';
REVOKE ALL ON FUNCTION public.list_waitlist(UUID, public.waitlist_status) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_waitlist(UUID, public.waitlist_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_owner_portal_alerts_read(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_reminder TO authenticated;
REVOKE ALL ON FUNCTION public.match_waitlist_for_slot(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, public.appointment_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_waitlist_for_slot(TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, public.appointment_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.open_cash_session TO authenticated;
REVOKE ALL ON FUNCTION public.organization_metered_overages(UUID) FROM PUBLIC;
COMMENT ON FUNCTION public.organization_metered_overages(UUID) IS
  'Internal current-month meter overages. Add-on and override limits count; unlimited and zero are skipped.';
REVOKE ALL ON FUNCTION public.prevent_unintended_legacy_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_legacy_plan_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recommendation_trends_window(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
COMMENT ON FUNCTION public.recommendation_trends_window(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Internal window aggregator for commercial trend metrics.';
REVOKE ALL ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_payment TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_payment TO authenticated;
REVOKE ALL ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) TO service_role;
COMMENT ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) IS
  'Service-role cron: expire due subscriptions and emit in-app plan notices. Does not invent trial length.';
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) TO authenticated, service_role;
COMMENT ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) IS
  'Service-role/Superadmin cron: expire due plans and add-ons, emit in-app notices including add-on renewal. Reminder days are lead time, not duration.';
REVOKE ALL ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) TO authenticated, service_role;
COMMENT ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) IS
  'Service-role/Superadmin cron: expire due plans and add-ons, emit in-app notices including paid-plan renewal. Reminder days are lead time, not duration.';
REVOKE ALL ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) TO authenticated, service_role;
COMMENT ON FUNCTION public.run_commercial_lifecycle(INT, NUMERIC, INT) IS
  'Service-role/Superadmin cron: expire due plans and add-ons, emit in-app notices including occupancy seats. Reminder days are lead time, not duration.';
GRANT EXECUTE ON FUNCTION public.save_ai_suggestion TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_ai_suggestions TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_cash_sessions TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_clinical_images TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_inventory_products TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_lab_orders TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_prescriptions TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_surgeries TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_assignee(UUID[], UUID) IS
  'Bulk assign Superadmin owner for advisory recommendations. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(UUID[], INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_commercial_snooze(UUID[], INT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_follow_up(UUID[], TIMESTAMPTZ) IS
  'Bulk set/clear follow-up dates. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_freeze(UUID[], BOOLEAN, TEXT) IS
  'Bulk freeze/unfreeze advisory recommendations. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_note(UUID[], TEXT, TEXT) IS
  'Bulk set/append/clear commercial notes. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_outcome(UUID[], TEXT, TEXT) IS
  'Bulk set/clear commercial outcomes. Max 50 orgs. Won does not auto-upgrade plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_set_plan_recommendation_tags(UUID[], TEXT[], TEXT) IS
  'Bulk tag ops. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_bulk_touch_plan_recommendation_contact(UUID[], TEXT) IS
  'Bulk register commercial contact. Max 50 orgs. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_cancel_checkout_intents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_cancel_checkout_intents(UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_cancel_checkout_intents(UUID) IS
  'Platform-admin fallback: clear stuck checkout intents so the clinic can pay again.';
REVOKE ALL ON FUNCTION public.superadmin_clear_idle_plan_recommendation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_clear_idle_plan_recommendation(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_commercial_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_commercial_summary(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_commercial_summary(INT) IS
  'Platform-admin commercial counts, including active add-ons and those ending within the reminder lead time.';
REVOKE ALL ON FUNCTION public.superadmin_commercial_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_commercial_summary(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_commercial_summary(INT) IS
  'Platform-admin commercial counts, including paid plans and add-ons ending within the reminder lead time.';
REVOKE ALL ON FUNCTION public.superadmin_commercial_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_commercial_summary(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_commercial_summary(INT) IS
  'Platform-admin commercial counts, including orgs over current seat limits.';
REVOKE ALL ON FUNCTION public.superadmin_commercial_summary(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_commercial_summary(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_commercial_summary(INT) IS
  'Platform-admin commercial counts, including orgs over current seats or monthly meters.';
REVOKE ALL ON FUNCTION public.superadmin_delete_recommendation_saved_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_recommendation_saved_view(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_end_trial(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_end_trial(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_plan_recommendation_note(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_plan_recommendation_note(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_unapplied_billing_event(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_unapplied_billing_event(UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_get_unapplied_billing_event(UUID) IS
  'Platform-admin load of one claimed webhook that still needs apply. Payload stays off the clinic list.';
REVOKE ALL ON FUNCTION public.superadmin_grant_addon(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_grant_addon(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_addons_ending_soon(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_addons_ending_soon(INT, INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_addons_ending_soon(INT, INT) IS
  'Platform-admin queue of active extras in the reminder window. Days are lead time, not duration.';
REVOKE ALL ON FUNCTION public.superadmin_list_billing_events(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_billing_events(UUID, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_checkout_intents(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_checkout_intents(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_open_checkout_intents(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_open_checkout_intents(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_open_checkout_intents(INT) IS
  'Platform-admin queue of checkouts still waiting for the provider webhook.';
COMMENT ON FUNCTION public.superadmin_list_open_checkout_intents(INT) IS
  'Platform-admin queue of checkouts still waiting for the provider webhook.';
REVOKE ALL ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_open_recommendation_pipeline(INT, BOOLEAN, TEXT) IS
  'Full open advisory pipeline with commercial meta for board/export. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_list_org_seat_usage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_org_seat_usage(UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_org_seat_usage(UUID) IS
  'Platform-admin occupancy for a clinic: users, branches, veterinarians, active patients.';
REVOKE ALL ON FUNCTION public.superadmin_list_organizations(TEXT, INT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_organizations(TEXT, INT, INT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_over_seats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_over_seats(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_orgs_over_seats(INT) IS
  'Platform-admin queue of clinics whose occupancy exceeds a finite seat limit. Legacy is ignored.';
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_over_seats(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_over_seats(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_orgs_over_seats(INT) IS
  'Platform-admin queue of clinics over a finite seat or current-month meter. Legacy is ignored.';
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_plans_ending_soon(INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_plans_ending_soon(INT, INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_plans_ending_soon(INT, INT) IS
  'Platform-admin queue of public paid plans in the reminder window. Days are lead time, not duration.';
REVOKE ALL ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) IS
  'Recent advisory commercial events across orgs. Never changes plans. Excludes noisy clinic/system refresh noise.';
REVOKE ALL ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recent_recommendation_events(INT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_recommendation_aging(TEXT, INT) IS
  'List open orgs in an aging bucket. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_assignees() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_assignees() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_by_tag(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_by_tag(TEXT, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_commercial_snoozed(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_commercial_snoozed(INT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT, UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_follow_ups(INT, UUID, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_outcomes(INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_outcomes(INT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_priority_queue(INT, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_saved_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_saved_views() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_stale(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_stale(INT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_tag_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_tag_catalog() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_list_unapplied_billing_events(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_unapplied_billing_events(INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_list_unapplied_billing_events(INT) IS
  'Platform-admin queue of billing webhooks claimed but not applied or skipped.';
REVOKE ALL ON FUNCTION public.superadmin_open_checkout_intents() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_open_checkout_intents() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_pending_billing_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_pending_billing_events() TO authenticated;
COMMENT ON FUNCTION public.superadmin_pending_billing_events() IS
  'Platform-admin count of billing events that were received but not applied.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_aging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_aging() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_aging() IS
  'Open pipeline aging buckets by commercial touch age. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_assignee_scorecard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_assignee_scorecard() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_assignee_scorecard() IS
  'Per-assignee advisory scorecard. Never changes plans. win_rate excludes deferred.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_assignee_workload() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_assignee_workload() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_assignee_workload() IS
  'Current open workload and priority pressure per assignee. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) IS
  'Advisory commercial digest for Superadmin. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_digest(INT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_recommendation_funnel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_funnel() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_funnel() IS
  'Advisory commercial funnel metrics. Never changes plans. win_rate excludes deferred.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_recommendation_tag_scorecard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_tag_scorecard() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_tag_scorecard() IS
  'Per-tag advisory scorecard. An org with multiple tags counts in each tag. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_recommendation_trends() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_recommendation_trends() TO authenticated;
COMMENT ON FUNCTION public.superadmin_recommendation_trends() IS
  'Advisory commercial flow trends (7d vs prior 7d, 30d). Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_revoke_addon(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_revoke_addon(UUID, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_search_recommendation_notes(TEXT, INT) IS
  'Search Superadmin commercial notes (note/outcome/contact/freeze). Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_set_plan_recommendation_commercial_snooze(UUID, INT, TEXT) IS
  'Snooze or clear commercial advisory item for 1–90 days. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_set_plan_recommendation_tags(UUID, TEXT[], TEXT) IS
  'Set/add/remove commercial tags on one org. Never changes plans.';
REVOKE ALL ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_skip_billing_event(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_skip_billing_event(UUID, TEXT, TEXT) TO authenticated;
COMMENT ON FUNCTION public.superadmin_skip_billing_event(UUID, TEXT, TEXT) IS
  'Platform-admin: mark a stuck webhook applied and unlock only the matching open checkout. Does not reverse a grant.';
REVOKE ALL ON FUNCTION public.superadmin_start_trial(UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_start_trial(UUID, INT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_touch_plan_recommendation_contact(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_touch_plan_recommendation_contact(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_touch_plan_recommendation_refresh(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_touch_plan_recommendation_refresh(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) TO authenticated;
COMMENT ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) IS
  'Create/update own saved commercial view. Shared views are visible to all platform admins.';
REVOKE ALL ON FUNCTION public.update_waitlist_status(UUID, public.waitlist_status, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_waitlist_status(UUID, public.waitlist_status, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_invoice TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_prescription TO authenticated;

-- ===== triggers
DROP TRIGGER IF EXISTS trg_notify_lab_order ON public.lab_orders;
CREATE TRIGGER trg_notify_lab_order
  AFTER UPDATE OF status ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_lab_order();
DROP TRIGGER IF EXISTS trg_notify_inventory_stock ON public.inventory_products;
CREATE TRIGGER trg_notify_inventory_stock
  AFTER INSERT OR UPDATE OF quantity, min_quantity, is_active ON public.inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_inventory_stock();
DROP TRIGGER IF EXISTS trg_notify_hospitalization ON public.hospitalizations;
CREATE TRIGGER trg_notify_hospitalization
  AFTER INSERT ON public.hospitalizations
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_hospitalization();
DROP TRIGGER IF EXISTS trg_notify_invoice ON public.invoices;
CREATE TRIGGER trg_notify_invoice
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_invoice();
DROP TRIGGER IF EXISTS trg_notify_prescription ON public.prescriptions;
CREATE TRIGGER trg_notify_prescription
  AFTER INSERT ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_prescription();
DROP TRIGGER IF EXISTS trg_organizations_default_subscription ON public.organizations;
CREATE TRIGGER trg_organizations_default_subscription
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_default_organization_subscription();
DROP TRIGGER IF EXISTS trg_plans_protect_legacy ON public.plans;
CREATE TRIGGER trg_plans_protect_legacy
  BEFORE INSERT OR UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_legacy_plan_catalog();
DROP TRIGGER IF EXISTS trg_organization_subscriptions_protect_legacy ON public.organization_subscriptions;
CREATE TRIGGER trg_organization_subscriptions_protect_legacy
  BEFORE INSERT OR UPDATE OF plan_id, metadata ON public.organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_unintended_legacy_assignment();

NOTIFY pgrst, 'reload schema';
