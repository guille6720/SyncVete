-- Expose portal activation fields on the Tutores list so staff can
-- activate or revoke without opening each ficha.

DROP FUNCTION IF EXISTS public.search_owners(TEXT, UUID, INT, INT);

CREATE FUNCTION public.search_owners(
  p_search TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  phone_whatsapp TEXT,
  document_type TEXT,
  document_number TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  notes TEXT,
  is_active BOOLEAN,
  portal_user_id UUID,
  portal_pending_user_id UUID,
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

  IF v_org_id IS NULL OR NOT public.has_permission('patients:read') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT o.*
    FROM public.owners o
    WHERE o.organization_id = v_org_id
      AND o.deleted_at IS NULL
      AND (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR to_tsvector(
          'spanish',
          coalesce(o.full_name, '') || ' ' ||
          coalesce(o.email, '') || ' ' ||
          coalesce(o.phone, '') || ' ' ||
          coalesce(o.phone_whatsapp, '') || ' ' ||
          coalesce(o.document_number, '')
        ) @@ plainto_tsquery('spanish', p_search)
        OR o.full_name ILIKE '%' || p_search || '%'
        OR o.phone ILIKE '%' || p_search || '%'
        OR o.document_number ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id,
    f.organization_id,
    f.branch_id,
    f.full_name,
    f.email,
    f.phone,
    f.phone_whatsapp,
    f.document_type,
    f.document_number,
    f.address,
    f.city,
    f.province,
    f.postal_code,
    f.notes,
    f.is_active,
    f.portal_user_id,
    f.portal_pending_user_id,
    f.created_at,
    f.updated_at,
    f.deleted_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  ORDER BY
    (f.portal_pending_user_id IS NOT NULL) DESC,
    f.full_name ASC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_owners(TEXT, UUID, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_owners(TEXT, UUID, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
