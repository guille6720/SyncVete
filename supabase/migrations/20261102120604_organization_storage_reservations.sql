BEGIN;
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
COMMIT;
