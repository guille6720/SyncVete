BEGIN;
CREATE SCHEMA storage_control;
REVOKE ALL ON SCHEMA storage_control FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA storage_control TO authenticated;

CREATE TABLE storage_control.writer_identity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id)
);
ALTER TABLE storage_control.writer_identity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON storage_control.writer_identity FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO storage_control.writer_identity(user_id)
SELECT id FROM auth.users WHERE email = 'storage-writer-20261102@example.invalid'
  AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL;
DO $$ BEGIN
  IF (SELECT count(*) FROM storage_control.writer_identity) <> 1 THEN
    RAISE EXCEPTION 'confirmed staging storage writer missing or ambiguous';
  END IF;
END $$;

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
COMMIT;
