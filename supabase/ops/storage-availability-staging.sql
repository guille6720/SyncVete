BEGIN;
CREATE TABLE public.organization_storage_quotas (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id),
  quota_bytes bigint NOT NULL CHECK (quota_bytes > 0)
);
ALTER TABLE public.organization_storage_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_storage_quotas FROM anon, authenticated;
GRANT SELECT ON public.organization_storage_quotas TO authenticated;
CREATE POLICY own_storage_quota ON public.organization_storage_quotas FOR SELECT TO authenticated
USING (organization_id = public.get_user_organization_id() AND public.has_permission('org:manage'));

INSERT INTO public.organization_storage_quotas (organization_id, quota_bytes)
SELECT organizations.id, CASE plan.key
  WHEN 'pro' THEN 10000000000::bigint
  WHEN 'premium' THEN 30000000000::bigint
  ELSE 2000000000::bigint END
FROM public.organizations
LEFT JOIN LATERAL (
  SELECT plans.key FROM public.organization_subscriptions subscriptions
  JOIN public.plans ON plans.id = subscriptions.plan_id
  WHERE subscriptions.organization_id = organizations.id
    AND subscriptions.status::text IN ('active','trialing')
    AND subscriptions.starts_at <= now()
    AND (subscriptions.ends_at IS NULL OR subscriptions.ends_at > now())
  ORDER BY subscriptions.created_at DESC, subscriptions.id DESC LIMIT 1
) plan ON true;

CREATE FUNCTION public.get_own_storage_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  organization uuid;
  quota bigint;
  used bigint;
  unknown_sizes bigint;
  breakdown jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission('org:manage') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  organization := public.get_user_organization_id();
  IF organization IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT q.quota_bytes INTO quota FROM public.organization_storage_quotas q
  WHERE q.organization_id = organization;
  SELECT sum(bytes), sum(missing), jsonb_object_agg(bucket_id, bytes)
  INTO used, unknown_sizes, breakdown
  FROM (
    SELECT bucket_id,
      coalesce(sum(CASE WHEN metadata->>'size' ~ '^[0-9]+$' THEN (metadata->>'size')::bigint ELSE 0 END),0) AS bytes,
      count(*) FILTER (WHERE metadata->>'size' IS NULL OR metadata->>'size' !~ '^[0-9]+$') AS missing
    FROM storage.objects
    WHERE split_part(name, '/', 1) = organization::text
    GROUP BY bucket_id
  ) buckets;
  RETURN jsonb_build_object('usedBytes', coalesce(used,0), 'quotaBytes', quota,
    'unknownSizes', coalesce(unknown_sizes,0), 'buckets', coalesce(breakdown,'{}'::jsonb),
    'measuredAt', clock_timestamp());
END;
$$;
REVOKE ALL ON FUNCTION public.get_own_storage_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_storage_status() TO authenticated;
COMMIT;
