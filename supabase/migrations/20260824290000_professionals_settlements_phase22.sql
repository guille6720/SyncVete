-- Professionals & Settlements Phase 22
-- Return-to-draft notify + audit family filter for liquidaciones.
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- 1. Return to draft emits liquidacion notification
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
  v_prof_label TEXT;
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

  SELECT trim(COALESCE(p.last_name, '') || ', ' || COALESCE(p.first_name, ''))
  INTO v_prof_label
  FROM public.professionals p
  WHERE p.id = v_settlement.professional_id;

  PERFORM public.emit_notification(
    v_org_id,
    v_settlement.branch_id,
    'liquidacion'::public.notification_kind,
    'Liquidación devuelta a borrador',
    format(
      '%s · %s — %s · %s',
      COALESCE(v_prof_label, 'Profesional'),
      v_settlement.period_start,
      v_settlement.period_end,
      v_reason
    ),
    '/liquidaciones/' || v_settlement.id::TEXT,
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

GRANT EXECUTE ON FUNCTION public.return_professional_settlement_to_draft(UUID, TEXT) TO authenticated;

-- ─────────────────────────────────────────────
-- 2. Audit: liquidaciones_family entity filter
-- ─────────────────────────────────────────────
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
        OR COALESCE(al.old_data->>'name', '') ILIKE '%' || p_search || '%'
        OR COALESCE(al.old_data->>'full_name', '') ILIKE '%' || p_search || '%'
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

GRANT EXECUTE ON FUNCTION public.search_audit_logs TO authenticated;
