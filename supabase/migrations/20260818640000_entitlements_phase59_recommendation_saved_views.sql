-- Phase 59: Saved commercial filter views for Superadmin home.
-- Still NO automatic plan changes.
-- Depends on phase 31–58.

CREATE TABLE IF NOT EXISTS public.commercial_recommendation_saved_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  query_params JSONB NOT NULL DEFAULT '{}'::JSONB,
  is_shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT commercial_recommendation_saved_views_name_len
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT uq_commercial_saved_views_owner_name UNIQUE (owner_user_id, name_key)
);

CREATE INDEX IF NOT EXISTS idx_commercial_saved_views_owner
  ON public.commercial_recommendation_saved_views (owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_commercial_saved_views_shared
  ON public.commercial_recommendation_saved_views (updated_at DESC)
  WHERE is_shared = true;

ALTER TABLE public.commercial_recommendation_saved_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_recommendation_saved_views FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_recommendation_saved_views TO service_role;

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

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_saved_views() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_saved_views() TO authenticated;

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

REVOKE ALL ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) TO authenticated;

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

REVOKE ALL ON FUNCTION public.superadmin_delete_recommendation_saved_view(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_delete_recommendation_saved_view(UUID) TO authenticated;

COMMENT ON TABLE public.commercial_recommendation_saved_views IS
  'Superadmin saved commercial filter views. Never auto-changes plans.';
COMMENT ON FUNCTION public.superadmin_upsert_recommendation_saved_view(TEXT, JSONB, BOOLEAN, UUID) IS
  'Create/update own saved commercial view. Shared views are visible to all platform admins.';
