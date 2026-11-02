BEGIN;
CREATE POLICY storage_reserved_insert_only ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id NOT IN ('clinical-images', 'patient-photos', 'data-migration'));

CREATE POLICY storage_reserved_update_only ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon, authenticated
USING (bucket_id NOT IN ('clinical-images', 'patient-photos', 'data-migration'))
WITH CHECK (bucket_id NOT IN ('clinical-images', 'patient-photos', 'data-migration'));
COMMIT;
