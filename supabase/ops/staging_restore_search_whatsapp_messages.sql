-- Staging only: the 'whatsapp' migration was applied without search_whatsapp_messages,
-- so /whatsapp failed (PGRST202). Same definition as 20240811000024_whatsapp.sql.

CREATE OR REPLACE FUNCTION public.search_whatsapp_messages(
  p_search TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  branch_id UUID,
  owner_id UUID,
  patient_id UUID,
  related_type public.whatsapp_related_type,
  related_id UUID,
  template_key TEXT,
  phone_e164 TEXT,
  body TEXT,
  sent_by UUID,
  owner_full_name TEXT,
  patient_name TEXT,
  sent_by_name TEXT,
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

  IF v_org_id IS NULL OR NOT public.has_permission('whatsapp:send') THEN
    RETURN;
  END IF;

  v_offset := GREATEST(p_page - 1, 0) * LEAST(GREATEST(p_page_size, 1), 100);

  RETURN QUERY
  WITH filtered AS (
    SELECT m.*
    FROM public.whatsapp_messages m
    INNER JOIN public.owners o ON o.id = m.owner_id
    WHERE m.organization_id = v_org_id
      AND m.deleted_at IS NULL
      AND (p_owner_id IS NULL OR m.owner_id = p_owner_id)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR to_tsvector(
          'spanish',
          coalesce(m.body, '') || ' ' ||
          coalesce(m.phone_e164, '') || ' ' ||
          coalesce(o.full_name, '')
        ) @@ plainto_tsquery('spanish', p_search)
        OR o.full_name ILIKE '%' || p_search || '%'
        OR m.phone_e164 ILIKE '%' || p_search || '%'
        OR m.body ILIKE '%' || p_search || '%'
      )
  ),
  counted AS (
    SELECT COUNT(*) AS cnt FROM filtered
  )
  SELECT
    f.id, f.organization_id, f.branch_id, f.owner_id, f.patient_id,
    f.related_type, f.related_id, f.template_key, f.phone_e164, f.body, f.sent_by,
    o.full_name,
    p.name,
    pr.full_name,
    f.created_at,
    c.cnt
  FROM filtered f
  CROSS JOIN counted c
  INNER JOIN public.owners o ON o.id = f.owner_id
  LEFT JOIN public.patients p ON p.id = f.patient_id
  LEFT JOIN public.profiles pr ON pr.id = f.sent_by
  ORDER BY f.created_at DESC
  LIMIT LEAST(GREATEST(p_page_size, 1), 100)
  OFFSET v_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.search_whatsapp_messages(TEXT, UUID, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_whatsapp_messages(TEXT, UUID, INT, INT) TO authenticated;

NOTIFY pgrst, 'reload schema';
