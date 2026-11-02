BEGIN;
DO $bootstrap$
BEGIN
  IF to_regclass('public.organization_storage_quotas') IS NOT NULL
    OR to_regclass('public.organization_storage_reservations') IS NOT NULL
    OR to_regnamespace('storage_control') IS NOT NULL THEN
    RAISE EXCEPTION 'storage schema already exists; inspect migration history before bootstrap';
  END IF;
END;
$bootstrap$;
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
CREATE TABLE public.organization_storage_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  bucket_id text NOT NULL,
  object_path text NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, object_path),
  CHECK (split_part(object_path, '/', 1) = organization_id::text)
);
ALTER TABLE public.organization_storage_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_storage_reservations FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reserve_organization_storage(
  target_organization uuid, target_bucket text, target_path text, requested_bytes bigint,
  requested_sha256 text
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
  SELECT quota_bytes INTO capacity FROM public.organization_storage_quotas
    WHERE organization_id = target_organization FOR UPDATE;
  IF capacity IS NULL THEN
    RAISE EXCEPTION 'storage quota not configured' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO existing FROM public.organization_storage_reservations
    WHERE bucket_id = target_bucket AND object_path = target_path;
  IF FOUND THEN
    IF existing.organization_id <> target_organization OR existing.bytes <> requested_bytes
      OR existing.content_sha256 IS DISTINCT FROM requested_sha256 THEN
      RAISE EXCEPTION 'storage idempotency conflict' USING ERRCODE = '23514';
    END IF;
    IF existing.completed_at IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = target_bucket AND name = target_path
    ) THEN
      RAISE EXCEPTION 'completed storage object missing; use a new path' USING ERRCODE = '23514';
    END IF;
    RETURN existing.id;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = target_bucket AND name = target_path) THEN
    RAISE EXCEPTION 'storage path already exists' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects
    WHERE split_part(name,'/',1) = target_organization::text
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

CREATE FUNCTION public.complete_organization_storage(reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  target_organization uuid;
  completed boolean;
BEGIN
  SELECT organization_id INTO target_organization FROM public.organization_storage_reservations
    WHERE id = reservation_id;
  IF target_organization IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM public.organization_storage_quotas
    WHERE organization_id = target_organization FOR UPDATE;
  UPDATE public.organization_storage_reservations reservation SET completed_at = coalesce(completed_at, now())
    WHERE reservation.id = reservation_id AND EXISTS (
      SELECT 1 FROM storage.objects object WHERE object.bucket_id = reservation.bucket_id
      AND object.name = reservation.object_path AND object.metadata->>'size' ~ '^[0-9]+$'
      AND (object.metadata->>'size')::numeric = reservation.bytes
    );
  completed := FOUND;
  RETURN completed;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_organization_storage(uuid,text,text,bigint,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_organization_storage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_organization_storage(uuid,text,text,bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_organization_storage(uuid) TO service_role;
CREATE SCHEMA storage_control;
REVOKE ALL ON SCHEMA storage_control FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage_control TO authenticated;

CREATE TABLE storage_control.writer_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id)
);
ALTER TABLE storage_control.writer_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage_control.writer_identity FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION storage_control.is_writer() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM storage_control.writer_identity WHERE user_id = auth.uid()
  );
$$;
CREATE FUNCTION storage_control.can_insert(target_bucket text, target_path text, object_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT storage_control.is_writer()
    AND target_bucket IN ('clinical-images','patient-photos','data-migration')
    AND EXISTS (
      SELECT 1 FROM public.organization_storage_reservations reservation
      WHERE reservation.bucket_id = target_bucket AND reservation.object_path = target_path
        AND reservation.completed_at IS NULL
        AND reservation.bytes = CASE
          WHEN object_metadata ? 'size' THEN CASE
            WHEN object_metadata->>'size' ~ '^[0-9]+$' THEN (object_metadata->>'size')::numeric
          END
          WHEN object_metadata->>'contentLength' ~ '^[0-9]+$' THEN (object_metadata->>'contentLength')::numeric
        END
    );
$$;
CREATE FUNCTION storage_control.can_read(target_bucket text, target_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT storage_control.is_writer() AND EXISTS (
    SELECT 1 FROM public.organization_storage_reservations
    WHERE bucket_id = target_bucket AND object_path = target_path
  );
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA storage_control FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA storage_control TO authenticated;

CREATE POLICY storage_writer_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (storage_control.can_insert(bucket_id, name, metadata));
CREATE POLICY storage_writer_insert_boundary ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT (SELECT storage_control.is_writer()) OR storage_control.can_insert(bucket_id, name, metadata));
CREATE POLICY storage_writer_read ON storage.objects FOR SELECT TO authenticated
USING (storage_control.can_read(bucket_id, name));
CREATE POLICY storage_writer_read_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT (SELECT storage_control.is_writer()) OR storage_control.can_read(bucket_id, name));
CREATE POLICY storage_writer_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT (SELECT storage_control.is_writer())) WITH CHECK (NOT (SELECT storage_control.is_writer()));
CREATE POLICY storage_writer_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT (SELECT storage_control.is_writer()));
CREATE INDEX organization_storage_reservations_pending_org
ON public.organization_storage_reservations(organization_id) WHERE completed_at IS NULL;
CREATE TABLE storage_control.write_enforcement (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE storage_control.enforced_organizations (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id)
);
ALTER TABLE storage_control.write_enforcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_control.enforced_organizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage_control.write_enforcement, storage_control.enforced_organizations FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO storage_control.write_enforcement(singleton,enabled) VALUES (true,false);

CREATE FUNCTION storage_control.enforces_path(object_path text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT enabled FROM storage_control.write_enforcement WHERE singleton),false)
    OR EXISTS (SELECT 1 FROM storage_control.enforced_organizations
      WHERE organization_id::text = split_part(object_path,'/',1));
$$;
CREATE FUNCTION storage_control.guard_object_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  old_guarded boolean := false;
  new_guarded boolean;
  target_organization uuid;
  actual_bytes numeric;
BEGIN
  new_guarded := NEW.bucket_id IN ('clinical-images','patient-photos','data-migration')
    AND storage_control.enforces_path(NEW.name);
  IF TG_OP = 'UPDATE' THEN
    old_guarded := OLD.bucket_id IN ('clinical-images','patient-photos','data-migration')
      AND storage_control.enforces_path(OLD.name);
  END IF;
  IF NOT coalesce(old_guarded,false) AND NOT coalesce(new_guarded,false) THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF old_guarded AND (to_jsonb(NEW) - 'updated_at' - 'last_accessed_at')
      IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'last_accessed_at') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'reserved storage objects are immutable; use a new path' USING ERRCODE = '42501';
  END IF;
  BEGIN
    target_organization := split_part(NEW.name,'/',1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid reserved storage path' USING ERRCODE = '22023';
  END;
  actual_bytes := CASE
    WHEN NEW.metadata ? 'size' THEN CASE
      WHEN NEW.metadata->>'size' ~ '^[0-9]+$' THEN (NEW.metadata->>'size')::numeric END
    WHEN NEW.metadata->>'contentLength' ~ '^[0-9]+$' THEN (NEW.metadata->>'contentLength')::numeric
  END;
  IF actual_bytes IS NULL OR actual_bytes <= 0 THEN
    RAISE EXCEPTION 'reserved storage size required' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.organization_storage_quotas
    WHERE organization_id = target_organization FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'storage quota not configured' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public.organization_storage_reservations
    WHERE organization_id = target_organization AND bucket_id = NEW.bucket_id
      AND object_path = NEW.name AND bytes = actual_bytes AND completed_at IS NULL
      AND content_sha256 IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'matching pending storage reservation required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION storage_control.enforces_path(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION storage_control.guard_object_write() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER organization_storage_write_guard BEFORE INSERT OR UPDATE ON storage.objects
FOR EACH ROW EXECUTE FUNCTION storage_control.guard_object_write();
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.organization_storage_reservations, public.organization_storage_quotas FROM service_role;
CREATE FUNCTION public.get_organization_storage_guard_status(target_organization uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT storage_control.enforces_path(target_organization::text || '/');
$$;
REVOKE ALL ON FUNCTION public.get_organization_storage_guard_status(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_storage_guard_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION storage_control.enforces_path(text) TO authenticated;
CREATE POLICY storage_reserved_insert_only ON storage.objects AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration')
  OR NOT storage_control.enforces_path(name)
  OR storage_control.can_insert(bucket_id,name,metadata));
CREATE POLICY storage_reserved_anon_insert_only ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration'));
CREATE POLICY storage_reserved_update_only ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (bucket_id NOT IN ('clinical-images','patient-photos','data-migration') OR NOT storage_control.enforces_path(name))
WITH CHECK (bucket_id NOT IN ('clinical-images','patient-photos','data-migration') OR NOT storage_control.enforces_path(name));
COMMIT;

