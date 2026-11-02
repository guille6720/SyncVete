BEGIN;
ALTER TABLE storage_control.write_enforcement ADD COLUMN sync_entitlements boolean NOT NULL DEFAULT false;
ALTER TABLE public.organization_storage_quotas DROP CONSTRAINT organization_storage_quotas_quota_bytes_check;
ALTER TABLE public.organization_storage_quotas ADD CONSTRAINT organization_storage_quotas_quota_bytes_check CHECK (quota_bytes >= 0);
ALTER TABLE public.organization_storage_quotas ADD COLUMN quota_unlimited boolean NOT NULL DEFAULT false;

CREATE FUNCTION storage_control.effective_capacity(target_organization uuid)
RETURNS TABLE(quota_bytes bigint, quota_unlimited boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  feature public.features%ROWTYPE;
  subscription public.organization_subscriptions%ROWTYPE;
  override_row public.organization_feature_overrides%ROWTYPE;
  plan_row public.plan_features%ROWTYPE;
  override_count bigint;
  period_open boolean := false;
  addon_count bigint;
  addon_unlimited boolean;
  addon_limit numeric;
  capacity_mb numeric := 0;
  resolved boolean := false;
BEGIN
  SELECT * INTO feature FROM public.features WHERE key = 'storage.max_mb' AND is_active;
  IF NOT FOUND THEN RETURN QUERY SELECT 0::bigint, false; RETURN; END IF;
  SELECT count(*) INTO override_count FROM public.organization_feature_overrides o
    WHERE o.organization_id = target_organization AND o.feature_id = feature.id
      AND (o.starts_at IS NULL OR o.starts_at <= now()) AND (o.ends_at IS NULL OR o.ends_at > now());
  IF override_count > 1 THEN
    RAISE EXCEPTION 'ambiguous active storage overrides' USING ERRCODE = '23514';
  END IF;
  IF override_count = 1 THEN
    SELECT * INTO override_row FROM public.organization_feature_overrides o
      WHERE o.organization_id = target_organization AND o.feature_id = feature.id
        AND (o.starts_at IS NULL OR o.starts_at <= now()) AND (o.ends_at IS NULL OR o.ends_at > now());
    capacity_mb := CASE WHEN coalesce(override_row.enabled, true)
      THEN coalesce(override_row.limit_value, feature.default_limit) ELSE 0 END;
    resolved := true;
  ELSE
    SELECT * INTO subscription FROM public.organization_subscriptions s
      WHERE s.organization_id = target_organization AND s.status::text IN ('trialing','active','past_due')
        AND s.cancelled_at IS NULL ORDER BY s.created_at DESC LIMIT 1;
    IF FOUND THEN
      period_open := CASE WHEN subscription.status::text = 'trialing'
        THEN subscription.trial_ends_at IS NULL OR subscription.trial_ends_at > now()
        ELSE subscription.ends_at IS NULL OR subscription.ends_at > now() END;
    END IF;
    IF period_open THEN
      SELECT * INTO plan_row FROM public.plan_features p WHERE p.plan_id = subscription.plan_id AND p.feature_id = feature.id;
      SELECT count(*), coalesce(bool_or(af.limit_value IS NULL),false), max(af.limit_value)
        INTO addon_count, addon_unlimited, addon_limit
        FROM public.organization_addons g JOIN public.addons a ON a.id = g.addon_id AND a.is_active
        JOIN public.addon_features af ON af.addon_id = g.addon_id
        WHERE g.organization_id = target_organization AND af.feature_id = feature.id AND af.enabled
          AND g.status::text = 'active' AND g.cancelled_at IS NULL
          AND (g.starts_at IS NULL OR g.starts_at <= now()) AND (g.ends_at IS NULL OR g.ends_at > now());
      IF coalesce(plan_row.enabled,false) OR addon_count > 0 THEN
        IF (coalesce(plan_row.enabled,false) AND plan_row.limit_value IS NULL) OR addon_unlimited THEN
          capacity_mb := NULL;
        ELSE
          capacity_mb := CASE WHEN NOT coalesce(plan_row.enabled,false) THEN addon_limit
            WHEN addon_count = 0 THEN plan_row.limit_value ELSE greatest(plan_row.limit_value,addon_limit) END;
        END IF;
        resolved := true;
      ELSIF plan_row.id IS NOT NULL AND NOT plan_row.enabled THEN
        capacity_mb := 0;
        resolved := true;
      END IF;
    END IF;
  END IF;
  IF NOT resolved THEN capacity_mb := CASE WHEN feature.default_enabled THEN feature.default_limit ELSE 0 END; END IF;
  IF capacity_mb IS NULL THEN
    RETURN QUERY SELECT 9007199254740991::bigint, true;
  ELSE
    IF capacity_mb < 0 OR capacity_mb::text IN ('NaN','Infinity','-Infinity')
      OR floor(capacity_mb * 1048576) > 9007199254740991 THEN
      RAISE EXCEPTION 'invalid storage entitlement capacity' USING ERRCODE = '23514';
    END IF;
    RETURN QUERY SELECT floor(capacity_mb * 1048576)::bigint, false;
  END IF;
END;
$$;

CREATE FUNCTION storage_control.refresh_quota(target_organization uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  capacity record;
BEGIN
  IF coalesce((SELECT sync_entitlements FROM storage_control.write_enforcement WHERE singleton),false) THEN
    INSERT INTO public.organization_storage_quotas(organization_id,quota_bytes) VALUES(target_organization,0)
      ON CONFLICT (organization_id) DO NOTHING;
    PERFORM 1 FROM public.organization_storage_quotas WHERE organization_id = target_organization FOR UPDATE;
    SELECT * INTO capacity FROM storage_control.effective_capacity(target_organization);
    UPDATE public.organization_storage_quotas SET quota_bytes = capacity.quota_bytes, quota_unlimited = capacity.quota_unlimited
      WHERE organization_id = target_organization;
  ELSE
    PERFORM 1 FROM public.organization_storage_quotas WHERE organization_id = target_organization FOR UPDATE;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION storage_control.effective_capacity(uuid), storage_control.refresh_quota(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reserve_organization_storage(
  target_organization uuid, target_bucket text, target_path text, requested_bytes bigint, requested_sha256 text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  capacity bigint;
  observed numeric;
  reserved numeric;
  reservation_id uuid;
  existing public.organization_storage_reservations%ROWTYPE;
BEGIN
  IF requested_bytes IS NULL OR requested_bytes <= 0
    OR requested_sha256 IS NULL OR requested_sha256 !~ '^[a-f0-9]{64}$'
    OR target_bucket IS NULL OR target_bucket NOT IN ('clinical-images','patient-photos','data-migration')
    OR target_path IS NULL OR split_part(target_path, '/', 1) <> target_organization::text
    OR target_organization IS NULL THEN
    RAISE EXCEPTION 'invalid storage reservation' USING ERRCODE = '22023';
  END IF;
  PERFORM storage_control.refresh_quota(target_organization);
  SELECT quota_bytes INTO capacity FROM public.organization_storage_quotas
    WHERE organization_id = target_organization FOR UPDATE;
  IF capacity IS NULL THEN RAISE EXCEPTION 'storage quota not configured' USING ERRCODE = '23514'; END IF;
  SELECT * INTO existing FROM public.organization_storage_reservations
    WHERE bucket_id = target_bucket AND object_path = target_path;
  IF FOUND THEN
    IF existing.organization_id <> target_organization OR existing.bytes <> requested_bytes
      OR existing.content_sha256 IS DISTINCT FROM requested_sha256 THEN
      RAISE EXCEPTION 'storage idempotency conflict' USING ERRCODE = '23514';
    END IF;
    IF existing.completed_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = target_bucket AND name = target_path
    ) THEN RAISE EXCEPTION 'completed storage object missing; use a new path' USING ERRCODE = '23514'; END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = target_bucket AND name = target_path) THEN
    RAISE EXCEPTION 'storage path already exists' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE split_part(name,'/',1) = target_organization::text
    AND (metadata->>'size' IS NULL OR metadata->>'size' !~ '^[0-9]+$')) THEN
    RAISE EXCEPTION 'storage measurement incomplete' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum((metadata->>'size')::numeric),0) INTO observed FROM storage.objects
    WHERE split_part(name,'/',1) = target_organization::text;
  SELECT coalesce(sum(bytes),0) INTO reserved FROM public.organization_storage_reservations
    WHERE organization_id = target_organization AND completed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects object
        WHERE object.bucket_id = organization_storage_reservations.bucket_id
          AND object.name = organization_storage_reservations.object_path
          AND object.metadata->>'size' ~ '^[0-9]+$'
          AND (object.metadata->>'size')::numeric = organization_storage_reservations.bytes);
  IF observed + reserved + requested_bytes > capacity THEN
    RAISE EXCEPTION 'storage quota exceeded' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.organization_storage_reservations(organization_id,bucket_id,object_path,bytes,content_sha256)
    VALUES(target_organization,target_bucket,target_path,requested_bytes,requested_sha256) RETURNING id INTO reservation_id;
  RETURN reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_own_storage_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  organization uuid;
  quota bigint;
  unlimited boolean;
  used numeric;
  pending numeric;
  unknown_sizes bigint;
  breakdown jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  organization := public.get_user_organization_id();
  IF organization IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM storage_control.refresh_quota(organization);
  SELECT q.quota_bytes, q.quota_unlimited INTO quota, unlimited FROM public.organization_storage_quotas q WHERE q.organization_id = organization;
  SELECT sum(bytes), sum(missing), jsonb_object_agg(bucket_id, bytes) INTO used, unknown_sizes, breakdown
    FROM (SELECT bucket_id,
      coalesce(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::numeric ELSE 0 END),0) AS bytes,
      count(*) FILTER (WHERE metadata->>'size' IS NULL OR metadata->>'size' !~ '^[0-9]+$') AS missing
      FROM storage.objects WHERE split_part(name,'/',1) = organization::text GROUP BY bucket_id) buckets;
  SELECT coalesce(sum(r.bytes),0) INTO pending FROM public.organization_storage_reservations r
    WHERE r.organization_id = organization AND r.completed_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = r.bucket_id AND o.name = r.object_path
        AND o.metadata->>'size' ~ '^[0-9]+$' AND (o.metadata->>'size')::numeric = r.bytes);
  RETURN jsonb_build_object('usedBytes',coalesce(used,0),'pendingBytes',pending,
    'committedBytes',coalesce(used,0)+pending,'quotaBytes',CASE WHEN unlimited THEN NULL ELSE quota END,
    'quotaUnlimited',coalesce(unlimited,false),'unknownSizes',coalesce(unknown_sizes,0),
    'buckets',coalesce(breakdown,'{}'::jsonb),'measuredAt',clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_organization_storage(uuid,text,text,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_organization_storage(uuid,text,text,bigint,text) TO service_role;
REVOKE ALL ON FUNCTION public.get_own_storage_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_own_storage_status() TO authenticated;
COMMIT;
