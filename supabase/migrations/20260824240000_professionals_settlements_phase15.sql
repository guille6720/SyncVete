-- Professionals & Settlements Phase 15
-- - update_professional_settlement_adjustment
-- - filter liquidacion notifications by role / linked professional
-- STAGING FIRST. Additive.

-- ─────────────────────────────────────────────
-- Update settlement adjustment (draft/review)
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_professional_settlement_adjustment(
  p_adjustment_id UUID,
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
    RAISE EXCEPTION 'Sin permisos para editar ajustes';
  END IF;

  IF p_adjustment_id IS NULL OR p_type IS NULL OR p_amount IS NULL OR p_reason IS NULL THEN
    RAISE EXCEPTION 'adjustment_id, type, amount y reason son requeridos';
  END IF;

  v_amount := public.round_ars(p_amount);

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser positivo';
  END IF;

  IF char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'El motivo debe tener al menos 3 caracteres';
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
    RAISE EXCEPTION 'Solo se pueden editar ajustes de liquidaciones en borrador o revisión';
  END IF;

  UPDATE public.professional_settlement_adjustments
  SET
    adjustment_type = p_type,
    amount = v_amount,
    reason = btrim(p_reason)
  WHERE id = v_adjustment.id
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

GRANT EXECUTE ON FUNCTION public.update_professional_settlement_adjustment(
  UUID,
  public.settlement_adjustment_type,
  NUMERIC,
  TEXT
) TO authenticated;

-- ─────────────────────────────────────────────
-- Liquidacion notification visibility
-- Clinic href → approve; portal href → linked professional
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
  );
END;
$$;
