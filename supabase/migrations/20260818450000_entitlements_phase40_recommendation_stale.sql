-- Phase 40: Hide closed outcomes from active queues, reopen on fingerprint change, stale queue.
-- Still NO automatic plan changes.
-- Depends on phase 31–39.

ALTER TABLE public.commercial_recommendation_settings
  ADD COLUMN IF NOT EXISTS stale_days INT NOT NULL DEFAULT 14
    CHECK (stale_days >= 1 AND stale_days <= 180);

CREATE OR REPLACE FUNCTION public.superadmin_get_recommendation_settings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  PERFORM public.require_platform_admin();
  SELECT * INTO v_row FROM public.commercial_recommendation_settings WHERE id = 1;
  IF NOT FOUND THEN
    INSERT INTO public.commercial_recommendation_settings (id) VALUES (1)
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'stale_days', v_row.stale_days,
    'updated_at', v_row.updated_at
  );
END;
$$;

DROP FUNCTION IF EXISTS public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT);

CREATE OR REPLACE FUNCTION public.superadmin_set_recommendation_settings(
  p_threshold_info NUMERIC DEFAULT NULL,
  p_threshold_warning NUMERIC DEFAULT NULL,
  p_threshold_critical NUMERIC DEFAULT NULL,
  p_clinic_snooze_days INT DEFAULT NULL,
  p_stale_days INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID;
  v_row public.commercial_recommendation_settings%ROWTYPE;
BEGIN
  v_uid := public.require_platform_admin();

  INSERT INTO public.commercial_recommendation_settings AS s (
    id,
    threshold_info,
    threshold_warning,
    threshold_critical,
    clinic_snooze_days,
    stale_days,
    updated_at,
    updated_by
  )
  VALUES (
    1,
    COALESCE(p_threshold_info, 0.70),
    COALESCE(p_threshold_warning, 0.85),
    COALESCE(p_threshold_critical, 1.00),
    COALESCE(p_clinic_snooze_days, 14),
    COALESCE(p_stale_days, 14),
    now(),
    v_uid
  )
  ON CONFLICT (id) DO UPDATE SET
    threshold_info = COALESCE(p_threshold_info, s.threshold_info),
    threshold_warning = COALESCE(p_threshold_warning, s.threshold_warning),
    threshold_critical = COALESCE(p_threshold_critical, s.threshold_critical),
    clinic_snooze_days = COALESCE(p_clinic_snooze_days, s.clinic_snooze_days),
    stale_days = COALESCE(p_stale_days, s.stale_days),
    updated_at = now(),
    updated_by = v_uid
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'threshold_info', v_row.threshold_info,
    'threshold_warning', v_row.threshold_warning,
    'threshold_critical', v_row.threshold_critical,
    'clinic_snooze_days', v_row.clinic_snooze_days,
    'stale_days', v_row.stale_days,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_set_recommendation_settings(NUMERIC, NUMERIC, NUMERIC, INT, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.superadmin_get_recommendation_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_get_recommendation_settings() TO authenticated;


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


-- Reopen closed commercial outcomes when usage fingerprint changes on upsert.
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
  v_prev public.organization_plan_recommendations%ROWTYPE;
  v_row public.organization_plan_recommendations%ROWTYPE;
  v_event TEXT;
  v_cleared_outcome BOOLEAN := false;
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

  SELECT * INTO v_prev
  FROM public.organization_plan_recommendations
  WHERE organization_id = p_organization_id;

  IF FOUND
     AND p_status = 'recommended'
     AND v_prev.fingerprint IS DISTINCT FROM p_fingerprint
     AND v_prev.commercial_outcome IN ('won', 'lost', 'not_a_fit')
  THEN
    v_cleared_outcome := true;
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
    clinic_dismissed_at = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_at
    END,
    clinic_dismissed_fingerprint = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_fingerprint
    END,
    clinic_dismissed_by = CASE
      WHEN EXCLUDED.fingerprint IS DISTINCT FROM r.clinic_dismissed_fingerprint THEN NULL
      ELSE r.clinic_dismissed_by
    END,
    commercial_outcome = CASE
      WHEN EXCLUDED.status = 'recommended'
           AND EXCLUDED.fingerprint IS DISTINCT FROM r.fingerprint
           AND r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      THEN NULL
      ELSE r.commercial_outcome
    END,
    commercial_outcome_at = CASE
      WHEN EXCLUDED.status = 'recommended'
           AND EXCLUDED.fingerprint IS DISTINCT FROM r.fingerprint
           AND r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      THEN NULL
      ELSE r.commercial_outcome_at
    END,
    commercial_outcome_by = CASE
      WHEN EXCLUDED.status = 'recommended'
           AND EXCLUDED.fingerprint IS DISTINCT FROM r.fingerprint
           AND r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      THEN NULL
      ELSE r.commercial_outcome_by
    END,
    commercial_outcome_note = CASE
      WHEN EXCLUDED.status = 'recommended'
           AND EXCLUDED.fingerprint IS DISTINCT FROM r.fingerprint
           AND r.commercial_outcome IN ('won', 'lost', 'not_a_fit')
      THEN NULL
      ELSE r.commercial_outcome_note
    END,
    updated_at = now()
  RETURNING * INTO v_row;

  v_event := CASE
    WHEN v_prev.organization_id IS NULL AND p_status = 'recommended' THEN 'recommended'
    WHEN v_prev.status IS DISTINCT FROM p_status THEN p_status
    WHEN v_prev.fingerprint IS DISTINCT FROM p_fingerprint AND p_status = 'recommended' THEN 'reopened'
    ELSE NULL
  END;

  IF v_event IS NOT NULL THEN
    PERFORM public.append_plan_recommendation_event(
      p_organization_id,
      v_event,
      'superadmin',
      v_uid,
      p_current_plan_key,
      p_recommended_plan_key,
      p_severity,
      p_score,
      p_usage_level,
      p_reasons,
      p_fingerprint,
      NULL
    );
  END IF;

  IF v_cleared_outcome THEN
    PERFORM public.append_plan_recommendation_event(
      p_organization_id,
      'outcome_cleared',
      'superadmin',
      v_uid,
      p_current_plan_key,
      p_recommended_plan_key,
      p_severity,
      p_score,
      p_usage_level,
      p_reasons,
      p_fingerprint,
      'Closed outcome cleared after usage fingerprint change'
    );
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'recommended_plan_key', v_row.recommended_plan_key,
    'fingerprint', v_row.fingerprint,
    'clinic_dismissed_at', v_row.clinic_dismissed_at,
    'commercial_outcome', v_row.commercial_outcome,
    'outcome_reopened', v_cleared_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_upsert_plan_recommendation(UUID, TEXT, TEXT, TEXT, TEXT, INT, NUMERIC, JSONB, TEXT, NUMERIC) TO authenticated;

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
    RETURN jsonb_build_object('cleared', false, 'reason', 'not_active');
  END IF;

  IF v_prev.is_frozen THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'frozen');
  END IF;

  IF v_prev.commercial_outcome IN ('won', 'lost', 'not_a_fit') THEN
    RETURN jsonb_build_object('cleared', false, 'reason', 'closed_outcome');
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
    clinic_snooze_until = NULL,
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

CREATE OR REPLACE FUNCTION public.superadmin_list_recommendation_stale(
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  organization_id UUID,
  organization_name TEXT,
  organization_slug TEXT,
  current_plan_key TEXT,
  recommended_plan_key TEXT,
  status TEXT,
  severity TEXT,
  usage_level NUMERIC,
  last_touch_at TIMESTAMPTZ,
  stale_days INT,
  assigned_to UUID,
  assigned_email TEXT,
  commercial_outcome TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT;
  v_stale INT := 14;
BEGIN
  PERFORM public.require_platform_admin();
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100);

  SELECT s.stale_days INTO v_stale
  FROM public.commercial_recommendation_settings s
  WHERE s.id = 1;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  RETURN QUERY
  SELECT
    r.organization_id,
    o.name AS organization_name,
    o.slug AS organization_slug,
    r.current_plan_key,
    r.recommended_plan_key,
    r.status,
    r.severity,
    r.usage_level,
    COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at) AS last_touch_at,
    v_stale AS stale_days,
    r.assigned_to,
    pa.email AS assigned_email,
    r.commercial_outcome
  FROM public.organization_plan_recommendations r
  JOIN public.organizations o ON o.id = r.organization_id
  LEFT JOIN public.platform_admins pa ON pa.user_id = r.assigned_to
  WHERE o.deleted_at IS NULL
    AND r.status IN ('recommended', 'reviewed')
    AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    AND COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at)
      < timezone('utc', now()) - make_interval(days => v_stale)
  ORDER BY COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at) ASC NULLS FIRST
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_list_recommendation_stale(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_list_recommendation_stale(INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_recommendation_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_warn NUMERIC := 0.85;
  v_crit NUMERIC := 1.00;
  v_stale INT := 14;
  v_uid UUID;
BEGIN
  v_uid := public.require_platform_admin();

  SELECT threshold_warning, threshold_critical, stale_days
  INTO v_warn, v_crit, v_stale
  FROM public.commercial_recommendation_settings
  WHERE id = 1;
  IF v_warn IS NULL THEN v_warn := 0.85; END IF;
  IF v_crit IS NULL THEN v_crit := 1.00; END IF;
  IF v_stale IS NULL THEN v_stale := 14; END IF;

  SELECT jsonb_build_object(
    'upgrade_recommended', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'reviewed', COUNT(*) FILTER (WHERE r.status = 'reviewed'),
    'dismissed', COUNT(*) FILTER (WHERE r.status = 'dismissed'),
    'accepted', COUNT(*) FILTER (WHERE r.status = 'accepted'),
    'basic_to_pro', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'basic'
        AND r.recommended_plan_key = 'pro'
    ),
    'pro_to_premium', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'pro'
        AND r.recommended_plan_key = 'premium'
    ),
    'premium_to_enterprise', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'premium'
        AND r.recommended_plan_key = 'enterprise'
    ),
    'trial_conversion', COUNT(*) FILTER (
      WHERE r.status = 'recommended'
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.current_plan_key = 'trial'
    ),
    'legacy_rows', (
      SELECT COUNT(*)
      FROM public.organization_subscriptions s
      JOIN public.plans p ON p.id = s.plan_id
      WHERE p.key = 'legacy'
        AND s.cancelled_at IS NULL
        AND s.status IN ('trialing', 'active', 'past_due')
    ),
    'near_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.usage_level >= v_warn
        AND r.usage_level < v_crit
    ),
    'at_limit', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND r.usage_level >= v_crit
    ),
    'clinic_dismissed_active', COUNT(*) FILTER (
      WHERE r.clinic_dismissed_at IS NOT NULL
        AND r.clinic_dismissed_fingerprint IS NOT DISTINCT FROM r.fingerprint
        AND r.status IN ('recommended', 'reviewed')
        AND (r.clinic_snooze_until IS NULL OR r.clinic_snooze_until > timezone('utc', now()))
    ),
    'frozen', COUNT(*) FILTER (WHERE r.is_frozen = true),
    'follow_ups_open', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'follow_ups_overdue', COUNT(*) FILTER (
      WHERE r.follow_up_at IS NOT NULL
        AND r.follow_up_at < timezone('utc', now())
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'unassigned_recommended', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to IS NOT NULL
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'assigned_to_me', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND r.assigned_to = v_uid
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
    ),
    'outcome_won', COUNT(*) FILTER (WHERE r.commercial_outcome = 'won'),
    'outcome_lost', COUNT(*) FILTER (WHERE r.commercial_outcome = 'lost'),
    'outcome_deferred', COUNT(*) FILTER (WHERE r.commercial_outcome = 'deferred'),
    'outcome_not_a_fit', COUNT(*) FILTER (WHERE r.commercial_outcome = 'not_a_fit'),
    'stale_open', COUNT(*) FILTER (
      WHERE r.status IN ('recommended', 'reviewed')
        AND (r.commercial_outcome IS NULL OR r.commercial_outcome = 'deferred')
        AND COALESCE(r.last_refreshed_at, r.recommended_at, r.updated_at)
          < timezone('utc', now()) - make_interval(days => v_stale)
    ),
    'stale_days', v_stale
  )
  INTO v_result
  FROM public.organization_plan_recommendations r;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON COLUMN public.commercial_recommendation_settings.stale_days IS
  'Days without refresh before an open recommendation is considered stale. Advisory only.';
