-- Additive audit filters: keep the existing RPC available for older deployments.
-- Both functions execute with the caller's RLS policies and clinic permissions.
CREATE OR REPLACE FUNCTION public.list_audit_members()
RETURNS TABLE(user_id UUID, full_name TEXT, roles TEXT[], is_active BOOLEAN)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT p.id, p.full_name,
    array_agg(DISTINCT bm.role::TEXT ORDER BY bm.role::TEXT),
    p.is_active AND bool_or(bm.is_active)
  FROM public.branch_members bm
  JOIN public.profiles p ON p.id = bm.user_id AND p.organization_id = bm.organization_id
  WHERE bm.organization_id = (SELECT public.get_user_organization_id())
    AND (SELECT auth.uid()) IS NOT NULL
    AND (SELECT public.has_permission('audit:read'))
    AND bm.deleted_at IS NULL AND p.deleted_at IS NULL
  GROUP BY p.id, p.full_name, p.is_active
  ORDER BY p.full_name, p.id;
$$;

CREATE OR REPLACE FUNCTION public.search_audit_logs_by_member(
  p_user_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE(
  id UUID, organization_id UUID, branch_id UUID, user_id UUID,
  action TEXT, entity_type TEXT, entity_id UUID, user_full_name TEXT,
  branch_name TEXT, summary TEXT, created_at TIMESTAMPTZ, total_count BIGINT
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT al.id, al.organization_id, al.branch_id, al.user_id,
    al.action, al.entity_type, al.entity_id, pr.full_name, b.name,
    public.audit_event_summary(al.action, al.entity_type, al.old_data, al.new_data),
    al.created_at, count(*) OVER ()
  FROM public.audit_logs al
  LEFT JOIN public.profiles pr ON pr.id = al.user_id AND pr.organization_id = al.organization_id
  LEFT JOIN public.branches b ON b.id = al.branch_id AND b.organization_id = al.organization_id
  WHERE al.organization_id = (SELECT public.get_user_organization_id())
    AND (SELECT auth.uid()) IS NOT NULL
    AND (SELECT public.has_permission('audit:read'))
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND (p_action IS NULL OR btrim(p_action) = '' OR al.action = p_action)
    AND (
      p_entity_type IS NULL OR btrim(p_entity_type) = ''
      OR al.entity_type = p_entity_type
      OR (p_entity_type = 'liquidaciones_family' AND al.entity_type IN (
        'professionals', 'professional_compensation_schemes', 'professional_compensation_rules',
        'professional_settlements', 'professional_settlement_items',
        'professional_settlement_item_omissions', 'professional_settlement_adjustments',
        'professional_payments'
      ))
    )
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to IS NULL OR al.created_at < p_to)
    AND (
      p_search IS NULL OR btrim(p_search) = ''
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
  ORDER BY al.created_at DESC, al.id DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_audit_members() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_audit_logs_by_member(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_audit_members() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_audit_logs_by_member(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;
