-- Tutorial / Academia progress (staging-first).
-- DO NOT apply to production until reviewed.
-- Tracks per-user, per-organization progress for interactive tutorials.

CREATE TABLE IF NOT EXISTS public.tutorial_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutorial_id TEXT NOT NULL,
  tutorial_version INT NOT NULL CHECK (tutorial_version > 0),
  current_step INT NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tutorial_progress_org_user_tutorial
    UNIQUE (organization_id, user_id, tutorial_id)
);

CREATE INDEX IF NOT EXISTS idx_tutorial_progress_org_user
  ON public.tutorial_progress (organization_id, user_id);

ALTER TABLE public.tutorial_progress ENABLE ROW LEVEL SECURITY;

-- Helpers assume existing session org resolution used elsewhere in SyncVete.
CREATE OR REPLACE FUNCTION public.tutorial_progress_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bm.organization_id
  FROM public.branch_members bm
  WHERE bm.user_id = auth.uid()
    AND bm.is_active IS TRUE
    AND bm.deleted_at IS NULL
  ORDER BY bm.created_at ASC
  LIMIT 1;
$$;

DROP POLICY IF EXISTS tutorial_progress_select_own_org ON public.tutorial_progress;
CREATE POLICY tutorial_progress_select_own_org
  ON public.tutorial_progress
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    AND organization_id = public.tutorial_progress_org_id()
  );

DROP POLICY IF EXISTS tutorial_progress_insert_own ON public.tutorial_progress;
CREATE POLICY tutorial_progress_insert_own
  ON public.tutorial_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.tutorial_progress_org_id()
  );

DROP POLICY IF EXISTS tutorial_progress_update_own ON public.tutorial_progress;
CREATE POLICY tutorial_progress_update_own
  ON public.tutorial_progress
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND organization_id = public.tutorial_progress_org_id()
  )
  WITH CHECK (
    user_id = auth.uid()
    AND organization_id = public.tutorial_progress_org_id()
  );

-- No DELETE for clinic users — progress is retained for analytics.

CREATE OR REPLACE FUNCTION public.upsert_tutorial_progress(
  p_tutorial_id TEXT,
  p_tutorial_version INT,
  p_current_step INT,
  p_status TEXT
)
RETURNS public.tutorial_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_uid UUID := auth.uid();
  v_row public.tutorial_progress;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  v_org := public.tutorial_progress_org_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'NO_ORGANIZATION';
  END IF;
  IF p_status NOT IN ('not_started', 'in_progress', 'completed', 'skipped') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  INSERT INTO public.tutorial_progress (
    organization_id, user_id, tutorial_id, tutorial_version,
    current_step, status, started_at, completed_at, updated_at
  ) VALUES (
    v_org, v_uid, p_tutorial_id, p_tutorial_version,
    GREATEST(p_current_step, 0), p_status, now(),
    CASE WHEN p_status IN ('completed', 'skipped') THEN now() ELSE NULL END,
    now()
  )
  ON CONFLICT (organization_id, user_id, tutorial_id) DO UPDATE SET
    tutorial_version = EXCLUDED.tutorial_version,
    current_step = EXCLUDED.current_step,
    status = EXCLUDED.status,
    completed_at = CASE
      WHEN EXCLUDED.status IN ('completed', 'skipped') THEN now()
      ELSE public.tutorial_progress.completed_at
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_tutorial_progress(p_tutorial_id TEXT)
RETURNS public.tutorial_progress
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_row public.tutorial_progress;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  v_org := public.tutorial_progress_org_id();
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.tutorial_progress tp
  WHERE tp.organization_id = v_org
    AND tp.user_id = auth.uid()
    AND tp.tutorial_id = p_tutorial_id;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.tutorial_progress_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_tutorial_progress(TEXT, INT, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_tutorial_progress(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.upsert_tutorial_progress(TEXT, INT, INT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tutorial_progress(TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
