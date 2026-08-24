-- Phase 31: Superadmin plan recommendations (visibility + manual control only).
-- NO automatic plan changes. Recommendations are advisory.

CREATE TABLE IF NOT EXISTS public.organization_plan_recommendations (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'recommended', 'reviewed', 'dismissed', 'accepted')),
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  severity TEXT NOT NULL DEFAULT 'none'
    CHECK (severity IN ('none', 'info', 'warning', 'critical')),
  score INT NOT NULL DEFAULT 0,
  usage_level NUMERIC(8, 4) NOT NULL DEFAULT 0,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  fingerprint TEXT,
  max_usage_ratio_at_dismiss NUMERIC(8, 4),
  recommended_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_plan_recs_status
  ON public.organization_plan_recommendations (status);
CREATE INDEX IF NOT EXISTS idx_org_plan_recs_recommended
  ON public.organization_plan_recommendations (recommended_plan_key)
  WHERE recommended_plan_key IS NOT NULL;

DROP TRIGGER IF EXISTS trg_org_plan_recs_updated_at ON public.organization_plan_recommendations;
CREATE TRIGGER trg_org_plan_recs_updated_at
  BEFORE UPDATE ON public.organization_plan_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.organization_plan_recommendations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_plan_recommendations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_plan_recommendations TO service_role;

-- Lightweight commercial signals (feature gate attempts). No clinical payload.
CREATE TABLE IF NOT EXISTS public.commercial_feature_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'feature_denied'
    CHECK (event_type IN ('feature_denied', 'feature_interest')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_commercial_signals_org_created
  ON public.commercial_feature_signals (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_signals_org_feature_day
  ON public.commercial_feature_signals (organization_id, feature_key, ((created_at AT TIME ZONE 'utc')::date));

ALTER TABLE public.commercial_feature_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commercial_feature_signals FROM anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.commercial_feature_signals TO authenticated, service_role;

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
  v_id UUID;
  v_today DATE;
BEGIN
  v_org := public.get_user_organization_id();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'feature required';
  END IF;
  IF p_event_type IS NULL OR p_event_type NOT IN ('feature_denied', 'feature_interest') THEN
    p_event_type := 'feature_denied';
  END IF;

  v_today := (timezone('utc', now()))::date;

  -- At most one signal per org+feature+day to avoid noise.
  SELECT s.id INTO v_id
  FROM public.commercial_feature_signals s
  WHERE s.organization_id = v_org
    AND s.feature_key = p_feature_key
    AND (s.created_at AT TIME ZONE 'utc')::date = v_today
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

-- Batched commercial snapshot for Superadmin org list (avoids N+1).
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
      false AS has_reports,
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
      false AS has_advanced_reports
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

CREATE OR REPLACE FUNCTION public.superadmin_upsert_plan_recommendation(
  p_organization_id UUID,
  p_status TEXT,
  p_current_plan_key TEXT DEFAULT NULL,
  p_recommended_plan_key TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'none',
  p_score INT DEFAULT 0,
  p_usage_level NUMERIC DEFAULT 0,
  p_reasons JSONB DEFAULT '[]'::jsonb,
  p_fingerprint TEXT DEFAULT NULL,
  p_max_usage_ratio_at_dismiss NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_row public.organization_plan_recommendations%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('none', 'recommended', 'reviewed', 'dismissed', 'accepted') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  IF p_severity IS NULL OR p_severity NOT IN ('none', 'info', 'warning', 'critical') THEN
    p_severity := 'none';
  END IF;

  INSERT INTO public.organization_plan_recommendations AS r (
    organization_id,
    status,
    current_plan_key,
    recommended_plan_key,
    severity,
    score,
    usage_level,
    reasons,
    fingerprint,
    max_usage_ratio_at_dismiss,
    recommended_at,
    reviewed_at,
    dismissed_at,
    accepted_at,
    reviewed_by,
    dismissed_by,
    accepted_by
  )
  VALUES (
    p_organization_id,
    p_status,
    p_current_plan_key,
    p_recommended_plan_key,
    p_severity,
    COALESCE(p_score, 0),
    COALESCE(p_usage_level, 0),
    COALESCE(p_reasons, '[]'::jsonb),
    p_fingerprint,
    p_max_usage_ratio_at_dismiss,
    CASE WHEN p_status = 'recommended' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'reviewed' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'dismissed' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'accepted' THEN now() ELSE NULL END,
    CASE WHEN p_status = 'reviewed' THEN v_uid ELSE NULL END,
    CASE WHEN p_status = 'dismissed' THEN v_uid ELSE NULL END,
    CASE WHEN p_status = 'accepted' THEN v_uid ELSE NULL END
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_plan_key = EXCLUDED.current_plan_key,
    recommended_plan_key = EXCLUDED.recommended_plan_key,
    severity = EXCLUDED.severity,
    score = EXCLUDED.score,
    usage_level = EXCLUDED.usage_level,
    reasons = EXCLUDED.reasons,
    fingerprint = EXCLUDED.fingerprint,
    max_usage_ratio_at_dismiss = COALESCE(EXCLUDED.max_usage_ratio_at_dismiss, r.max_usage_ratio_at_dismiss),
    recommended_at = CASE
      WHEN EXCLUDED.status = 'recommended' THEN COALESCE(r.recommended_at, now())
      ELSE r.recommended_at
    END,
    reviewed_at = CASE WHEN EXCLUDED.status = 'reviewed' THEN now() ELSE r.reviewed_at END,
    dismissed_at = CASE WHEN EXCLUDED.status = 'dismissed' THEN now() ELSE r.dismissed_at END,
    accepted_at = CASE WHEN EXCLUDED.status = 'accepted' THEN now() ELSE r.accepted_at END,
    reviewed_by = CASE WHEN EXCLUDED.status = 'reviewed' THEN v_uid ELSE r.reviewed_by END,
    dismissed_by = CASE WHEN EXCLUDED.status = 'dismissed' THEN v_uid ELSE r.dismissed_by END,
    accepted_by = CASE WHEN EXCLUDED.status = 'accepted' THEN v_uid ELSE r.accepted_by END,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'recommended_plan_key', v_row.recommended_plan_key,
    'fingerprint', v_row.fingerprint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_plan_catalog_matrix()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.require_platform_admin();
  SELECT jsonb_build_object(
    'plans', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'key', p.key,
          'name', p.name,
          'is_internal', p.is_internal,
          'is_public', p.is_public,
          'features', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'feature_key', f.key,
                'feature_name', f.name,
                'enabled', pf.enabled,
                'limit_value', pf.limit_value
              )
            )
            FROM public.plan_features pf
            JOIN public.features f ON f.id = pf.feature_id
            WHERE pf.plan_id = p.id AND f.is_active = true
          ), '[]'::jsonb)
        )
        ORDER BY p.display_order, p.key
      )
      FROM public.plans p
      WHERE p.is_active = true
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_plan_catalog_matrix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_plan_catalog_matrix() TO authenticated;

COMMENT ON TABLE public.organization_plan_recommendations IS
  'Advisory plan upgrade recommendations for Superadmin. Never auto-changes subscriptions.';
COMMENT ON TABLE public.commercial_feature_signals IS
  'Lightweight feature-denied / interest events for commercial recommendations. No clinical data.';
