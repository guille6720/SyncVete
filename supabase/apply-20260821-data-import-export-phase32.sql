-- Data Import/Export Phase 32: org-wide id-map export (tenant-safe).
-- Read-only. Additive. Staging first. No mutations / no plan changes.

CREATE OR REPLACE FUNCTION public.own_data_migration_id_map_export(
  p_limit INT DEFAULT 50000
)
RETURNS TABLE (
  batch_id UUID,
  entity_type TEXT,
  external_id TEXT,
  internal_id UUID,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := public.get_user_organization_id();
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50000), 1), 100000);
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF NOT (
    public.has_permission('data:import')
    OR public.has_permission('data:export')
  ) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  SELECT m.batch_id, m.entity_type, m.external_id, m.internal_id, m.created_at
  FROM public.data_import_id_map m
  WHERE m.organization_id = v_org
  ORDER BY m.entity_type, m.external_id, m.created_at
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.own_data_migration_id_map_export(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_data_migration_id_map_export(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.own_data_migration_id_map_export(INT) TO service_role;

COMMENT ON FUNCTION public.own_data_migration_id_map_export(INT) IS
  'Phase 32: export org-wide data_import_id_map for cutover / forensic mapping (read-only).';
