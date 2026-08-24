-- Phase 33: Recommendation ops — reports activity signals + feature_used events.
-- Still NO automatic plan changes.
-- Depends on phase 31 + 32.

-- Allow successful module usage as a commercial signal (no clinical payload).
DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'commercial_feature_signals'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.commercial_feature_signals DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.commercial_feature_signals
  ADD CONSTRAINT commercial_feature_signals_event_type_check
  CHECK (event_type IN ('feature_denied', 'feature_interest', 'feature_used'));

CREATE OR REPLACE FUNCTION public.record_commercial_feature_signal(
  p_feature_key TEXT,
  p_event_type TEXT DEFAULT 'feature_denied'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org UUID;
  v_uid UUID;
  v_id UUID;
  v_day DATE;
BEGIN
  v_uid := auth.uid();
  v_org := public.get_user_organization_id();
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'feature required';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('feature_denied', 'feature_interest', 'feature_used') THEN
    p_event_type := 'feature_denied';
  END IF;

  v_day := (timezone('utc', now()))::date;
  SELECT s.id INTO v_id
  FROM public.commercial_feature_signals s
  WHERE s.organization_id = v_org
    AND s.feature_key = p_feature_key
    AND s.event_type = p_event_type
    AND (s.created_at AT TIME ZONE 'utc')::date = v_day
  LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.commercial_feature_signals (organization_id, feature_key, event_type)
  VALUES (v_org, p_feature_key, p_event_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_commercial_feature_signal(TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.commercial_feature_signals IS
  'Lightweight feature-denied / interest / used events for commercial recommendations. No clinical data.';

CREATE OR REPLACE FUNCTION public.superadmin_list_orgs_recommendation_inputs(
  p_search TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 25,
  p_plan_key TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_recommended_plan TEXT DEFAULT NULL,
  p_upgrade_filter TEXT DEFAULT NULL,
  p_sort TEXT DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  plan_key TEXT,
  plan_name TEXT,
  status public.subscription_status,
  trial_ends_at TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  owner_name TEXT,
  users_used BIGINT,
  branches_used BIGINT,
  professionals_used BIGINT,
  patients_used BIGINT,
  ai_used BIGINT,
  whatsapp_used BIGINT,
  storage_used BIGINT,
  has_hospitalization BOOLEAN,
  has_surgery BOOLEAN,
  has_laboratory BOOLEAN,
  has_inventory BOOLEAN,
  has_pharmacy BOOLEAN,
  has_billing BOOLEAN,
  has_cash BOOLEAN,
  has_portal BOOLEAN,
  has_reports BOOLEAN,
  has_ai BOOLEAN,
  has_whatsapp BOOLEAN,
  has_images BOOLEAN,
  has_advanced_reports BOOLEAN,
  access_attempt_features TEXT[],
  rec_status TEXT,
  rec_recommended_plan_key TEXT,
  rec_fingerprint TEXT,
  rec_dismissed_at TIMESTAMPTZ,
  rec_max_usage_ratio_at_dismiss NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page INT;
  v_size INT;
  v_q TEXT;
  v_plan TEXT;
  v_status public.subscription_status;
  v_period_start DATE;
BEGIN
  PERFORM public.require_platform_admin();
  v_page := GREATEST(COALESCE(p_page, 1), 1);
  v_size := LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
  v_q := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_plan := NULLIF(btrim(COALESCE(p_plan_key, '')), '');
  v_period_start := date_trunc('month', timezone('utc', now()))::date;

  IF p_status IS NULL OR btrim(p_status) = '' THEN
    v_status := NULL;
  ELSIF p_status IN ('trialing', 'active', 'past_due', 'cancelled', 'expired') THEN
    v_status := p_status::public.subscription_status;
  ELSE
    RAISE EXCEPTION 'invalid subscription status';
  END IF;

  RETURN QUERY
  WITH latest_sub AS (
    SELECT DISTINCT ON (s.organization_id)
      s.organization_id,
      s.status,
      s.trial_ends_at,
      s.starts_at,
      p.key AS plan_key,
      p.name AS plan_name
    FROM public.organization_subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
    ORDER BY s.organization_id, s.created_at DESC
  ),
  owners AS (
    SELECT DISTINCT ON (bm.organization_id)
      bm.organization_id,
      pr.full_name AS owner_name
    FROM public.branch_members bm
    JOIN public.profiles pr ON pr.id = bm.user_id
    WHERE bm.role = 'owner'
      AND bm.is_active = true
      AND bm.deleted_at IS NULL
      AND pr.deleted_at IS NULL
    ORDER BY bm.organization_id, bm.created_at ASC
  ),
  seats AS (
    SELECT
      o.id AS organization_id,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'users.max') AS users_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'branches.max') AS branches_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'professionals.max') AS professionals_used,
      (SELECT u.used FROM public.organization_seat_usage(o.id) u WHERE u.feature_key = 'patients.max') AS patients_used
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
  ),
  meters AS (
    SELECT
      fu.organization_id,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'ai.monthly_requests'), 0)::BIGINT AS ai_used,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'whatsapp.monthly_messages'), 0)::BIGINT AS whatsapp_used,
      COALESCE(SUM(fu.usage_count) FILTER (WHERE f.key = 'storage.max_mb'), 0)::BIGINT AS storage_used
    FROM public.feature_usage fu
    JOIN public.features f ON f.id = fu.feature_id
    WHERE fu.period_start = v_period_start
    GROUP BY fu.organization_id
  ),
  activity AS (
    SELECT
      o.id AS organization_id,
      EXISTS (
        SELECT 1 FROM public.hospitalizations h
        WHERE h.organization_id = o.id AND h.deleted_at IS NULL
      ) AS has_hospitalization,
      EXISTS (
        SELECT 1 FROM public.surgeries sg
        WHERE sg.organization_id = o.id AND sg.deleted_at IS NULL
      ) AS has_surgery,
      EXISTS (
        SELECT 1 FROM public.lab_orders lo
        WHERE lo.organization_id = o.id AND lo.deleted_at IS NULL
      ) AS has_laboratory,
      EXISTS (
        SELECT 1 FROM public.inventory_products ip
        WHERE ip.organization_id = o.id AND ip.deleted_at IS NULL
      ) AS has_inventory,
      EXISTS (
        SELECT 1 FROM public.prescriptions rx
        WHERE rx.organization_id = o.id AND rx.deleted_at IS NULL
      ) AS has_pharmacy,
      EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.organization_id = o.id AND inv.deleted_at IS NULL
      ) AS has_billing,
      EXISTS (
        SELECT 1 FROM public.cash_sessions cs
        WHERE cs.organization_id = o.id AND cs.deleted_at IS NULL
      ) AS has_cash,
      EXISTS (
        SELECT 1 FROM public.owner_portal_invites opi
        WHERE opi.organization_id = o.id
      ) AS has_portal,
      EXISTS (
        SELECT 1 FROM public.commercial_feature_signals s
        WHERE s.organization_id = o.id
          AND s.feature_key IN ('reports.basic', 'reports.advanced')
          AND s.created_at >= (timezone('utc', now()) - interval '90 days')
      ) AS has_reports,
      EXISTS (
        SELECT 1 FROM public.ai_suggestions ai
        WHERE ai.organization_id = o.id AND ai.deleted_at IS NULL
      ) AS has_ai,
      EXISTS (
        SELECT 1 FROM public.whatsapp_messages wm
        WHERE wm.organization_id = o.id AND wm.deleted_at IS NULL
      ) AS has_whatsapp,
      EXISTS (
        SELECT 1 FROM public.clinical_images ci
        WHERE ci.organization_id = o.id AND ci.deleted_at IS NULL
      ) AS has_images,
      EXISTS (
        SELECT 1 FROM public.commercial_feature_signals s
        WHERE s.organization_id = o.id
          AND s.feature_key = 'reports.advanced'
          AND s.created_at >= (timezone('utc', now()) - interval '90 days')
      ) AS has_advanced_reports
    FROM public.organizations o
    WHERE o.deleted_at IS NULL
  ),
  attempts AS (
    SELECT
      s.organization_id,
      array_agg(DISTINCT s.feature_key) AS access_attempt_features
    FROM public.commercial_feature_signals s
    WHERE s.created_at >= (timezone('utc', now()) - interval '45 days')
    GROUP BY s.organization_id
  ),
  base AS (
    SELECT
      o.id,
      o.name,
      o.slug,
      ls.plan_key,
      ls.plan_name,
      ls.status,
      ls.trial_ends_at,
      ls.starts_at,
      o.created_at,
      ow.owner_name,
      COALESCE(se.users_used, 0) AS users_used,
      COALESCE(se.branches_used, 0) AS branches_used,
      COALESCE(se.professionals_used, 0) AS professionals_used,
      COALESCE(se.patients_used, 0) AS patients_used,
      COALESCE(m.ai_used, 0) AS ai_used,
      COALESCE(m.whatsapp_used, 0) AS whatsapp_used,
      COALESCE(m.storage_used, 0) AS storage_used,
      COALESCE(a.has_hospitalization, false) AS has_hospitalization,
      COALESCE(a.has_surgery, false) AS has_surgery,
      COALESCE(a.has_laboratory, false) AS has_laboratory,
      COALESCE(a.has_inventory, false) AS has_inventory,
      COALESCE(a.has_pharmacy, false) AS has_pharmacy,
      COALESCE(a.has_billing, false) AS has_billing,
      COALESCE(a.has_cash, false) AS has_cash,
      COALESCE(a.has_portal, false) AS has_portal,
      COALESCE(a.has_reports, false) AS has_reports,
      COALESCE(a.has_ai, false) AS has_ai,
      COALESCE(a.has_whatsapp, false) AS has_whatsapp,
      COALESCE(a.has_images, false) AS has_images,
      COALESCE(a.has_advanced_reports, false) AS has_advanced_reports,
      COALESCE(at.access_attempt_features, ARRAY[]::TEXT[]) AS access_attempt_features,
      rec.status AS rec_status,
      rec.recommended_plan_key AS rec_recommended_plan_key,
      rec.fingerprint AS rec_fingerprint,
      rec.dismissed_at AS rec_dismissed_at,
      rec.max_usage_ratio_at_dismiss AS rec_max_usage_ratio_at_dismiss
    FROM public.organizations o
    LEFT JOIN latest_sub ls ON ls.organization_id = o.id
    LEFT JOIN owners ow ON ow.organization_id = o.id
    LEFT JOIN seats se ON se.organization_id = o.id
    LEFT JOIN meters m ON m.organization_id = o.id
    LEFT JOIN activity a ON a.organization_id = o.id
    LEFT JOIN attempts at ON at.organization_id = o.id
    LEFT JOIN public.organization_plan_recommendations rec ON rec.organization_id = o.id
    WHERE o.deleted_at IS NULL
      AND (p_organization_id IS NULL OR o.id = p_organization_id)
      AND (v_q IS NULL OR o.name ILIKE '%' || v_q || '%' OR o.slug ILIKE '%' || v_q || '%')
      AND (v_plan IS NULL OR ls.plan_key = v_plan)
      AND (v_status IS NULL OR ls.status = v_status)
      AND (
        p_recommended_plan IS NULL OR btrim(p_recommended_plan) = ''
        OR rec.recommended_plan_key = btrim(p_recommended_plan)
      )
      AND (
        p_upgrade_filter IS NULL OR btrim(p_upgrade_filter) = ''
        OR (p_upgrade_filter = 'upgrade_recommended' AND rec.status = 'recommended')
        OR (p_upgrade_filter = 'trial' AND ls.plan_key = 'trial')
        OR (p_upgrade_filter = 'legacy' AND ls.plan_key = 'legacy')
        OR (p_upgrade_filter = 'dismissed' AND rec.status = 'dismissed')
        OR (p_upgrade_filter = 'inactive' AND (ls.status IS NULL OR ls.status IN ('cancelled', 'expired')))
      )
  ),
  counted AS (
    SELECT b.*, COUNT(*) OVER() AS total_count
    FROM base b
  )
  SELECT
    c.id,
    c.name,
    c.slug,
    c.plan_key,
    c.plan_name,
    c.status,
    c.trial_ends_at,
    c.starts_at,
    c.created_at,
    c.owner_name,
    c.users_used,
    c.branches_used,
    c.professionals_used,
    c.patients_used,
    c.ai_used,
    c.whatsapp_used,
    c.storage_used,
    c.has_hospitalization,
    c.has_surgery,
    c.has_laboratory,
    c.has_inventory,
    c.has_pharmacy,
    c.has_billing,
    c.has_cash,
    c.has_portal,
    c.has_reports,
    c.has_ai,
    c.has_whatsapp,
    c.has_images,
    c.has_advanced_reports,
    c.access_attempt_features,
    c.rec_status,
    c.rec_recommended_plan_key,
    c.rec_fingerprint,
    c.rec_dismissed_at,
    c.rec_max_usage_ratio_at_dismiss,
    c.total_count
  FROM counted c
  ORDER BY
    CASE WHEN p_sort = 'usage_desc' THEN c.patients_used ELSE 0 END DESC,
    CASE WHEN p_sort = 'recommended_recent' THEN c.rec_dismissed_at ELSE NULL END DESC NULLS LAST,
    c.name ASC
  LIMIT v_size
  OFFSET (v_page - 1) * v_size;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_orgs_recommendation_inputs(TEXT, INT, INT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- Clear idle recommendations without invalid history event_type "none".
DO $$
DECLARE
  v_con TEXT;
BEGIN
  SELECT c.conname INTO v_con
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'organization_plan_recommendation_events'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%event_type%'
  LIMIT 1;
  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_plan_recommendation_events DROP CONSTRAINT %I', v_con);
  END IF;
END $$;

ALTER TABLE public.organization_plan_recommendation_events
  ADD CONSTRAINT organization_plan_recommendation_events_event_type_check
  CHECK (event_type IN (
    'recommended',
    'reviewed',
    'dismissed',
    'accepted',
    'reopened',
    'clinic_dismissed',
    'clinic_viewed',
    'cleared'
  ));

CREATE OR REPLACE FUNCTION public.superadmin_clear_idle_plan_recommendation(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF NOT FOUND OR v_prev.status NOT IN ('recommended', 'reviewed') THEN
    RETURN jsonb_build_object('cleared', false);
  END IF;

  UPDATE public.organization_plan_recommendations
  SET
    status = 'none',
    recommended_plan_key = NULL,
    severity = 'none',
    score = 0,
    reasons = '[]'::jsonb,
    fingerprint = NULL,
    clinic_dismissed_at = NULL,
    clinic_dismissed_fingerprint = NULL,
    clinic_dismissed_by = NULL,
    updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING * INTO v_row;

  PERFORM public.append_plan_recommendation_event(
    p_organization_id,
    'cleared',
    'superadmin',
    v_uid,
    v_prev.current_plan_key,
    v_prev.recommended_plan_key,
    v_prev.severity,
    v_prev.score,
    v_prev.usage_level,
    v_prev.reasons,
    v_prev.fingerprint,
    'Bulk refresh cleared idle recommendation'
  );

  RETURN jsonb_build_object(
    'cleared', true,
    'organization_id', v_row.organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_clear_idle_plan_recommendation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_clear_idle_plan_recommendation(UUID) TO authenticated;

