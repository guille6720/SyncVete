-- Data Import/Export Phase 8: commercial feature gate + superadmin ops queue.
-- Additive. Staging first. Enables data.import_export on all plans by default
-- so existing clinics keep access; Superadmin can override off.

INSERT INTO public.features (key, name, description, feature_type, default_enabled, usage_metered)
VALUES (
  'data.import_export',
  'Importar / Exportar',
  'Migración de datos clínicos (import CSV/ZIP y export)',
  'boolean',
  true,
  false
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  feature_type = EXCLUDED.feature_type,
  default_enabled = EXCLUDED.default_enabled,
  usage_metered = EXCLUDED.usage_metered,
  is_active = true,
  updated_at = now();

-- Seed on every active plan (including trial/basic). Kill-switch via override only.
-- Note: public._seed_plan_feature was dropped after entitlements phase 1; seed inline.
INSERT INTO public.plan_features (plan_id, feature_id, enabled, limit_value)
SELECT p.id, f.id, true, NULL
FROM public.plans p
CROSS JOIN public.features f
WHERE p.is_active
  AND f.key = 'data.import_export'
ON CONFLICT (plan_id, feature_id) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  limit_value = EXCLUDED.limit_value,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.superadmin_data_migration_ops_queue(p_limit INTEGER DEFAULT 40)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 40), 100));
  v_imports JSONB;
  v_exports JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_imports
  FROM (
    SELECT
      b.id,
      b.organization_id,
      o.name AS organization_name,
      b.import_type,
      b.status,
      b.source_filename,
      b.source_system,
      b.imported_records,
      b.failed_records,
      b.progress_message,
      b.error_message,
      b.idempotency_mode,
      b.created_at,
      b.queued_at,
      b.completed_at
    FROM public.data_import_batches b
    JOIN public.organizations o ON o.id = b.organization_id
    WHERE b.status IN ('queued', 'importing', 'failed', 'partial')
       OR (b.status = 'completed' AND b.failed_records > 0)
    ORDER BY
      CASE b.status
        WHEN 'failed' THEN 0
        WHEN 'importing' THEN 1
        WHEN 'queued' THEN 2
        WHEN 'partial' THEN 3
        ELSE 4
      END,
      b.created_at DESC
    LIMIT v_limit
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  INTO v_exports
  FROM (
    SELECT
      j.id,
      j.organization_id,
      o.name AS organization_name,
      j.export_type,
      j.format,
      j.status,
      j.progress_message,
      j.error_message,
      j.created_at,
      j.completed_at,
      j.expires_at
    FROM public.data_export_jobs j
    JOIN public.organizations o ON o.id = j.organization_id
    WHERE j.status IN ('queued', 'running', 'failed')
    ORDER BY
      CASE j.status
        WHEN 'failed' THEN 0
        WHEN 'running' THEN 1
        WHEN 'queued' THEN 2
        ELSE 3
      END,
      j.created_at DESC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object(
    'imports', v_imports,
    'exports', v_exports,
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_data_migration_ops_queue(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_data_migration_ops_queue(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_data_migration_ops_queue(INTEGER) TO service_role;
