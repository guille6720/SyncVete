-- Pegar en Supabase → SQL Editor → Run (Production).
-- Corrige Superadmin: column reference "id" is ambiguous
-- Causa: WHERE id = 1 dentro de superadmin_list_orgs_recommendation_inputs
--        (RETURNS TABLE incluye columna id).
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
        OR (p_upgrade_filter = 'upgrade_recommended' AND rec.status = 'recommended' AND (rec.commercial_outcome IS NULL OR rec.commercial_outcome = 'deferred'))
        OR (p_upgrade_filter = 'closed_outcome' AND rec.commercial_outcome IN ('won', 'lost', 'not_a_fit'))
        OR (p_upgrade_filter = 'stale' AND rec.status IN ('recommended', 'reviewed') AND (rec.commercial_outcome IS NULL OR rec.commercial_outcome = 'deferred') AND COALESCE(rec.last_refreshed_at, rec.recommended_at, rec.updated_at) < timezone('utc', now()) - make_interval(days => COALESCE((SELECT crs.stale_days FROM public.commercial_recommendation_settings crs WHERE crs.id = 1), 14)))
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

