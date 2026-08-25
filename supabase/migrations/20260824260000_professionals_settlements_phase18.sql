-- Professionals & Settlements Phase 18
-- Include voided payments in get_professional_settlement (SECURITY DEFINER)
-- STAGING FIRST. Additive.

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
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.paid_at, p.created_at)
      FROM public.professional_payments p
      WHERE p.settlement_id = v_settlement.id
    ), '[]'::jsonb)
  );
END;
$$;
